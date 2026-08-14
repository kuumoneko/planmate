import { NextRequest, NextResponse } from "next/server";
import { validateParsedDeadlines } from "@/lib/lms-parse";
import type { ParsedDeadline } from "@/types";
import { applyLmsCourses, loadStudentDashboard, saveStudentDashboard } from "@/lib/student-dashboard";
import { groupByCourse } from "../../../../lib/lms/mapping";

export const runtime = "nodejs";

/**
 * POST /api/lms/add
 *
 * Body: { studentId, courseName, taskName, dueDate, dueTime?, weight? }
 * Adds a manually entered deadline to the student's dashboard cache and the
 * persisted LMS data. `weight` is a percentage (0-100); re-adding the same
 * task name in the same course updates the existing deadline.
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
    const courseName = typeof body?.courseName === "string" ? body.courseName.trim() : "";
    const taskName = typeof body?.taskName === "string" ? body.taskName.trim() : "";
    const dueDate = typeof body?.dueDate === "string" ? body.dueDate.trim() : "";
    const dueTime = typeof body?.dueTime === "string" && body.dueTime.trim()
        ? body.dueTime.trim()
        : undefined;
    const weightRaw = body?.weight;

    if (!studentId || !courseName || !taskName || !dueDate) {
        return NextResponse.json(
            { ok: false, data: "studentId, courseName, taskName, dueDate are required" },
            { status: 400 }
        );
    }

    const weight =
        weightRaw == null || weightRaw === ""
            ? null
            : Number.isFinite(Number(weightRaw))
              ? Math.min(Math.max(Number(weightRaw) / 100, 0), 1)
              : null;

    const draft: ParsedDeadline = { taskName, dueDate, dueTime, weight, courseName };
    const [deadline] = validateParsedDeadlines([draft]);
    if (!deadline) {
        return NextResponse.json(
            { ok: false, data: "Ngày hạn không hợp lệ (định dạng yyyy-mm-dd hoặc dd/mm/yyyy)" },
            { status: 400 }
        );
    }

    try {
        const dashboard = await loadStudentDashboard(studentId);
        const courses = groupByCourse([deadline]);
        const updated = applyLmsCourses(dashboard, courses);
        await saveStudentDashboard(studentId, updated);

        const deadlineCount = updated.lmsCourses.reduce(
            (sum, c) => sum + c.deadlines.length,
            0
        );
        console.log(
            `[api/lms/add] done in ${Date.now() - startedAt}ms student=${studentId} course=${courseName} task=${taskName}`
        );

        return NextResponse.json({
            ok: true,
            data: {
                deadlineCount,
                courseCount: updated.lmsCourses.length,
            },
        });
    } catch (error) {
        console.error(`[api/lms/add] failed after ${Date.now() - startedAt}ms:`, error);
        return NextResponse.json(
            { ok: false, data: error instanceof Error ? error.message : "Unknown error" },
            { status: 500 }
        );
    }
}
