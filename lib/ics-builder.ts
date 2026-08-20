/**
 * ICS export builder (App Router / v2).
 *
 * Builds a complete .ics calendar from a semester timetable using weekly
 * recurrence. This intentionally mirrors the legacy exporter
 * (src/utils/calendar/ics.ts) but is dependency-light and uses the native
 * `ics` package (already in package.json).
 *
 * Recurrence strategy:
 *   - RRULE:FREQ=WEEKLY;BYDAY=<WEEKDAY>;COUNT=<total weeks spanned>
 *   - Mid-semester breaks (dashes in the HCMUT week string) are rendered as
 *     EXDATE entries so the exported calendar stays faithful to the real
 *     schedule. When the schedule is contiguous, EXDATE is omitted.
 *   - DTSTART is the first session (floating local time, no TZID) and alarms
 *     fire 30 minutes before each session.
 */

import { createEvents, type EventAttributes } from "ics";
import type { CourseSchedule, DayOfWeek } from "@/types";

export interface IcsBuilderOptions {
    /** Minutes before the session to fire the reminder alarm (0 = none). */
    alarmMinutes?: number;
    /** Calendar display name (CALSCALE/NAME headers). */
    calendarName?: string;
}

const WEEKDAY_ABBREV: Record<DayOfWeek, string> = {
    1: "MO",
    2: "TU",
    3: "WE",
    4: "TH",
    5: "FR",
    6: "SA",
    7: "SU",
};

const DEFAULT_ALARM_MINUTES = 30;

/** "HH:mm" -> { hour, minute }. Throws when malformed. */
function parseClock(time: string): { hour: number; minute: number } {
    const match = /^(\d{1,2}):(\d{2})$/.exec(time);
    if (!match) {
        throw new Error(`Invalid time "${time}": expected "HH:mm"`);
    }
    const hour = Number(match[1]);
    const minute = Number(match[2]);
    if (hour > 23 || minute > 59) {
        throw new Error(`Invalid time "${time}": out of range`);
    }
    return { hour, minute };
}

/**
 * Parse a session date. Accepts Date, "yyyy-mm-dd" and DateArray-ish inputs;
 * always resolves to a Date at 00:00 local.
 */
