/**
 * HCMUT week-string parser.
 *
 * HCMUT timetables (mybk) encode the study weeks of a class as a fixed-length
 * string where each position is one *study week* of the semester:
 *
 *   "1234567-90123--"
 *     |    |  |  |
 *     |    |  |  +-- weeks 14-15: break (no class)
 *     |    |  +----- week 13: class
 *     |    +-------- weeks 8: break
 *     +------------- week 1: class
 *
 * Any non-dash character means "class happens this study week"; the digit
 * value itself is ignored (the "0" at index 9 conventionally reads as
 * study week 10). A dash means the week is a break.
 */

import type { DayOfWeek } from "@/types";

export type WeekString = string; // e.g. "1234567-90123--"

export const WEEK_STRING_RE = /^[0-9-]+$/;

/** Validate a week string; throws a descriptive error when malformed. */
export function assertWeekString(weekString: WeekString): void {
    if (!WEEK_STRING_RE.test(weekString)) {
        throw new Error(
            `Invalid HCMUT week string "${weekString}": only digits 0-9 and dashes are allowed`
        );
    }
    if (weekString.length === 0) {
        throw new Error("Invalid HCMUT week string: cannot be empty");
    }
}

/**
 * Parse a week string into the 1-based study-week numbers that have class.
 * e.g. "1234567-90123--" -> [1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12, 13]
 */
export function parseWeekString(weekString: WeekString): number[] {
    const weeks: number[] = [];
    for (let index = 0; index < weekString.length; index++) {
        if (weekString[index] !== "-") {
            weeks.push(index + 1);
        }
    }
    return weeks;
}

/** Monday of the week containing `date` (Mon-first, at 00:00 local). */
export function mondayOfWeek(date: Date): Date {
    const result = new Date(date);
    const day = result.getDay(); // 0 = Sun ... 6 = Sat
    result.setDate(result.getDate() + (day === 0 ? -6 : 1 - day));
    result.setHours(0, 0, 0, 0);
    return result;
}

export interface GenerateOptions {
    /** Study week 1 is anchored to the Monday of `semesterStart`'s week. */
    semesterStart?: Date;
}

/**
 * Expand an HCMUT week string into concrete class session dates.
 *
 * @param semesterStart The date marking study week 1 (any day of week 1;
 *                      it is normalized to the Monday of that week).
 * @param dayOfWeek     1 = Monday ... 7 = Sunday (the class's weekly day).
 * @param weekString    The HCMUT week string, e.g. "1234567-90123--".
 * @returns Sorted Date[] of every session, at 00:00 local time.
 */
export function generateActualClassDates(
    semesterStart: Date,
    dayOfWeek: DayOfWeek,
    weekString: WeekString
): Date[] {
    assertWeekString(weekString);
    if (dayOfWeek < 1 || dayOfWeek > 7) {
        throw new Error(`Invalid dayOfWeek ${dayOfWeek}: expected 1 (Mon) .. 7 (Sun)`);
    }

    const anchor = mondayOfWeek(semesterStart);
    const dayOffset = dayOfWeek - 1; // Monday = 0
    const weeks = parseWeekString(weekString);

    return weeks.map((studyWeek) => {
        const date = new Date(anchor);
        // Study week 1 = anchor + dayOffset; each further week adds 7 days.
        date.setDate(anchor.getDate() + (studyWeek - 1) * 7 + dayOffset);
        return date;
    });
}

/** Convenience: same as generateActualClassDates but returns "yyyy-mm-dd". */
export function generateActualClassDatesISO(
    semesterStart: Date,
    dayOfWeek: DayOfWeek,
    weekString: WeekString
): string[] {
    return generateActualClassDates(semesterStart, dayOfWeek, weekString).map((d) => {
        const day = String(d.getDate()).padStart(2, "0");
        const month = String(d.getMonth() + 1).padStart(2, "0");
        return `${d.getFullYear()}-${month}-${day}`;
    });
}