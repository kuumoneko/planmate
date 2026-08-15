import { describe, expect, it } from "bun:test";
import type { ExamInfo, SubjectInfo } from "@/types";
import { pruneExpiredExams, pruneExpiredSchedule } from "../prune";

function subject(weeks: number[], dates: string[] | "--"): SubjectInfo {
    return {
        subject: "Test",
        teacher: "",
        class: "CO3001",
        lesson: "1 - 3",
        startTime: "07:00",
        endTime: "08:50",
        dayOfWeek: 2,
        weeks,
        building: "",
        room: "",
        dates,
    };
}

function exam(date: string | undefined): ExamInfo {
    return {
        subject: "Test",
        date: date ?? "",
        building: "",
        room: "",
        startTime: "",
        duration: "",
        class: "",
    };
}

describe("pruneExpiredSchedule", () => {
    it("keeps entries that still have a session at/after today", () => {
        const result = pruneExpiredSchedule(
            [
                subject([1, 2], ["2026-08-14", "2026-08-21"]),
                subject([1, 2], ["2026-08-15"]),
                subject([1, 2], ["2026-08-16", "2026-12-01"]),
            ],
            "2026-08-15"
        );
        expect(result.length).toBe(3);
    });

    it("drops entries whose every session already passed", () => {
        const result = pruneExpiredSchedule(
            [subject([1, 2], ["2026-01-13", "2026-01-20", "2026-06-05"])],
            "2026-08-15"
        );
        expect(result.length).toBe(0);
    });

    it("drops a mix correctly", () => {
        const result = pruneExpiredSchedule(
            [
                subject([1, 2], ["2026-01-13", "2026-06-05"]),
                subject([1, 2], ["2026-08-15", "2026-08-22"]),
                subject([1, 2], ["2026-08-14"]),
            ],
            "2026-08-15"
        );
        expect(result.length).toBe(1);
    });

    it("keeps entries with undeterminable dates (empty, missing, --)", () => {
        const result = pruneExpiredSchedule(
            [
                subject([1, 2], []),
                subject([1, 2], "--"),
                subject([1, 2], ["2026-01-05"]),
            ],
            "2026-08-15"
        );
        expect(result.length).toBe(2);
    });
});

describe("pruneExpiredExams", () => {
    it("drops exams strictly before today, keeps today and future", () => {
        const result = pruneExpiredExams(
            [exam("2026-08-14"), exam("2026-08-15"), exam("2026-08-19"), exam("2026-12-01")],
            "2026-08-15"
        );
        expect(result.map((e) => e.date)).toEqual([
            "2026-08-15",
            "2026-08-19",
            "2026-12-01",
        ]);
    });

    it("keeps exams with missing dates", () => {
        const result = pruneExpiredExams([exam(undefined), exam("2026-08-01")], "2026-08-15");
        expect(result.length).toBe(1);
    });
});