function toLocalDate(value: string | Date): Date {
    if (value instanceof Date) {
        return new Date(value.getFullYear(), value.getMonth(), value.getDate());
    }
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
    if (!match) {
        throw new Error(`Invalid session date "${value}": expected "yyyy-mm-dd"`);
    }
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

/**
 * Build the recurring-event attributes for one course.
 * The course's week string drives COUNT and EXDATE (see module doc).
 */
export function buildCourseRecurringEvent(
    course: CourseSchedule,
    options: IcsBuilderOptions = {}
): EventAttributes {
    const byday = WEEKDAY_ABBREV[course.dayOfWeek];
    if (!byday) {
        throw new Error(`Invalid dayOfWeek ${course.dayOfWeek} for course ${course.courseCode}`);
    }

    const sessions = (course.dates ?? [])
        .map((d) => toLocalDate(d))
        .sort((a, b) => a.getTime() - b.getTime());
    if (sessions.length === 0) {
        throw new Error(`Course ${course.courseCode} has no class dates`);
    }

    const first = sessions[0];
    const last = sessions[sessions.length - 1];
    const totalWeeks = Math.round((last.getTime() - first.getTime()) / (7 * 86400000)) + 1;

    // Dates that the recurrence would produce but the week string excludes.
    const exclusionDates: Date[] = [];
    for (let week = 0; week < totalWeeks; week++) {
        const candidate = new Date(
            first.getFullYear(),
            first.getMonth(),
            first.getDate() + week * 7
        );
        const hasSession = sessions.some(
            (s) => s.getTime() === candidate.getTime()
        );
        if (!hasSession) {
            exclusionDates.push(candidate);
        }
    }

    const { hour: startHour, minute: startMinute } = parseClock(course.startTime);
    const { hour: endHour, minute: endMinute } = parseClock(course.endTime);
    const alarmMinutes = options.alarmMinutes ?? DEFAULT_ALARM_MINUTES;
    const firstWeek = course.weeks?.[0];
    const lastWeek = course.weeks?.[course.weeks.length - 1];
    const weekRange =
        firstWeek !== undefined && lastWeek !== undefined
            ? `Tuần học: ${firstWeek} - ${lastWeek}`
            : `Tổng cộng ${sessions.length} buổi`;

    const attribute: EventAttributes = {
        uid: `course-${course.courseCode}-${course.dayOfWeek}`.replace(/[^\w-]/g, ""),
        title: `${course.courseCode} - ${course.courseName}`,
        description:
            `Môn: ${course.courseName}\n` +
            `Mã môn: ${course.courseCode}\n` +
            `Phòng: ${course.room}\n` +
            weekRange,
        location: course.room,
        start: [first.getFullYear(), first.getMonth() + 1, first.getDate(), startHour, startMinute],
        startInputType: "local",
        end: [first.getFullYear(), first.getMonth() + 1, first.getDate(), endHour, endMinute],
        endInputType: "local",
        status: "CONFIRMED",
        busyStatus: "BUSY",
        alarms:
            alarmMinutes > 0
                ? [
                      {
                          action: "display",
                          description: "Nhắc lịch học",
                          trigger: { minutes: alarmMinutes, before: true },
                      },
                  ]
                : undefined,
        recurrenceRule: `FREQ=WEEKLY;BYDAY=${byday};COUNT=${totalWeeks}`,
    };

    if (exclusionDates.length > 0) {
        attribute.exclusionDates = exclusionDates.map((d) => [
            d.getFullYear(),
            d.getMonth() + 1,
            d.getDate(),
        ]);
    }

    return attribute;
}

/** Render one or more courses into a complete .ics calendar file string. */
export function buildCourseCalendarIcs(
    courses: CourseSchedule[],
    options: IcsBuilderOptions = {}
): string {
    const events = courses.map((course) => buildCourseRecurringEvent(course, options));
    const result = createEvents(events, {
        productId: "bk-calendar",
        calName: options.calendarName ?? "BK Calendar",
    });

    if (result.error) {
        throw result.error;
    }
    if (result.value === null) {
        throw new Error("Failed to generate ICS calendar");
    }
    return result.value;
}

/* --------------------------- deadline (LMS + task) ------------------------ */

export interface DeadlineIcsItem {
    /** Stable id -> idempotent imports into external calendars. */
    uid: string;
    title: string;
    description?: string;
    /** "yyyy-mm-dd" (local). */
    dueDate: string;
    /** "HH:mm" (defaults to 23:59). */
    dueTime?: string;
}

/** Parse a due date/time into a [y, m, d, h, min] DateArray for the ics pkg. */
function deadlineStart(item: DeadlineIcsItem): [number, number, number, number, number] {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(item.dueDate.trim());
    if (!match) {
        throw new Error(`Invalid due date "${item.dueDate}" for "${item.title}"`);
    }
    const [, y, m, d] = match.map(Number);
    const { hour, minute } = parseClock(item.dueTime ?? "23:59");
    return [y, m, d, hour, minute];
}

/**
 * Build a .ics calendar of one-shot deadline events (LMS deadlines and
 * group task deadlines). Each event starts at the due time, lasts 60
 * minutes and fires an alarm 1 day before the due date.
 */
export function buildDeadlinesIcs(
    items: DeadlineIcsItem[],
    options: IcsBuilderOptions = {}
): string {
    const events: EventAttributes[] = items.map((item) => ({
        uid: item.uid.replace(/[^\w-]/g, ""),
        title: item.title,
        description: item.description ?? "",
        start: deadlineStart(item),
        startInputType: "local",
        duration: { hours: 1 },
        status: "CONFIRMED",
        busyStatus: "BUSY",
        alarms: [
            {
                action: "display",
                description: "Nhắc deadline",
                trigger: { minutes: 24 * 60, before: true },
            },
        ],
    }));
    const result = createEvents(events, {
        productId: "bk-calendar",
        calName: options.calendarName ?? "Deadlines - BK Calendar",
    });

    if (result.error) {
        throw result.error;
    }
    if (result.value === null) {
        throw new Error("Failed to generate ICS calendar");
    }
    return result.value;
}