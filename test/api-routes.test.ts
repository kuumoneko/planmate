import { describe, expect, test } from "bun:test";
import path from "node:path";
import { NextRequest } from "next/server";

/**
 * API route smoke/integration tests — run WITHOUT a dev server.
 *
 * Pages Router handlers are invoked directly with a mock req/res; App Router
 * handlers with a plain Request + params. Real Mongo reads run against the
 * .env MONGODB_URI (Bun loads .env for tests). Network-bound routes
 * (SSO login, mybk live proxies, Google OAuth exchange) are only checked for
 * importability in the inventory section and never called.
 */

// Keep the offline suite deterministic: Gemini routes must see the
// "unconfigured" state even when a local .env carries a real key.
delete process.env.GOOGLE_GEMINI_API_KEY;
delete process.env.NEXT_PUBLIC_GOOGLE_GEMINI_API_KEY;
delete process.env.GEMINI_API_KEY;

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

function makeRes() {
    const res: any = { statusCode: 200, headers: {}, body: undefined };
    res.status = (c: number) => {
        res.statusCode = c;
        return res;
    };
    res.setHeader = (k: string, v: string) => {
        res.headers[k] = v;
        return res;
    };
    res.redirect = (url: string) => {
        res.body = url;
        return res;
    };
    res.json = (b: unknown) => {
        res.body = b;
        return res;
    };
    res.send = (b: unknown) => {
        res.body = b;
        return res;
    };
    return res;
}

interface PagesCall {
    method?: string;
    query?: Record<string, string | string[] | undefined>;
    body?: unknown;
}

async function callPages(
    handler: (req: any, res: any) => Promise<unknown> | unknown,
    opts: PagesCall = {}
) {
    const res = makeRes();
    const req = {
        method: opts.method ?? "GET",
        query: opts.query ?? {},
        body: opts.body ?? {},
    };
    await handler(req, res);
    return res;
}

async function callApp(
    handler: (req: NextRequest, args?: any) => Promise<Response>,
    {
        method = "POST",
        body,
        params,
        invalidJson = false,
    }: {
        method?: "GET" | "POST";
        body?: unknown;
        params?: Record<string, string>;
        invalidJson?: boolean;
    } = {}
) {
    const req = new NextRequest("http://localhost:3005/api", {
        method,
        headers: { "content-type": "application/json" },
        body: invalidJson ? "{not-json" : body === undefined ? undefined : JSON.stringify(body),
    });
    const res = await handler(req, params ? { params: Promise.resolve(params) } : undefined);
    if (!(res instanceof Response)) {
        throw new Error("handler did not return a Response");
    }
    let json: any = null;
    try {
        json = await res.clone().json();
    } catch {
        // non-JSON body (e.g. ics) — leave null
    }
    return { status: res.status, headers: res.headers, json };
}

/* ------------------------------------------------------------------ */
/* Section A — pure helpers (no I/O)                                   */
/* ------------------------------------------------------------------ */

describe("pure API helpers", () => {
    test("isDown detects outage statuses", async () => {
        const isDown = (await import("../pages/api/isDown")).default;
        expect(isDown(500)).toBe(true);
        expect(isDown(503)).toBe(true);
        expect(isDown(504)).toBe(true);
        expect(isDown(408)).toBe(true);
        expect(isDown(200)).toBe(false);
        expect(isDown(401)).toBe(false);
    });

    test("data helpers validate and parse", async () => {
        const mod = await import("../pages/api/data");
        expect(mod.isValid("x")).toBe(true);
        expect(mod.isValid("")).toBe(false);
        expect(mod.isValid(undefined)).toBe(false);
        expect(mod.parse_body('{"a":1}')).toEqual({ a: 1 });
        expect(mod.parse_body({ a: 1 })).toEqual({ a: 1 });
        expect(mod.default(new URLSearchParams("doc=schedule&mode=get"))).toEqual({
            doc: "schedule",
            mode: "get",
        });
    });

    test("create_app returns empty string for empty session (no network)", async () => {
        const create_app = (await import("../pages/api/mybk/app/app")).default;
        expect(await create_app("")).toBe("");
    });
});

/* ------------------------------------------------------------------ */
/* Section B — Pages Router routes                                     */
/* ------------------------------------------------------------------ */

