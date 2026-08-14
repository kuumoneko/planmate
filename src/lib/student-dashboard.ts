/**
 * Shared dashboard loader/merger for the App Router dashboard route and the
 * Pages Router LMS sync route — both resolve + persist the same payload.
 */

import { getCache, setCache } from "@/lib/cache";
import { detectCampusTravelConflict } from "../../lib/location-helper";
import { examToExamSchedule, subjectToCourse } from "@/utils/calendar/parser";
import type { CourseSchedule, ExamSchedule, LmsCourse, StudentDashboardData } from "@/types";
import { mergeLmsDeadlines } from "../../lib/lms/mapping";

export const DASHBOARD_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

export function dashboardCacheKey(studentId: string): string {
    return `dashboard:${studentId}`;
}

/**
 * Dashboard payload, resolved in this order:
 *   1. cache        — Mongo-backed, 30-min TTL (source: "cache")
 *   2. live         — real cached mybk schedule/exam + profile from Mongo
 *                     (source: "live"); this is what a logged-in student sees
 *   3. none         — empty payload when the student has no data yet
 *                     (source: "none"); never cached
 *
 * Never fails because of Mongo: cache and live lookups are best-effort and
 * fall through to the empty payload.
 */
export async function loadStudentDashboard(studentId: string): Promise<StudentDashboardData> {
    const cacheKey = dashboardCacheKey(studentId);

    try {
        const cached = await getCache<StudentDashboardData>(cacheKey);
        if (cached) {
            // Only serve the cache when no schedule/exam write happened after
            // the payload was built (otherwise the dashboard shows stale data).
            const { getMongoClient } = await import("@/lib/mongodb");
            const client = await getMongoClient();
            const doc = await client
                .db("hcmut")
                .collection("data")
                .findOne(
                    { username: studentId },
                    { projection: { _id: 0, updatedAt: 1 } }
                );
            const dataUpdatedAt = doc?.updatedAt
                ? new Date(doc.updatedAt).getTime()
                : 0; // no recorded write → trust the cache
            const cacheBuiltAt = cached.lastSyncedAt
                ? new Date(cached.lastSyncedAt).getTime()
                : 0;
            if (cacheBuiltAt >= dataUpdatedAt) {
                return { ...cached, source: "cache" };
            }
        }
    } catch {
        // fall through to live/none
    }

    let payload: StudentDashboardData;
    try {
        payload = await buildLiveDashboard(studentId);
    } catch (error) {
        console.error(`[dashboard/${studentId}] live lookup failed:`, error);
        payload = await buildEmptyDashboard(studentId);
    }

    // Never cache an empty payload — a later live lookup must be allowed to
    // succeed (and a cache write failure must never break the response).
    if (payload.timetable.length > 0 || payload.exams.length > 0 || payload.lmsCourses.length > 0) {
        await setCache(cacheKey, payload, { ttlMs: DASHBOARD_CACHE_TTL_MS });
    }
    return payload;
}

/** Best-effort persist of a (possibly LMS-merged) dashboard payload. */
export async function saveStudentDashboard(
    studentId: string,
    payload: StudentDashboardData
): Promise<void> {
    try {
        await setCache(dashboardCacheKey(studentId), payload, { ttlMs: DASHBOARD_CACHE_TTL_MS });
    } catch (error) {
        console.error(`[dashboard/${studentId}] cache write failed:`, error);
    }
    // Persist LMS deadlines in the data doc too, so they survive the 30-min
    // cache TTL and live rebuilds. Deliberately NOT stamping `updatedAt`:
    // an LMS write is not a schedule/exam write, so the cache stays valid.
    try {
        const { getMongoClient } = await import("@/lib/mongodb");
        const client = await getMongoClient();
        await client
            .db("hcmut")
            .collection("data")
            .updateOne(
                { username: studentId },
                { $set: { lms: payload.lmsCourses } }
            );
    } catch (error) {
        console.error(`[dashboard/${studentId}] lms persist failed:`, error);
    }
}

