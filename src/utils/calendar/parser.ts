import { SubjectInfo, ExamInfo } from "@/types";
import {
    CalendarEventDraft,
    CourseSchedule,
    DayOfWeek,
    ExamSchedule,
    Reminder,
} from "@/types";

/**
 * All HCMUT schedules are expressed in local Vietnamese time.
 * Every event we produce carries this explicit TZID (never naive UTC),
 * which is the #1 source of .ics corruption if omitted.
 */
export const TZID = "Asia/Ho_Chi_Minh";

const DAY_ABBREV = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"] as const;

/** "HH:MM" -> minutes since midnight. Returns -1 for malformed input. */
export function parseTimeToMinutes(time: string): number {
    const match = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
    if (!match) return -1;
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (hours > 23 || minutes > 59) return -1;
    return hours * 60 + minutes;
}

/** minutes since midnight -> "HH:MM". */
export function minutesToTime(minutes: number): string {
    const clamped = Math.max(0, Math.min(23 * 60 + 59, Math.round(minutes)));
    return `${String(Math.floor(clamped / 60)).padStart(2, "0")}:${String(
        clamped % 60
    ).padStart(2, "0")}`;
}

/**
 * Normalize mybk dayOfWeek (2..8, where 2 = Monday, 8 = Sunday)
 * into DayOfWeek (1..7, 1 = Monday). Returns null for unexpected values.
 */
export function normalizeDayOfWeek(raw: number): DayOfWeek | null {
    const normalized = Number(raw) - 1;
    return normalized >= 1 && normalized <= 7
        ? (normalized as DayOfWeek)
        : null;
}

/**
 * mybk subject names are usually "TÊN MÔN (MÃ)" or "TÊN MÔN MÃ";
 * extract the code when present, otherwise fall back to the raw name.
 */
export function extractCourseCode(subjectName: string): string {
    const paren = /\(([A-Za-z0-9]{2,})\)/.exec(subjectName);
    if (paren) return paren[1].toUpperCase();
    const tail = subjectName.split(" ").pop() ?? "";
    if (/^[A-Za-z0-9]{4,}$/.test(tail)) return tail.toUpperCase();
    return subjectName.trim();
}

/**
 * Bridge the raw mybk payload (SubjectInfo) into the normalized CourseSchedule.
 * Returns null when the entry cannot be placed on a real day
 * (dates === "--", which the upstream fetcher uses for unknown days).
 */
export function subjectToCourse(sub: SubjectInfo): CourseSchedule | null {
    const dayOfWeek = normalizeDayOfWeek(sub.dayOfWeek);
    const dates = Array.isArray(sub.dates) ? sub.dates : null;

    if (dayOfWeek === null || !dates || dates.length === 0) {
        return null;
    }

    return {
        courseCode: extractCourseCode(sub.subject),
        courseName: sub.subject,
        classGroup: sub.class || "",
        teacher: sub.teacher || "",
        room: sub.room || "",
        building: sub.building || "",
        dayOfWeek,
        startTime: sub.startTime,
        endTime: sub.endTime,
        weeks: Array.isArray(sub.weeks) ? sub.weeks : [],
        dates: dates.sort(),
        lesson: sub.lesson,
    };
}

/** Bridge the raw mybk payload (ExamInfo) into the normalized ExamSchedule. */
export function examToExamSchedule(exam: ExamInfo): ExamSchedule | null {
    if (!exam.date || typeof exam.date !== "string") return null;
    return {
        courseCode: extractCourseCode(exam.subject),
        courseName: exam.subject,
        classGroup: exam.class || "",
        room: exam.room || "",
        building: exam.building || "",
        date: exam.date,
        startTime: exam.startTime || "07:00",
        durationMin: Math.max(30, Number(exam.duration) || 90),
    };
}

/** "yyyy-mm-dd" + "HH:MM" -> "yyyy-MM-ddTHH:mm" local. */
function toLocalDateTime(date: string, time: string): string {
    return `${date}T${time}`;
}

/** "yyyy-mm-dd" -> "yyyyMMdd" (RFC 5545 date format). */
function toIcsDate(date: string): string {
    return date.replace(/-/g, "");
}

