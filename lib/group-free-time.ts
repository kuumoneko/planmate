/**
 * Group free-time intersection.
 *
 * Algorithm (30-minute buckets):
 *   1. Split the day window (default 08:00 - 20:00) into 30-min buckets.
 *   2. Mark the buckets each member is busy in (from their CourseSchedule).
 *   3. Keep buckets that are free for EVERY member (a member with no
 *      classes that day is considered all-day free).
 *   4. Merge consecutive free buckets into runs and keep runs that are at
 *      least `minDurationMin` long (default 90 min).
 *   5. Classify each run:
 *        PERFECT — no member has a class starting or ending within 30 min
 *                  of the run's edges;
 *        TIGHT   — the run butts directly against a member's class session.
 *
 * Quantization note: because busy marking uses 30-min buckets, an interior
 * run edge always lands within 30 min of the class that borders it, so
 * PERFECT is achievable when a run is bounded by the window itself — i.e.
 * when no member has any class that day (run = the entire window). TIGHT
 * is the expected classification for runs squeezed between class sessions.
 *
 * Timezone note: all comparisons are pure string/minute arithmetic on
 * "HH:mm" values, so the result is timezone-agnostic. Times are local class
 * times as stored in the timetable.
 */

import { minutesToTime, parseTimeToMinutes } from "@/utils/calendar/parser";
import type {
    CourseSchedule,
    DayOfWeek,
    QualifiedFreeTimeSlot,
    SlotQuality,
} from "@/types";

export interface FreeTimeWindow {
    /** "HH:mm" inclusive start of the considered window (default "08:00"). */
    start?: string;
    /** "HH:mm" inclusive end of the considered window (default "20:00"). */
    end?: string;
}

export interface GroupFreeTimeOptions {
    window?: FreeTimeWindow;
    /** Minimum acceptable run length in minutes (default 90). */
    minDurationMin?: number;
}

const BUCKET_MINUTES = 30;

const DEFAULT_WINDOW_START = 8 * 60; // 08:00
const DEFAULT_WINDOW_END = 20 * 60; // 20:00
const DEFAULT_MIN_DURATION = 90;

/** Parse "HH:mm" -> minutes since 00:00 (throws on malformed input). */
function toMinutes(value: string | undefined, fallback: number, label: string): number {
    if (value === undefined) return fallback;
    const minutes = parseTimeToMinutes(value);
    if (minutes < 0) {
        throw new Error(`Invalid ${label} "${value}": expected "HH:mm"`);
    }
    return minutes;
}

export interface DayFreeRuns {
    dayOfWeek: DayOfWeek;
    /** Sorted runs as [startMinutes, endMinutes] within the window. */
    runs: [number, number][];
}

/**
 * Intersect member timetables into common free slots, classified by quality.
 *
 * @param memberTimetables One CourseSchedule[] per group member.
 */
export function findGroupFreeTime(
    memberTimetables: CourseSchedule[][],
    options: GroupFreeTimeOptions = {}
): QualifiedFreeTimeSlot[] {
    const windowStart = toMinutes(options.window?.start, DEFAULT_WINDOW_START, "window start");
    const windowEnd = toMinutes(options.window?.end, DEFAULT_WINDOW_END, "window end");
    const minDuration = options.minDurationMin ?? DEFAULT_MIN_DURATION;

    if (windowEnd <= windowStart) {
        throw new Error(`Invalid window: end "${options.window?.end}" is not after start "${options.window?.start}"`);
    }
    if (minDuration <= 0) {
        throw new Error(`Invalid minDurationMin ${minDuration}: must be positive`);
    }
    if (memberTimetables.length === 0) {
        return [];
    }

    const bucketCount = Math.floor((windowEnd - windowStart) / BUCKET_MINUTES);
    const days: DayOfWeek[] = [1, 2, 3, 4, 5, 6, 7];

    // busy[day][memberIdx] = boolean[] over buckets (mutated via bit masks below).
    const busyByMember = memberTimetables.map(() =>
        new Map<DayOfWeek, Uint8Array>(
            days.map((day) => [day, new Uint8Array(bucketCount)])
        )
    );

    memberTimetables.forEach((timetable, memberIdx) => {
        const busy = busyByMember[memberIdx];
        for (const course of timetable) {
            const dayMask = busy.get(course.dayOfWeek);
            if (!dayMask) continue;
            const start = parseTimeToMinutes(course.startTime);
            const end = parseTimeToMinutes(course.endTime);
            if (start < 0 || end < 0) continue;

            const firstBucket = Math.max(
                0,
                Math.floor((start - windowStart) / BUCKET_MINUTES)
            );
            const lastBucket = Math.min(
                bucketCount - 1,
                Math.ceil((end - windowStart) / BUCKET_MINUTES) - 1
            );
            for (let b = firstBucket; b <= lastBucket; b++) {
                dayMask[b] = 1;
            }
        }
    });

    const result: QualifiedFreeTimeSlot[] = [];

    for (const day of days) {
        const common = new Uint8Array(bucketCount).fill(1);
        for (const busy of busyByMember) {
            const mask = busy.get(day)!;
            for (let b = 0; b < bucketCount; b++) {
                // Keep the bucket only if THIS member is free in it.
                common[b] &= mask[b] === 0 ? 1 : 0;
            }
        }

        // Extract runs of consecutive free buckets.
        const runs: [number, number][] = [];
        let runStart = -1;
        for (let b = 0; b <= bucketCount; b++) {
            const free = b < bucketCount && common[b] === 1;
            if (free && runStart === -1) {
                runStart = b;
            } else if (!free && runStart !== -1) {
                runs.push([
                    windowStart + runStart * BUCKET_MINUTES,
                    windowStart + b * BUCKET_MINUTES,
                ]);
                runStart = -1;
            }
        }

        for (const [start, end] of runs) {
            if (end - start < minDuration) continue;

            const quality: SlotQuality = isTight(day, start, end, memberTimetables)
                ? "TIGHT"
                : "PERFECT";

            result.push({
                dayOfWeek: day,
                start: minutesToTime(start),
                end: minutesToTime(end),
                durationMin: end - start,
                quality,
            });
        }
    }

    return result;
}

/**
 * A run is TIGHT when any member has a class that ends within 30 minutes
 * before the run starts, or starts within 30 minutes after the run ends.
 */
function isTight(
    day: DayOfWeek,
    runStart: number,
    runEnd: number,
    memberTimetables: CourseSchedule[][]
): boolean {
    for (const timetable of memberTimetables) {
        for (const course of timetable) {
            if (course.dayOfWeek !== day) continue;
            const start = parseTimeToMinutes(course.startTime);
            const end = parseTimeToMinutes(course.endTime);
            if (start < 0 || end < 0) continue;

            // Run starts right after (<=30min) a class ends.
            if (end <= runStart && runStart - end <= 30) return true;
            // Run ends right before (<=30min) a class starts.
            if (start >= runEnd && start - runEnd <= 30) return true;
        }
    }
    return false;
}