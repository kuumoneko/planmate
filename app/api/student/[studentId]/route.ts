import { NextRequest, NextResponse } from "next/server";
import { loadStudentDashboard } from "@/lib/student-dashboard";

export const runtime = "nodejs";

/**
 * GET /api/student/[studentId]
 *
 * Dashboard payload — resolution order (cache -> live mybk -> demo) and cache
 * writing live in src/lib/student-dashboard.ts.
 */
export async function GET(
    _req: NextRequest,
    { params }: { params: Promise<{ studentId: string }> }
) {
    const { studentId } = await params;
    const data = await loadStudentDashboard(studentId);
    return NextResponse.json({ ok: true, data });
}