/** Merge synced LMS courses into a loaded dashboard (incoming wins). */
export function applyLmsCourses(
    dashboard: StudentDashboardData,
    courses: LmsCourse[]
): StudentDashboardData {
    return {
        ...dashboard,
        lmsCourses: mergeLmsDeadlines(dashboard.lmsCourses, courses),
        lastSyncedAt: new Date().toISOString(),
    };
}

/**
 * Remove a deadline a user flagged as wrong. Matches on the composite key
 * (course code + task name + due date); identical duplicates are all
 * removed. Courses left without deadlines are dropped from the list.
 */
export function removeLmsDeadline(
    dashboard: StudentDashboardData,
    match: { courseCode: string; taskName: string; dueDate: string }
): StudentDashboardData {
    const lmsCourses = dashboard.lmsCourses
        .map((course) => {
            if (course.code !== match.courseCode) return course;
            const deadlines = course.deadlines.filter(
                (d) => d.taskName !== match.taskName || d.dueDate !== match.dueDate
            );
            return { ...course, deadlines };
        })
        .filter((course) => course.deadlines.length > 0);
    return {
        ...dashboard,
        lmsCourses,
        lastSyncedAt: new Date().toISOString(),
    };
}

/**
 * Try to assemble the dashboard from real cached mybk data
 * (profile + schedule + exams in the `data` doc).
 */
async function buildLiveDashboard(studentId: string): Promise<StudentDashboardData> {
    const { getMongoClient } = await import("@/lib/mongodb");
    const client = await getMongoClient();
    const doc = await client
        .db("hcmut")
        .collection("data")
        .findOne(
            { username: studentId },
            { projection: { _id: 0, user: 1, schedule: 1, exam: 1, lms: 1 } }
        );

    if (!doc?.schedule || doc.schedule.length === 0) {
        // No real schedule on record.
        throw new Error("no cached schedule");
    }

    const user = doc.user ?? {};
    const timetable: CourseSchedule[] = (doc.schedule as any[])
        .map((sub: any) => subjectToCourse(sub))
        .filter((c): c is CourseSchedule => c !== null);

    const exams: ExamSchedule[] = (doc.exam as any[] ?? [])
        .map((ex: any) => examToExamSchedule(ex))
        .filter((e): e is ExamSchedule => e !== null);

    return {
        studentId,
        profile: {
            fullName: user.name ?? `Sinh viên ${studentId}`,
            email: user.email ?? `${studentId}@hcmut.edu.vn`,
            major: user.major ?? user.majorText ?? undefined,
            faculty: user.faculty ?? undefined,
            semester: user.semester ?? undefined,
        },
        timetable,
        exams,
        lmsCourses: Array.isArray(doc.lms) ? doc.lms : [], // persisted by /api/lms/parse
        campusConflicts: detectCampusTravelConflict(timetable),
        lastSyncedAt: new Date().toISOString(),
        source: "live",
    };
}

/**
 * Empty payload for a student who has no data on record yet.
 * Uses the cached profile when available, otherwise a plain fallback.
 */
async function buildEmptyDashboard(studentId: string): Promise<StudentDashboardData> {
    let user: any = {};
    let lms: any[] = [];
    try {
        const { getMongoClient } = await import("@/lib/mongodb");
        const client = await getMongoClient();
        const doc = await client
            .db("hcmut")
            .collection("data")
            .findOne(
                { username: studentId },
                { projection: { _id: 0, user: 1, lms: 1 } }
            );
        user = doc?.user ?? {};
        lms = Array.isArray(doc?.lms) ? doc.lms : [];
    } catch (error) {
        console.error(`[dashboard/${studentId}] profile lookup failed:`, error);
    }

    return {
        studentId,
        profile: {
            fullName: user.name ?? `Sinh viên ${studentId}`,
            email: user.email ?? `${studentId}@hcmut.edu.vn`,
            major: user.major ?? user.majorText ?? undefined,
            faculty: user.faculty ?? undefined,
            semester: user.semester ?? undefined,
        },
        timetable: [],
        exams: [],
        lmsCourses: lms,
        campusConflicts: [],
        source: "none",
    };
}