describe("pages router API routes", () => {
    test("POST /api/login with empty username returns empty (no network)", async () => {
        const mod = await import("../pages/api/login");
        const res = makeRes();
        const result = await (mod.default as (req: any, res: any) => Promise<unknown>)(
            { method: "POST", query: {}, body: { username: "", password: "" } },
            res
        );
        expect(result ?? res.body ?? "").toBe("");
    });

    test("POST /api/mongodb/hcmut rejects invalid mode/doc/missing username", async () => {
        const mod = await import("../pages/api/mongodb/hcmut");
        const badMode = await callPages(mod.default, { body: { mode: "delete", doc: "user", data: {} } });
        expect(badMode.statusCode).toBe(200);
        expect(badMode.body.ok).toBe(false);

        const badDoc = await callPages(mod.default, { body: { mode: "get", doc: "nope", data: {} } });
        expect(badDoc.body.ok).toBe(false);

        const noUser = await callPages(mod.default, { body: { mode: "get", doc: "user", data: {} } });
        expect(noUser.body.ok).toBe(false);
        expect(String(noUser.body.data)).toContain("Username");
    });

    test("POST /api/mongodb/hcmut reads a real user doc (read-only)", async () => {
        const mod = await import("../pages/api/mongodb/hcmut");
        const res = await callPages(mod.default, {
            body: { doc: "user", mode: "get", data: { username: "nhat.maikuumo" } },
        });
        expect(res.body.ok).toBe(true);
        expect(res.body.data).toBeTruthy();
        expect(typeof res.body.data.name).toBe("string");
    });

    test("GET /api/mongodb/check pings Mongo", async () => {
        const mod = await import("../pages/api/mongodb/check");
        const res = await callPages(mod.default);
        expect(res.statusCode).toBe(200);
        expect(res.body.ok).toBe(true);
        expect(typeof res.body.data.pingMs).toBe("number");
        expect(typeof res.body.data.cacheDocs).toBe("number");
    });

    test("GET /api/calendar requires studentId, serves ICS for real mssv", async () => {
        const mod = await import("../pages/api/calendar/[studentId]");
        const missing = await callPages(mod.default);
        expect(missing.statusCode).toBe(400);

        const ics = await callPages(mod.default, { query: { studentId: "2510855" } });
        expect(ics.statusCode).toBe(200);
        expect(ics.headers["Content-Type"]).toContain("text/calendar");
        expect(String(ics.body)).toContain("BEGIN:VCALENDAR");
    });

    test("/api/groups GET validation + real read; POST validation", async () => {
        const mod = await import("../pages/api/groups");
        const noIdentity = await callPages(mod.default, { method: "GET" });
        expect(noIdentity.statusCode).toBe(400);
        expect(noIdentity.body.ok).toBe(false);

        const real = await callPages(mod.default, { method: "GET", query: { studentId: "2510855" } });
        expect(real.statusCode).toBe(200);
        expect(real.body.ok).toBe(true);
        expect(Array.isArray(real.body.data)).toBe(true);

        const noName = await callPages(mod.default, {
            method: "POST",
            body: { username: "nhat.maikuumo", name: "" },
        });
        expect(noName.statusCode).toBe(400);
        expect(noName.body.ok).toBe(false);

        const noProfile = await callPages(mod.default, {
            method: "POST",
            body: { username: "no-such-user-xyz", name: "Test group" },
        });
        expect(noProfile.statusCode).toBe(400);
        expect(noProfile.body.ok).toBe(false);
    });

    test("/api/groups/[id] returns 404 for unknown or malformed group id", async () => {
        const mod = await import("../pages/api/groups/[id]");
        const unknown = await callPages(mod.default, {
            query: { id: "000000000000000000000000" },
        });
        expect(unknown.statusCode).toBe(404);
        expect(unknown.body.ok).toBe(false);

        const malformed = await callPages(mod.default, { query: { id: "no-such-group-xyz" } });
        expect(malformed.statusCode).toBe(404);
        expect(malformed.body.ok).toBe(false);
    });

    test("/api/groups/[id]/free-time rejects GET and unknown groups", async () => {
        const mod = await import("../pages/api/groups/[id]/free-time");
        const wrongMethod = await callPages(mod.default, { method: "GET", query: { id: "no-such-group-xyz" } });
        expect(wrongMethod.statusCode).toBe(405);

        const unknown = await callPages(mod.default, {
            method: "POST",
            query: { id: "000000000000000000000000" },
            body: { studentId: "2510855" },
        });
        expect(unknown.statusCode).toBe(404);
    });

    test("/api/groups/[id]/members returns 404 for unknown group", async () => {
        const mod = await import("../pages/api/groups/[id]/members");
        const res = await callPages(mod.default, {
            method: "POST",
            query: { id: "000000000000000000000000" },
            body: { username: "nhat.maikuumo", email: "x@hcmut.edu.vn" },
        });
        expect(res.statusCode).toBe(404);
    });

    test("/api/groups/[id]/tasks returns 404 for unknown group", async () => {
        const mod = await import("../pages/api/groups/[id]/tasks");
        const res = await callPages(mod.default, { query: { id: "000000000000000000000000" } });
        expect(res.statusCode).toBe(404);
    });

    test("/api/mybk/api/* reject empty params without hitting the network", async () => {
        const schedule = await import("../pages/api/mybk/api/schedule");
        const s = await callPages(schedule.default, {
            body: { authorization: "", semester_id: "", student_id: "" },
        });
        expect(s.body.ok).toBe(false);

        const exam = await import("../pages/api/mybk/api/exam");
        const e = await callPages(exam.default, {
            body: { authorization: "", namhoc: "", mssv: "", hocky: "" },
        });
        expect(e.body.ok).toBe(false);

        const student = await import("../pages/api/mybk/api/student");
        const st = await callPages(student.default, { body: { authorization: "" } });
        expect(st.body.ok).toBe(false);
    });

    test("/api/google/* report unconfigured / method errors without network", async () => {
        const auth = await import("../pages/api/google/auth");
        const a = await callPages(auth.default);
        expect(a.statusCode).toBe(501);
        expect(a.body.ok).toBe(false);

        const callback = await import("../pages/api/google/callback");
        const c = await callPages(callback.default);
        expect(c.statusCode).toBe(501);

        const sync = await import("../pages/api/google/sync");
        const wrongMethod = await callPages(sync.default, { method: "GET" });
        expect(wrongMethod.statusCode).toBe(405);
        const noConfig = await callPages(sync.default, { method: "POST", body: { username: "x" } });
        expect(noConfig.statusCode).toBe(501);
    });
});

