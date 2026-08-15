import { NextRequest, NextResponse } from "next/server";
import { getMongoClient } from "@/lib/mongodb";
import ensureUserDoc from "../../../../lib/mongodb-check";
import { hasGeminiConfigured } from "@/lib/chat/gemini";
import {
    parseExamFromImage,
    parseScheduleFromImage,
} from "@/lib/import-parse";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/import/parse
 *
 * Body: { kind: "schedule" | "exam", images: [{ image, mimeType }], username, year? }
 * Parses up to 10 screenshots (jpg/png) of the mybk time-table or exam list
 * with Gemini vision, merges + dedupes the results and saves them into the
 * user's `schedule` / `exam` data doc (single write). Per-image failures are
 * reported; successes are still saved.
 */
const MAX_BODY_BYTES = 20 * 1024 * 1024;
const MAX_IMAGES = 10;

/** Map low-level Gemini/network failures to user-facing Vietnamese text. */
function friendlyError(e: unknown): string {
    const msg = e instanceof Error ? e.message : String(e);
    if (/quota|rate ?limit|429/i.test(msg)) {
        return "Gemini đang bị giới hạn lượt gọi, hãy thử lại sau vài phút";
    }
    if (/permission|denied|api.?key|401|403/i.test(msg)) {
        return "Lỗi quyền truy cập Gemini — hãy kiểm tra GEMINI_API_KEY";
    }
    if (/too large|too big|size limit|20 ?mb|resource exhausted|400/i.test(msg)) {
        return "Ảnh quá lớn đối với Gemini, hãy cắt bớt vùng thừa rồi thử lại";
    }
    if (/failed to fetch|fetch failed|ECONN|ENOTFOUND|ETIMEDOUT/i.test(msg)) {
        return "Không kết nối được dịch vụ Gemini, hãy thử lại";
    }
    return msg;
}

/**
 * Normalized comparison key: strips diacritics, case and punctuation so OCR
 * variance ("Mác-Lênin" vs "Mác - Lênin", "DL02_LêThi" vs "DL02_LênThi")
 * still dedupes.
 */
function normKey(s: unknown): string {
    return String(s ?? "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");
}

/** Merge parsed entries, dropping duplicates. */
function dedupe(items: any[], keyFn: (item: any) => string): any[] {
    const seen = new Set<string>();
    const out: any[] = [];
    for (const item of items) {
        const key = keyFn(item);
        if (!seen.has(key)) {
            seen.add(key);
            out.push(item);
        }
    }
    return out;
}

export async function POST(req: NextRequest) {
    const startedAt = Date.now();
    const contentLength = Number(req.headers.get("content-length") ?? 0);
    if (contentLength > MAX_BODY_BYTES) {
        return NextResponse.json(
            {
                ok: false,
                data: "Ảnh quá lớn (tối đa 20MB), hãy cắt bớt vùng thừa rồi thử lại",
            },
            { status: 413 }
        );
    }
    let body: any;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json(
            { ok: false, data: "Invalid JSON body" },
            { status: 400 }
        );
    }

    const kind = typeof body?.kind === "string" ? body.kind : "";
    const username =
        typeof body?.username === "string" ? body.username.trim() : "";
    const images = Array.isArray(body?.images) ? body.images : [];

    if (kind !== "schedule" && kind !== "exam") {
        return NextResponse.json(
            { ok: false, data: "kind must be schedule or exam" },
            { status: 400 }
        );
    }
    if (images.length === 0) {
        return NextResponse.json(
            { ok: false, data: "images is required" },
            { status: 400 }
        );
    }
    if (images.length > MAX_IMAGES) {
        return NextResponse.json(
            { ok: false, data: `Tối đa ${MAX_IMAGES} ảnh mỗi lần tải lên` },
            { status: 400 }
        );
    }
    for (let i = 0; i < images.length; i++) {
        const img = images[i];
        if (
            typeof img?.image !== "string" ||
            !img.image ||
            !["image/jpeg", "image/png"].includes(
                typeof img?.mimeType === "string" ? img.mimeType : ""
            )
        ) {
            return NextResponse.json(
                {
                    ok: false,
                    data: `Ảnh ${i + 1} không hợp lệ — chỉ hỗ trợ jpg/png`,
                },
                { status: 400 }
            );
        }
    }
    if (!username) {
        return NextResponse.json(
            { ok: false, data: "username is required" },
            { status: 400 }
        );
    }
    if (!hasGeminiConfigured()) {
        return NextResponse.json(
            { ok: false, data: "Chưa cấu hình GEMINI_API_KEY, không thể nhận dạng ảnh" },
            { status: 501 }
        );
    }

    try {
        const year =
            kind === "schedule"
                ? Number(body?.year) || new Date().getFullYear()
                : 0;

        const all: any[] = [];
        const errors: { index: number; message: string }[] = [];
        for (let i = 0; i < images.length; i++) {
            const { image, mimeType } = images[i];
            try {
                const parsed =
                    kind === "schedule"
                        ? await parseScheduleFromImage(image, mimeType, year)
                        : await parseExamFromImage(image, mimeType);
                if (parsed.length === 0) {
                    throw new Error(
                        kind === "schedule"
                            ? "không tìm thấy môn học trong ảnh"
                            : "không tìm thấy lịch thi trong ảnh"
                    );
                }
                all.push(...parsed);
            } catch (e) {
                errors.push({ index: i, message: friendlyError(e) });
            }
        }

        if (all.length === 0) {
            const detail = errors
                .map((e) => `Ảnh ${e.index + 1}: ${e.message}`)
                .join("; ");
            return NextResponse.json({
                ok: false,
                data: `Không thêm được dữ liệu — ${detail}`,
            });
        }

        const merged =
            kind === "schedule"
                ? dedupe(
                      all,
                      (item) =>
                          [
                              normKey(item.subject),
                              normKey(item.class),
                              normKey(item.weeks?.join(",")),
                              normKey(item.startTime),
                              normKey(item.endTime),
                              normKey(item.room),
                          ].join("|")
                  )
                : dedupe(
                      all,
                      (item) =>
                          [
                              normKey(item.subject),
                              String(item.date ?? ""),
                              normKey(item.room),
                              normKey(item.startTime),
                          ].join("|")
                  );

        const client = await getMongoClient();
        const collection = client.db("hcmut").collection("data");
        await ensureUserDoc(collection, username);
        await collection.updateOne(
            { username },
            {
                $set: { [kind === "schedule" ? "schedule" : "exam"]: merged },
                $currentDate: { updatedAt: true },
            }
        );

        const okCount = images.length - errors.length;
        const label = kind === "schedule" ? "môn học" : "lịch thi";
        let summary = `Đã thêm ${merged.length} ${label} từ ${okCount} ảnh.`;
        if (errors.length > 0) {
            summary +=
                " " +
                errors
                    .map((e) => `Ảnh ${e.index + 1}: ${e.message}`)
                    .join(" ");
        }

        console.log(
            `[api/import/parse] done in ${Date.now() - startedAt}ms kind=${kind} user=${username} images=${images.length} parsed=${all.length} merged=${merged.length} errors=${errors.length}`
        );
        return NextResponse.json({
            ok: true,
            data: {
                kind,
                count: merged.length,
                total: all.length,
                errors,
                summary,
            },
        });
    } catch (error) {
        console.error(
            `[api/import/parse] failed after ${Date.now() - startedAt}ms:`,
            error
        );
        return NextResponse.json(
            {
                ok: false,
                data: friendlyError(error),
            },
            { status: 500 }
        );
    }
}