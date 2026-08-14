import { NextApiRequest, NextApiResponse } from "next";
import { getGroup, isMemberOf, loadMemberSchedules } from "@/lib/groups";
import { subjectToCourse } from "@/utils/calendar/parser";
import { findCommonFreeSlots } from "@/utils/groups/freeTime";
import { CourseSchedule, StudentScheduleBundle } from "@/types";

/**
 * /api/groups/[id]/free-time
 *  POST {studentId?, username?, windowStart?, windowEnd?, minDurationMin?}
 *
 * Identity is MSSV first (`studentId`), `username` accepted as fallback.
 * Compares every member's cached class schedule (server-side, no scraping)
 * and returns the common free slots for the week. Members the app has never
 * seen (no cached schedule) are reported as unavailable.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    try {
        if (req.method !== "POST") {
            return res.status(405).json({ ok: false, data: "Method not allowed" });
        }

        const group = await getGroup(String(req.query.id));
        if (!group) {
            return res.status(404).json({ ok: false, data: "Group not found" });
        }

        const { studentId, username, windowStart, windowEnd, minDurationMin } = req.body ?? {};
        const identity = String(studentId ?? username ?? "").trim();
        if (!identity) {
            return res.status(400).json({ ok: false, data: "studentId or username is required" });
        }

        if (!isMemberOf(group, identity)) {
            return res.status(403).json({ ok: false, data: "Bạn không thuộc nhóm này" });
        }

        const schedules = await loadMemberSchedules(group);

        const bundles: StudentScheduleBundle[] = schedules.map((s) => ({
            studentId: s.studentId,
            fullName: s.fullName,
            courses: s.courses
                .map((sub) => subjectToCourse(sub))
                .filter((c): c is CourseSchedule => c !== null),
        }));

        const slots = findCommonFreeSlots(bundles, {
            windowStart: windowStart ?? "07:00",
            windowEnd: windowEnd ?? "21:00",
            minDurationMin: Number(minDurationMin ?? 30),
        });

        return res.status(200).json({
            ok: true,
            data: {
                slots,
                memberCount: bundles.length,
                totalMembers: group.members.length,
                unavailableMembers: group.members.filter((m) => !m.username).length,
            },
        });
    } catch (e: any) {
        console.error(e);
        return res.status(500).json({ ok: false, data: e.message });
    }
}
