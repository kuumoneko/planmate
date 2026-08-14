/**
 * Pure mapping helpers between incoming deadline payloads and the dashboard's
 * `LmsCourse`/`ParsedDeadline` shapes — no I/O, no cache, fully testable.
 */

import type { LmsCourse, ParsedDeadline } from "@/types";

function keyOf(code: string): string {
    return code.trim().toLowerCase();
}

/**
 * Merge incoming LMS deadlines into the existing dashboard courses.
 * - A matching course (by code) is replaced by the incoming one, keeping the
 *   existing `url` when the incoming payload doesn't provide one.
 * - Deadlines are deduped by taskName (case-insensitive); incoming wins.
 * - Existing order is preserved; new courses are appended.
 */
export function mergeLmsDeadlines(existing: LmsCourse[], incoming: LmsCourse[]): LmsCourse[] {
    const merged: LmsCourse[] = [];
    const seen = new Set<string>();

    for (const course of existing) {
        const hit = incoming.find((c) => keyOf(c.code) === keyOf(course.code));
        if (!hit) {
            merged.push(course);
            continue;
        }
        seen.add(keyOf(course.code));
        merged.push({
            ...hit,
            url: hit.url ?? course.url,
            deadlines: dedupeDeadlines(course.deadlines, hit.deadlines),
        });
    }

    for (const course of incoming) {
        if (seen.has(keyOf(course.code))) continue;
        merged.push(course);
    }

    return merged;
}

function dedupeDeadlines(base: ParsedDeadline[], override: ParsedDeadline[]): ParsedDeadline[] {
    const byTask = new Map<string, ParsedDeadline>();
    for (const d of base) byTask.set(d.taskName.trim().toLowerCase(), d);
    for (const d of override) byTask.set(d.taskName.trim().toLowerCase(), d);
    return [...byTask.values()].sort((x, y) => x.dueDate.localeCompare(y.dueDate));
}

/** Group parsed deadlines by course name (paste carries no course code). */
export function groupByCourse(deadlines: ParsedDeadline[]): LmsCourse[] {
    const byCourse = new Map<string, ParsedDeadline[]>();
    for (const d of deadlines) {
        const list = byCourse.get(d.courseName) ?? [];
        list.push(d);
        byCourse.set(d.courseName, list);
    }
    return [...byCourse.entries()]
        .map(([name, list]) => ({
            id: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
            code: name,
            name,
            deadlines: list.sort((a, b) => a.dueDate.localeCompare(b.dueDate)),
        }))
        .sort((a, b) => a.code.localeCompare(b.code));
}