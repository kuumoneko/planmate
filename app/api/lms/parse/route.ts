import { NextRequest, NextResponse } from "next/server";
import { hasGeminiConfigured } from "@/lib/chat/gemini";
import { parseDeadlinesFromImage, parseLmsMarkdown } from "@/lib/lms-parse";
import type { LmsCourse } from "@/types";
import { applyLmsCourses, loadStudentDashboard, saveStudentDashboard } from "@/lib/student-dashboard";
import { groupByCourse } from "../../../../lib/lms/mapping";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/lms/parse
 *
 * Body: { text, studentId? } | { image, mimeType, studentId? }
 * Parses pasted/uploaded LMS content (Gemini structured output, regex
 * fallback for text; Gemini vision for images) and — when `studentId` is
 * given — merges the resulting deadlines into that student's dashboard cache.
 */
export async function POST(req: NextRequest) {
    const startedAt = Date.now();
    let body: any;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ ok: false, data: "Invalid JSON body" }, { status: 400 });
    }

    const studentId = typeof body?.studentId === "string" ? body.studentId.trim() : "";
    const image = typeof body?.image === "string" ? body.image : "";
    const mimeType = typeof body?.mimeType === "string" ? body.mimeType : "";
    const input = image ? "image" : "text";
    console.log(
        `[api/lms/parse] start input=${input} chars=${String(body?.text ?? "").length} student=${studentId || "-"}`
    );

    if (image) {
        if (!["image/jpeg", "image/png"].includes(mimeType)) {
            return NextResponse.json(
                { ok: false, data: "Chỉ hỗ trợ ảnh jpg/png" },
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
            const deadlines = await parseDeadlinesFromImage(image, mimeType);
            if (studentId && deadlines.length > 0) {
                const dashboard = await loadStudentDashboard(studentId);
                const courses: LmsCourse[] = groupByCourse(deadlines);
                const merged = applyLmsCourses(dashboard, courses);
                await saveStudentDashboard(studentId, merged);
            }
            console.log(
                `[api/lms/parse] done in ${Date.now() - startedAt}ms input=image source=gemini deadlines=${deadlines.length} courses=${groupByCourse(deadlines).length}`
            );
            return NextResponse.json({
                ok: true,
                data: {
                    deadlines,
                    source: "gemini",
                    deadlineCount: deadlines.length,
                    courseCount: groupByCourse(deadlines).length,
                },
            });
        } catch (error) {
            console.error(`[api/lms/parse] image failed after ${Date.now() - startedAt}ms:`, error);
            return NextResponse.json(
                { ok: false, data: error instanceof Error ? error.message : "Unknown error" },
                { status: 500 }
            );
        }
    }

    const text = String(body?.text ?? "");
    if (!text.trim()) {
        return NextResponse.json({ ok: false, data: "text is required" }, { status: 400 });
    }

    try {
        const { deadlines, source } = await parseLmsMarkdown(text);

        if (studentId && deadlines.length > 0) {
            const dashboard = await loadStudentDashboard(studentId);
            const courses: LmsCourse[] = groupByCourse(deadlines);
            const merged = applyLmsCourses(dashboard, courses);
            await saveStudentDashboard(studentId, merged);
        }

        console.log(
            `[api/lms/parse] done in ${Date.now() - startedAt}ms input=text source=${source} deadlines=${deadlines.length} courses=${groupByCourse(deadlines).length}`
        );

        return NextResponse.json({
            ok: true,
            data: {
                deadlines,
                source,
                deadlineCount: deadlines.length,
                courseCount: groupByCourse(deadlines).length,
            },
        });
    } catch (error) {
        console.error(`[api/lms/parse] failed after ${Date.now() - startedAt}ms:`, error);
        return NextResponse.json(
            { ok: false, data: error instanceof Error ? error.message : "Unknown error" },
            { status: 500 }
        );
    }
}