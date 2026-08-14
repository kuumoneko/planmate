import { NextRequest, NextResponse } from "next/server";
import { loadStudentDashboard, removeLmsDeadline, saveStudentDashboard } from "@/lib/student-dashboard";

export const runtime = "nodejs";

/**
 * POST /api/lms/remove
 *
 * Body: { studentId, courseCode, taskName, dueDate }
 * Removes a deadline the user flagged as wrong from the student's dashboard
 * cache and from the persisted LMS data. Identical duplicates in the same
 * course are all removed.
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
    const courseCode = typeof body?.courseCode === "string" ? body.courseCode.trim() : "";
    const taskName = typeof body?.taskName === "string" ? body.taskName.trim() : "";
    const dueDate = typeof body?.dueDate === "string" ? body.dueDate.trim() : "";

    if (!studentId || !courseCode || !taskName || !dueDate) {
        return NextResponse.json(
            { ok: false, data: "studentId, courseCode, taskName, dueDate are required" },
            { status: 400 }
        );
    }

    try {
        const dashboard = await loadStudentDashboard(studentId);
        const updated = removeLmsDeadline(dashboard, { courseCode, taskName, dueDate });
        await saveStudentDashboard(studentId, updated);

        const deadlineCount = updated.lmsCourses.reduce(
            (sum, c) => sum + c.deadlines.length,
            0
        );
        console.log(
            `[api/lms/remove] done in ${Date.now() - startedAt}ms student=${studentId} code=${courseCode} task=${taskName} remaining=${deadlineCount}`
        );

        return NextResponse.json({
            ok: true,
            data: {
                deadlineCount,
                courseCount: updated.lmsCourses.length,
            },
        });
    } catch (error) {
        console.error(`[api/lms/remove] failed after ${Date.now() - startedAt}ms:`, error);
        return NextResponse.json(
            { ok: false, data: error instanceof Error ? error.message : "Unknown error" },
            { status: 500 }
        );
    }
}
