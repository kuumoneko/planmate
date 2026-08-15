import type { ExamInfo, SubjectInfo } from "@/types";

/**
 * Expired-data pruning for imported/cached schedule + exam arrays.
 *
 * Rule (schedule): an entry is expired when EVERY one of its session dates
 * is strictly before today. Entries whose dates cannot be determined
 * (missing, empty, or the "--" marker) are always kept — we never delete
 * what we cannot confirm is over.
 *
 * Rule (exam): an entry is expired when its exam date is strictly before
 * today (`date < today`); today's exam is kept.
 *
 * The cutoff is injectable for unit testing.
 */

export function todayIso(): string {
    const now = new Date();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return `${now.getFullYear()}-${m}-${d}`;
}

export function pruneExpiredSchedule(
    entries: SubjectInfo[],
    today: string = todayIso()
): SubjectInfo[] {
    return entries.filter((entry) => {
        const dates = entry?.dates;
        if (typeof dates !== "string" && Array.isArray(dates)) {
            if (dates.length === 0) return true;
            return dates.some((d) => d >= today);
        }
        return true;
    });
}

export function pruneExpiredExams(
    entries: ExamInfo[],
    today: string = todayIso()
): ExamInfo[] {
    return entries.filter((entry) => {
        const date = entry?.date;
        if (typeof date !== "string" || date.length === 0) return true;
        return date >= today;
    });
}