/* ------------------------------------------------------------------ */
/* Section C — App Router routes                                       */
/* ------------------------------------------------------------------ */

describe("app router API routes", () => {
    test("POST /api/chat validates input and reports unconfigured Gemini", async () => {
        const mod = await import("../app/api/chat/route");
        const invalid = await callApp(mod.POST, { invalidJson: true });
        expect(invalid.status).toBe(400);
        expect(invalid.json.ok).toBe(false);

        const empty = await callApp(mod.POST, { body: {} });
        expect(empty.status).toBe(400);
        expect(empty.json.data).toBe("message is required");

        const noGemini = await callApp(mod.POST, { body: { message: "xin chào" } });
        expect(noGemini.status).toBe(501);
        expect(noGemini.json.ok).toBe(false);
        expect(noGemini.json.intent).toBeTruthy();
    });

    test("POST /api/groups/[id]/chat validates input", async () => {
        const mod = await import("../app/api/groups/[id]/chat/route");
        const invalid = await callApp(mod.POST, {
            invalidJson: true,
            params: { id: "no-such-group-xyz" },
        });
        expect(invalid.status).toBe(400);

        const empty = await callApp(mod.POST, { body: {}, params: { id: "no-such-group-xyz" } });
        expect(empty.status).toBe(400);
        expect(empty.json.data).toBe("message is required");
    });

    test("POST /api/lms/parse validates and parses pasted content via regex", async () => {
        const mod = await import("../app/api/lms/parse/route");
        const invalid = await callApp(mod.POST, { invalidJson: true });
        expect(invalid.status).toBe(400);

        const empty = await callApp(mod.POST, { body: { text: "" } });
        expect(empty.status).toBe(400);

        const sample = [
            "CO3001 - Phân tích thiết kế hướng đối tượng",
            "- Bài tập 1 - hạn nộp lúc 23:59 ngày 15/04/2026 (10%)",
            "- Bài tập 2 - nộp ngày 30/05/2026 (0.2)",
        ].join("\n");
        const ok = await callApp(mod.POST, { body: { text: sample } });
        expect(ok.status).toBe(200);
        expect(ok.json.ok).toBe(true);
        expect(ok.json.data.source).toBe("regex");
        expect(ok.json.data.deadlineCount).toBe(2);
        expect(ok.json.data.deadlines[0]).toMatchObject({
            taskName: "Bài tập 1",
            dueDate: "2026-04-15",
            dueTime: "23:59",
            weight: 0.1,
        });
    });

    test("POST /api/lms/parse rejects images without a Gemini key", async () => {
        const mod = await import("../app/api/lms/parse/route");

        const badMime = await callApp(mod.POST, {
            body: { image: "iVBORw0KGgo=", mimeType: "text/plain" },
        });
        expect(badMime.status).toBe(400);
        expect(badMime.json.ok).toBe(false);

        const noKey = await callApp(mod.POST, {
            body: { image: "iVBORw0KGgo=", mimeType: "image/png" },
        });
        expect(noKey.status).toBe(501);
        expect(noKey.json.ok).toBe(false);
        expect(noKey.json.data).toContain("GEMINI_API_KEY");
    });

    test("POST /api/lms/remove validates and removes a deadline", async () => {
        const mod = await import("../app/api/lms/remove/route");

        const invalidJson = await callApp(mod.POST, { invalidJson: true });
        expect(invalidJson.status).toBe(400);

        const missing = await callApp(mod.POST, { body: { studentId: "x" } });
        expect(missing.status).toBe(400);
        expect(missing.json.ok).toBe(false);

        // Unknown student → empty dashboard → removal is a safe no-op.
        const unknown = await callApp(mod.POST, {
            body: {
                studentId: "no-such-user",
                courseCode: "CO3001",
                taskName: "Bài tập 1",
                dueDate: "2026-04-15",
            },
        });
        expect(unknown.status).toBe(200);
        expect(unknown.json.ok).toBe(true);
        expect(unknown.json.data.deadlineCount).toBe(0);
        expect(unknown.json.data.courseCount).toBe(0);
    });

    test("POST /api/lms/add validates and adds a manual deadline", async () => {
        const mod = await import("../app/api/lms/add/route");

        const invalidJson = await callApp(mod.POST, { invalidJson: true });
        expect(invalidJson.status).toBe(400);

        const missing = await callApp(mod.POST, { body: { studentId: "x", taskName: "BT" } });
        expect(missing.status).toBe(400);
        expect(missing.json.ok).toBe(false);

        const badDate = await callApp(mod.POST, {
            body: { studentId: "x", courseName: "CO3001", taskName: "BT", dueDate: "không phải ngày" },
        });
        expect(badDate.status).toBe(400);

        // Fake student → empty dashboard → clean deterministic add.
        const ok = await callApp(mod.POST, {
            body: {
                studentId: "no-such-user",
                courseName: "CO3001 - OOP",
                taskName: "Bài tập 1",
                dueDate: "2026-04-15",
                dueTime: "23:59",
                weight: 10,
            },
        });
        expect(ok.status).toBe(200);
        expect(ok.json.ok).toBe(true);
        expect(ok.json.data.deadlineCount).toBe(1);
        expect(ok.json.data.courseCount).toBe(1);
    });

    test("GET /api/student/[studentId] serves a dashboard payload", async () => {
        const mod = await import("../app/api/student/[studentId]/route");
        const res = await callApp(mod.GET, { method: "GET", params: { studentId: "nhat.maikuumo" } });
        expect(res.status).toBe(200);
        expect(res.json.ok).toBe(true);
        expect(res.json.data.studentId).toBe("nhat.maikuumo");
        expect(["cache", "live", "none"]).toContain(res.json.data.source);
    });
});

/* ------------------------------------------------------------------ */
/* Section D — route inventory (importability smoke)                   */
/* ------------------------------------------------------------------ */

describe("route inventory", () => {
    test("every pages/api route file exports a callable default", async () => {
        const glob = new Bun.Glob("pages/api/**/*.ts");
        const files = [...glob.scanSync()];
        expect(files.length).toBeGreaterThan(10);
        for (const file of files) {
            const mod = await import(path.resolve(process.cwd(), file));
            expect(typeof mod.default, `default export of ${file}`).toBe("function");
        }
    });

    test("every app/api route file exports a GET or POST handler", async () => {
        const glob = new Bun.Glob("app/api/**/route.ts");
        const files = [...glob.scanSync()];
        expect(files.length).toBeGreaterThan(3);
        for (const file of files) {
            const mod = await import(path.resolve(process.cwd(), file));
            expect(typeof mod.GET === "function" || typeof mod.POST === "function", file).toBe(
                true
            );
        }
    });
});
