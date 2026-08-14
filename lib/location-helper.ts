/**
 * Room -> campus mapping and campus travel conflict detection.
 *
 * HCMUT convention (this app's contract):
 *   - Room codes starting with "H" (H1-201, H6-302, ...) belong to
 *     **Cơ sở 2 - Dĩ An, Bình Dương**.
 *   - Rooms at **DHQG-HT.TRANCHIDAO** (Trần Chí Đạo, trong khu ĐHQG-HCM) are
 *     gần Cơ sở 2, nên cũng được xem là **CS2**.
 *   - Every other room code (B11-101, GĐ-104, NHATHIDAU, ...) belongs to
 *     **Cơ sở 1 - 268 Lý Thường Kiệt, Q.10**.
 *
 * CS2 and CS1 are ~15 km apart: a student with classes at both campuses on
 * the same day has a real travel risk, which detectCampusTravelConflict
 * surfaces so the UI can warn them.
 */

import type { Campus, CampusConflict, CourseSchedule, DayOfWeek } from "@/types";

export const CAMPUS_ADDRESSES: Record<Campus, string> = {
    CS1: "Trường ĐH Bách Khoa - CS1, 268 Lý Thường Kiệt, P.14, Q.10, TP.HCM",
    CS2: "Trường ĐH Bách Khoa - CS2, Khu Đô thị ĐHQG-HCM, Dĩ An, Bình Dương",
};

/** Map an HCMUT room code to its campus. */
export function campusFromRoom(room: string): Campus {
    const r = room.trim();
    return /^H\d/.test(r) || /TRANCHIDAO/i.test(r) ? "CS2" : "CS1";
}

/** Full display address of a campus. */
export function getFullAddress(campus: Campus): string {
    return CAMPUS_ADDRESSES[campus];
}

/** Convenience: room code -> structured location info. */
export function getRoomAddress(room: string): {
    room: string;
    campus: Campus;
    address: string;
} {
    const campus = campusFromRoom(room);
    return { room, campus, address: CAMPUS_ADDRESSES[campus] };
}

/**
 * Warn when the student has classes on BOTH campuses on the same weekday.
 *
 * @returns One entry per conflicting weekday; [] when no conflict.
 */
export function detectCampusTravelConflict(
    courses: CourseSchedule[]
): CampusConflict[] {
    const byDay = new Map<DayOfWeek, CourseSchedule[]>();
    for (const course of courses) {
        const list = byDay.get(course.dayOfWeek) ?? [];
        list.push(course);
        byDay.set(course.dayOfWeek, list);
    }

    const conflicts: CampusConflict[] = [];
    for (const [dayOfWeek, dayCourses] of byDay) {
        const campuses = [...new Set(dayCourses.map((c) => campusFromRoom(c.room)))];
        if (campuses.length >= 2) {
            conflicts.push({
                dayOfWeek,
                campuses,
                courses: dayCourses.map((c) => ({
                    courseCode: c.courseCode,
                    courseName: c.courseName,
                    room: c.room,
                    startTime: c.startTime,
                    endTime: c.endTime,
                })),
            });
        }
    }

    return conflicts.sort((a, b) => a.dayOfWeek - b.dayOfWeek);
}