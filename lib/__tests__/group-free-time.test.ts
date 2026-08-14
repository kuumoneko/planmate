import { describe, expect, it } from "bun:test";
import type { CourseSchedule, DayOfWeek, QualifiedFreeTimeSlot } from "@/types";
import { findGroupFreeTime } from "../group-free-time";

function course(
    dayOfWeek: 1 | 2 | 3 | 4 | 5 | 6 | 7,
    start: string,
    end: string,
    code = "CO"
): CourseSchedule {
    return {
        courseCode: code,
        courseName: code,
        classGroup: "01",
        teacher: "GV",
        room: "B11-101",
        building: "B11",
        dayOfWeek,
        startTime: start,
        endTime: end,
        weeks: [1],
        dates: ["2026-01-05"],
    };
}

const MON: DayOfWeek = 1;
const ALL_DAYS: DayOfWeek[] = [1, 2, 3, 4, 5, 6, 7];

function daySlots(slots: QualifiedFreeTimeSlot[], day: DayOfWeek) {
    return slots.filter((s) => s.dayOfWeek === day);
}

describe("findGroupFreeTime", () => {
    it("returns [] with no members", () => {
        expect(findGroupFreeTime([])).toEqual([]);
    });

    it("returns a PERFECT full-window slot for every day when all are free", () => {
        const slots = findGroupFreeTime([[], []]);
        expect(slots).toHaveLength(7);
        expect(slots.every((s) => s.quality === "PERFECT")).toBe(true);
        expect(slots.every((s) => s.start === "08:00" && s.end === "20:00")).toBe(true);
        expect(slots.map((s) => s.dayOfWeek)).toEqual(ALL_DAYS);
    });

    it("filters runs shorter than minDurationMin on every day", () => {
        // Window is only 2h: the 08:00-10:00 full-day runs are 120 min < 150.
        const slots = findGroupFreeTime([[course(MON, "08:00", "09:00")]], {
            window: { start: "08:00", end: "10:00" },
            minDurationMin: 150,
        });
        expect(slots).toHaveLength(0);

        // Same window, lower floor -> Monday's run is only 60 min (09:00-10:00)
        // after the 08:00-09:00 class, so it stays dropped; the other 6 days
        // yield full-window 120-min runs.
        const slots2 = findGroupFreeTime([[course(MON, "08:00", "09:00")]], {
            window: { start: "08:00", end: "10:00" },
            minDurationMin: 120,
        });
        expect(slots2).toHaveLength(6);
        expect(slots2.every((s) => s.dayOfWeek !== MON)).toBe(true);
    });

    it("marks the Monday run as TIGHT and the class-free days PERFECT", () => {
        // Member A busy 08:00-09:30; member B busy 10:00-12:00.
        // Monday: 09:30-10:00 (60 min, dropped), 12:00-20:00.
        const slots = findGroupFreeTime([
            [course(MON, "08:00", "09:30", "A")],
            [course(MON, "10:00", "12:00", "B")],
        ]);

        const monday = daySlots(slots, MON);
        expect(monday).toHaveLength(1);
        expect(monday[0]).toMatchObject({
            start: "12:00",
            end: "20:00",
            durationMin: 480,
            quality: "TIGHT", // B's class ends exactly when the run starts
        });

        const otherDays = slots.filter((s) => s.dayOfWeek !== MON);
        expect(otherDays).toHaveLength(6);
        expect(otherDays.every((s) => s.quality === "PERFECT")).toBe(true);
    });

    it("classifies runs bounded by class edges as TIGHT on each busy day", () => {
        const slots = findGroupFreeTime([
            [course(MON, "08:00", "09:00", "A")],
            [course(2, "08:00", "09:00", "B")],
        ]);

        const busyDays: DayOfWeek[] = [MON, 2];
        for (const day of busyDays) {
            const dayList = daySlots(slots, day);
            expect(dayList).toHaveLength(1);
            expect(dayList[0].start).toBe("09:00");
            expect(dayList[0].quality).toBe("TIGHT");
        }
        expect(slots.filter((s) => ![MON, 2].includes(s.dayOfWeek)).every((s) => s.quality === "PERFECT")).toBe(true);
    });

    it("sorts results by dayOfWeek then start time", () => {
        const slots = findGroupFreeTime([
            [course(5, "08:00", "09:00", "A")],
            [course(1, "08:00", "09:00", "B")],
        ]);
        const days = slots.map((s) => s.dayOfWeek);
        expect(days).toEqual([...days].sort((a, b) => a - b));
    });

    it("throws when the window is inverted", () => {
        expect(() =>
            findGroupFreeTime([[]], { window: { start: "20:00", end: "08:00" } })
        ).toThrow(/not after/);
    });

    it("throws on a malformed window time", () => {
        expect(() =>
            findGroupFreeTime([[]], { window: { start: "8am" } })
        ).toThrow(/Invalid window start/);
    });

    it("throws on a non-positive minDurationMin", () => {
        expect(() => findGroupFreeTime([[]], { minDurationMin: 0 })).toThrow(/minDurationMin/);
    });
});