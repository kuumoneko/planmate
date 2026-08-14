import { describe, expect, it } from "bun:test";
import type { DayOfWeek } from "@/types";
import {
    assertWeekString,
    generateActualClassDates,
    generateActualClassDatesISO,
    mondayOfWeek,
    parseWeekString,
} from "../hcmut-week-parser";

describe("parseWeekString", () => {
    it("returns the study-week numbers for every non-dash position", () => {
        expect(parseWeekString("1234567-90123--")).toEqual([
            1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12, 13,
        ]);
    });

    it("returns [] when every week is a break", () => {
        expect(parseWeekString("------")).toEqual([]);
        expect(parseWeekString("")).toEqual([]);
    });

    it("treats a single char as week 1", () => {
        expect(parseWeekString("1")).toEqual([1]);
    });

    it("is deterministic for repeated digits", () => {
        expect(parseWeekString("222")).toEqual([1, 2, 3]);
    });
});

describe("assertWeekString", () => {
    it("accepts a normal week string", () => {
        expect(() => assertWeekString("1234567-90123--")).not.toThrow();
    });

    it("rejects non-digit/non-dash characters", () => {
        expect(() => assertWeekString("1234x67")).toThrow(/Invalid HCMUT week string/);
    });
});

describe("mondayOfWeek", () => {
    it("normalizes any weekday to the Monday of its week", () => {
        expect(mondayOfWeek(new Date(2026, 0, 5)).getDay()).toBe(1); // Mon
        expect(mondayOfWeek(new Date(2026, 0, 11)).getDay()).toBe(1); // Sun -> previous Mon
        expect(mondayOfWeek(new Date(2026, 0, 9)).getDay()).toBe(1); // Fri
    });
});

describe("generateActualClassDates", () => {
    // Semester week 1 = Monday 2026-01-05.
    const semesterStart = new Date(2026, 0, 5);

    it("maps study weeks to real dates (dayOfWeek = Monday)", () => {
        const dates = generateActualClassDates(semesterStart, 1, "123-567");
        expect(dates).toEqual([
            new Date(2026, 0, 5),
            new Date(2026, 0, 12),
            new Date(2026, 0, 19),
            new Date(2026, 1, 2), // study week 5 (week 4 is a break)
            new Date(2026, 1, 9),
            new Date(2026, 1, 16),
        ]);
    });

    it("honors dayOfWeek offset (dayOfWeek = Thursday = 4)", () => {
        const dates = generateActualClassDates(semesterStart, 4, "1");
        expect(dates).toEqual([new Date(2026, 0, 8)]);
    });

    it("anchors on the Monday of the week when semesterStart is not a Monday", () => {
        const dates = generateActualClassDates(new Date(2026, 0, 8), 1, "1");
        expect(dates).toEqual([new Date(2026, 0, 5)]);
    });

    it("throws for invalid dayOfWeek", () => {
        expect(() => generateActualClassDates(semesterStart, 0 as unknown as DayOfWeek, "1")).toThrow();
        expect(() => generateActualClassDates(semesterStart, 8 as unknown as DayOfWeek, "1")).toThrow();
    });

    it("throws for a malformed week string", () => {
        expect(() => generateActualClassDates(semesterStart, 1, "123x")).toThrow();
    });

    it("returns [] when the week string is all breaks", () => {
        expect(generateActualClassDates(semesterStart, 1, "---")).toEqual([]);
    });
});

describe("generateActualClassDatesISO", () => {
    it("formats results as yyyy-mm-dd", () => {
        const semesterStart = new Date(2026, 0, 5);
        expect(generateActualClassDatesISO(semesterStart, 1, "12")).toEqual([
            "2026-01-05",
            "2026-01-12",
        ]);
    });
});