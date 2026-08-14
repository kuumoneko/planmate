import { describe, expect, test } from "bun:test";
import { CourseSchedule, DayOfWeek } from "@/types";
import {
    findCommonFreeSlots,
    intersectIntervals,
    mergeIntervals,
} from "./freeTime";

function course(day: DayOfWeek, startTime: string, endTime: string): CourseSchedule {
    return {
        courseCode: "X",
        courseName: "X",
        classGroup: "",
        teacher: "",
        room: "",
        building: "",
        dayOfWeek: day,
        startTime,
        endTime,
        weeks: [],
        dates: [],
    };
}

describe("mergeIntervals", () => {
    test("merges overlapping and adjacent", () => {
        expect(
            mergeIntervals([
                [420, 480],
                [450, 540],
                [600, 700],
                [540, 590],
            ])
        ).toEqual([
            [420, 590],
            [600, 700],
        ]);
    });
});

describe("intersectIntervals", () => {
    test("keeps only overlap", () => {
        const a: Array<[number, number]> = [
            [420, 600],
            [900, 1100],
        ];
        const b: Array<[number, number]> = [
            [480, 960],
            [1050, 1150],
        ];
        expect(intersectIntervals(a, b)).toEqual([
            [480, 600],
            [900, 960],
            [1050, 1100],
        ]);
    });
});

describe("findCommonFreeSlots", () => {
    const mon = 1 as DayOfWeek;
    const tue = 2 as DayOfWeek;

    test("empty bundles -> no slots", () => {
        expect(findCommonFreeSlots([])).toEqual([]);
    });

    test("single member free around their classes", () => {
        const slots = findCommonFreeSlots([
            { studentId: "a", fullName: "A", courses: [course(mon, "07:00", "09:50")] },
        ], { windowStart: "07:00", windowEnd: "12:00", minDurationMin: 30, days: [mon] });

        expect(slots).toEqual([
            {
                dayOfWeek: mon,
                start: "09:50",
                end: "12:00",
                durationMin: 130,
            },
        ]);
    });

    test("two members only share the lunch break and end of day", () => {
        const slots = findCommonFreeSlots([
            {
                studentId: "a",
                fullName: "A",
                courses: [course(mon, "07:00", "12:00"), course(tue, "07:00", "12:00")],
            },
            {
                studentId: "b",
                fullName: "B",
                courses: [course(mon, "13:00", "17:00"), course(tue, "13:00", "17:00")],
            },
        ], { windowStart: "07:00", windowEnd: "18:00", minDurationMin: 60, days: [mon, tue] });

        expect(slots).toEqual([
            {
                dayOfWeek: mon,
                start: "12:00",
                end: "13:00",
                durationMin: 60,
            },
            {
                dayOfWeek: mon,
                start: "17:00",
                end: "18:00",
                durationMin: 60,
            },
            {
                dayOfWeek: tue,
                start: "12:00",
                end: "13:00",
                durationMin: 60,
            },
            {
                dayOfWeek: tue,
                start: "17:00",
                end: "18:00",
                durationMin: 60,
            },
        ]);
    });

    test("respects minDurationMin", () => {
        const slots = findCommonFreeSlots([
            { studentId: "a", fullName: "A", courses: [course(mon, "07:00", "07:20")] },
        ], { windowStart: "07:00", windowEnd: "09:00", minDurationMin: 60, days: [mon] });

        expect(slots).toEqual([
            { dayOfWeek: mon, start: "07:20", end: "09:00", durationMin: 100 },
        ]);
    });

    test("member without courses is free the whole window", () => {
        const slots = findCommonFreeSlots(
            [
                { studentId: "busy", fullName: "B", courses: [course(mon, "08:00", "10:00")] },
                { studentId: "free", fullName: "F", courses: [] },
            ],
            { windowStart: "07:00", windowEnd: "12:00", minDurationMin: 30, days: [mon] }
        );

        expect(slots).toEqual([
            { dayOfWeek: mon, start: "07:00", end: "08:00", durationMin: 60 },
            { dayOfWeek: mon, start: "10:00", end: "12:00", durationMin: 120 },
        ]);
    });
});