/** "HH:MM" -> "HHMMSS" (RFC 5545 local time format). */
function toIcsTime(time: string): string {
    return `${time.replace(":", "")}00`;
}

/**
 * Build the weekly recurrence for a course.
 *
 * The upstream payload already resolves every concrete meeting date, so:
 * - RRULE = FREQ=WEEKLY;BYDAY=<day>;UNTIL=<last date at end time>
 * - EXDATE = every date in the semester range that is NOT in the meeting set
 *   (mid-semester breaks, user filter edits, holidays, ...)
 */
export function buildCourseRecurrence(
    course: CourseSchedule
): { rrule: string; exdates: string[] } {
    const byday = DAY_ABBREV[course.dayOfWeek - 1];
    const first = course.dates[0];
    const last = course.dates[course.dates.length - 1];
    const until = `${toIcsDate(last)}T${toIcsTime(course.endTime)}`;

    const rrule = `FREQ=WEEKLY;BYDAY=${byday};UNTIL=${until}`;

    const meetingSet = new Set(course.dates);
    const exdates: string[] = [];
    const cursor = new Date(`${first}T00:00:00`);
    const end = new Date(`${last}T00:00:00`);
    while (cursor <= end) {
        const dateStr = cursor.toISOString().slice(0, 10);
        if (!meetingSet.has(dateStr)) exdates.push(dateStr);
        cursor.setDate(cursor.getDate() + 7);
    }

    return { rrule, exdates };
}

function courseReminders(): Reminder[] {
    return [{ method: "popup", minutesBefore: 30 }];
}

const EXAM_REMINDERS: Reminder[] = [
    { method: "email", minutesBefore: 24 * 60 }, // 1 day before
    { method: "popup", minutesBefore: 60 },
];

/** Course -> recurring CalendarEventDraft (RRULE + EXDATE + 30-min reminder). */
export function buildCourseEvent(course: CourseSchedule): CalendarEventDraft {
    const { rrule, exdates } = buildCourseRecurrence(course);
    const first = course.dates[0];

    return {
        uid: `course-${course.courseCode}-${course.classGroup}-${course.dayOfWeek}-${course.startTime}-${first}`,
        title: course.courseName,
        description: `Giảng viên: ${course.teacher || "Chưa biết"} · Lớp: ${
            course.classGroup || "Không có"
        }`,
        location: `${course.room} · ${course.building}`,
        startLocal: toLocalDateTime(first, course.startTime),
        endLocal: toLocalDateTime(first, course.endTime),
        rrule,
        exdates,
        reminders: courseReminders(),
        source: { type: "course", id: `${course.courseCode}-${course.classGroup}` },
    };
}

/** Exam -> one-shot CalendarEventDraft (1-day email reminder). */
export function buildExamEvent(exam: ExamSchedule): CalendarEventDraft {
    const start = toLocalDateTime(exam.date, exam.startTime);
    const endMinutes =
        parseTimeToMinutes(exam.startTime) + exam.durationMin;

    return {
        uid: `exam-${exam.courseCode}-${exam.classGroup}-${exam.date}`,
        title: `Kiểm tra ${exam.courseName}`,
        description: `Lớp: ${exam.classGroup || "Không có"} · Thời lượng: ${
            exam.durationMin
        } phút`,
        location: `${exam.room} · ${exam.building}`,
        startLocal: start,
        endLocal: toLocalDateTime(exam.date, minutesToTime(endMinutes)),
        exdates: [],
        reminders: EXAM_REMINDERS,
        source: { type: "exam", id: `${exam.courseCode}-${exam.date}` },
    };
}

/** Parse a full mybk schedule + exam list into calendar-ready drafts. */
export function parseScheduleToEvents(
    schedule: SubjectInfo[] | null | undefined,
    exams: ExamInfo[] | null | undefined
): CalendarEventDraft[] {
    const events: CalendarEventDraft[] = [];

    for (const sub of schedule ?? []) {
        const course = subjectToCourse(sub);
        if (course) events.push(buildCourseEvent(course));
    }

    for (const ex of exams ?? []) {
        const exam = examToExamSchedule(ex);
        if (exam) events.push(buildExamEvent(exam));
    }

    return events;
}
