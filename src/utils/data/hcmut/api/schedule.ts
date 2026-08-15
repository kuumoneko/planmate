import { DayOfWeek, SubjectInfo } from "@/types";
import fetch_data from "@/utils/fetch";
import get_web_student from "./student";
import {
    generateActualClassDatesISO,
    parseWeekString,
    WEEK_STRING_RE,
} from "../../../../../lib/hcmut-week-parser";

/**
 * Get Schedule of user
 *
 * `weekSeriesDisplay` is a positional string: one character per semester
 * study week, digit = class happens, dash = no class that week
 * (e.g. "1234567-90123--" = weeks 1-7 and 9-13, breaks on 8 and 14-15).
 */
export default async function get_web_schedule(
    authorization: string,
    studentId: string,
    semester: string,
    semesterStart?: string
): Promise<SubjectInfo[] | null> {
    try {
        if (!semesterStart) {
            const student = await get_web_student(authorization);
            semesterStart = student?.semesterStart;
            if (!semesterStart) {
                return null;
            }
        }
        const anchor = new Date(semesterStart);

        const res = await fetch_data("/api/mybk/api/schedule", {
            "Content-Type": "application/json"
        }, {
            authorization: authorization,
            semester_id: semester, student_id: studentId
        })
        if (!Array.isArray(res)) {
            return null;
        }
        return res.map((a: any) => {
            const validWeeks = WEEK_STRING_RE.test(a.weekSeriesDisplay);
            const weeks = validWeeks ? parseWeekString(a.weekSeriesDisplay) : [];
            const dayOfWeek = (a.dayOfWeek - 1) as DayOfWeek;
            const dates = (a.dayOfWeek === 0 || dayOfWeek < 1 || dayOfWeek > 7)
                ? "--"
                : validWeeks
                    ? generateActualClassDatesISO(anchor, dayOfWeek, a.weekSeriesDisplay)
                    : [];
            return {
                subject: a.subject.nameVi,
                teacher: a.employee.lastName + " " + a.employee.firstName,
                class: a.subjectClassGroup.classGroup,
                lesson: `${a.startLesson} - ${a.numOfLesson - 1 + a.startLesson}`,
                startTime: a.startTime,
                endTime: a.endTime,
                dayOfWeek: a.dayOfWeek,
                weeks,
                room: a.room.code,
                building: a.room.building.campus.nameVi,
                dates
            }
        }) ?? null
    }
    catch (e) {
        console.error(e);
        return null;
    }
}