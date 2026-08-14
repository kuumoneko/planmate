import { CourseSchedule, DayOfWeek, FreeTimeSlot, StudentScheduleBundle } from "@/types";
import { parseTimeToMinutes, minutesToTime } from "@/utils/calendar/parser";

/**
 * Common free-time algorithm.
 *
 * For every weekday in the search window:
 *   1. Per member: turn occupied course intervals into minutes, merge overlaps.
 *   2. Per member: complement the merged intervals within [windowStart, windowEnd]
 *      -> that member's free slots.
 *   3. Intersect the free slots of ALL members for that day.
 *   4. Keep intersections >= minDurationMin.
 *
 * Pure function, no I/O — unit-testable and safe to run server-side.
 */

export interface FreeTimeConfig {
    /** Meeting search window (school hours), inclusive. Default 07:00 - 21:00. */
    windowStart?: string;
    windowEnd?: string;
    /** Minimum useful meeting length. Default 30 minutes. */
    minDurationMin?: number;
    /** Only consider these weekdays (1 = Monday ... 7 = Sunday). Default all. */
    days?: DayOfWeek[];
}

const DEFAULT_CONFIG: Required<Omit<FreeTimeConfig, "days">> & { days: DayOfWeek[] } = {
    windowStart: "07:00",
    windowEnd: "21:00",
    minDurationMin: 30,
    days: [1, 2, 3, 4, 5, 6, 7],
};

/** Merge overlapping / adjacent minute intervals (sorted input or not). */
export function mergeIntervals(intervals: Array<[number, number]>): Array<[number, number]> {
    if (intervals.length === 0) return [];
    const sorted = [...intervals].sort((a, b) => a[0] - b[0]);
    const merged: Array<[number, number]> = [sorted[0]];

    for (const [start, end] of sorted.slice(1)) {
        const last = merged[merged.length - 1];
        if (start <= last[1]) {
            last[1] = Math.max(last[1], end);
        } else {
            merged.push([start, end]);
        }
    }
    return merged;
}

/** Intersection of two interval lists (both assumed merged/sorted). */
export function intersectIntervals(
    a: Array<[number, number]>,
    b: Array<[number, number]>
): Array<[number, number]> {
    const result: Array<[number, number]> = [];
    let i = 0;
    let j = 0;

    while (i < a.length && j < b.length) {
        const start = Math.max(a[i][0], b[j][0]);
        const end = Math.min(a[i][1], b[j][1]);
        if (start < end) result.push([start, end]);

        if (a[i][1] < b[j][1]) i++;
        else j++;
    }
    return result;
}

/** Complement of occupied intervals within [windowStart, windowEnd]. */
function complementWithin(
    occupied: Array<[number, number]>,
    windowStartMin: number,
    windowEndMin: number
): Array<[number, number]> {
    const merged = mergeIntervals(occupied);
    const free: Array<[number, number]> = [];
    let cursor = windowStartMin;

    for (const [start, end] of merged) {
        if (start > cursor) free.push([cursor, Math.min(start, windowEndMin)]);
        cursor = Math.max(cursor, end);
        if (cursor >= windowEndMin) break;
    }
    if (cursor < windowEndMin) free.push([cursor, windowEndMin]);

    return free.filter(([s, e]) => s < e);
}

/** Occupied minute-intervals of one member on one weekday. */
function occupiedOnDay(courses: CourseSchedule[], day: DayOfWeek): Array<[number, number]> {
    const intervals: Array<[number, number]> = [];
    for (const course of courses) {
        if (course.dayOfWeek !== day) continue;
        const start = parseTimeToMinutes(course.startTime);
        const end = parseTimeToMinutes(course.endTime);
        if (start === -1 || end === -1 || end <= start) continue;
        intervals.push([start, end]);
    }
    return intervals;
}

/**
 * Identify time slots every member of the group is free.
 * A member with no courses simply counts as free for the whole window.
 */
export function findCommonFreeSlots(
    bundles: StudentScheduleBundle[],
    config: FreeTimeConfig = {}
): FreeTimeSlot[] {
    const { windowStart, windowEnd, minDurationMin, days } = {
        ...DEFAULT_CONFIG,
        ...config,
    };

    const windowStartMin = parseTimeToMinutes(windowStart);
    const windowEndMin = parseTimeToMinutes(windowEnd);
    if (windowStartMin === -1 || windowEndMin === -1 || windowEndMin <= windowStartMin) {
        return [];
    }

    if (bundles.length === 0) return [];

    const slots: FreeTimeSlot[] = [];

    for (const day of days) {
        // Per-member free intervals for this day.
        const memberFree = bundles.map((bundle) =>
            complementWithin(
                occupiedOnDay(bundle.courses, day),
                windowStartMin,
                windowEndMin
            )
        );

        // Intersect everyone's free intervals.
        let common: Array<[number, number]> = memberFree[0];
        for (const free of memberFree.slice(1)) {
            common = intersectIntervals(common, free);
        }

        for (const [start, end] of common) {
            if (end - start < minDurationMin) continue;
            slots.push({
                dayOfWeek: day,
                start: minutesToTime(start),
                end: minutesToTime(end),
                durationMin: end - start,
            });
        }
    }

    return slots;
}
