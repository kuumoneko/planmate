import { describe, expect, it } from "bun:test";
import type { CourseSchedule } from "@/types";
import { buildCourseCalendarIcs, buildCourseRecurringEvent } from "../ics-builder";

function course(
    overrides: Partial<CourseSchedule> & Pick<CourseSchedule, "dayOfWeek">
): CourseSchedule {
    return {
        courseCode: "CO3001",
        courseName: "Công nghệ phần mềm",
        classGroup: "01",
        teacher: "GV",
        room: "B11-101",
        building: "B11",
        startTime: "09:30",
        endTime: "11:00",
        weeks: [1, 2, 3],
        dates: ["2026-01-05", "2026-01-12", "2026-01-19"],
        ...overrides,
    };
}

describe("buildCourseRecurringEvent", () => {
    it("emits a weekly RRULE with BYDAY and COUNT", () => {
        const event = buildCourseRecurringEvent(course({ dayOfWeek: 1 }));
        expect(event.recurrenceRule).toBe("FREQ=WEEKLY;BYDAY=MO;COUNT=3");
    });

    it("maps dayOfWeek to the right weekday abbrev", () => {
        expect(buildCourseRecurringEvent(course({ dayOfWeek: 7 })).recurrenceRule).toContain("SU");
        expect(buildCourseRecurringEvent(course({ dayOfWeek: 4 })).recurrenceRule).toContain("TH");
    });

    it("uses floating local start/end times", () => {
        const event = buildCourseRecurringEvent(course({ dayOfWeek: 1 }));
        expect(event.start).toEqual([2026, 1, 5, 9, 30]);
        expect(event.startInputType).toBe("local");
        expect(event).toHaveProperty("end", [2026, 1, 5, 11, 0]);
        expect(event.endInputType).toBe("local");
    });

    it("sets title, location and a reminder alarm", () => {
        const event = buildCourseRecurringEvent(course({ dayOfWeek: 1 }));
        expect(event.title).toContain("CO3001");
        expect(event.location).toBe("B11-101");
        expect(event.alarms).toEqual([
            { action: "display", description: "Nhắc lịch học", trigger: { minutes: 30, before: true } },
        ]);
    });

    it("omits the alarm when alarmMinutes is 0", () => {
        const event = buildCourseRecurringEvent(course({ dayOfWeek: 1 }), { alarmMinutes: 0 });
        expect(event.alarms).toBeUndefined();
    });

    it("adds EXDATE for mid-semester breaks (weeks 1 and 3, break week 2)", () => {
        const broken = course({
            dayOfWeek: 1,
            weeks: [1, 3],
            dates: ["2026-01-05", "2026-01-19"],
        });
        const event = buildCourseRecurringEvent(broken);
        expect(event.recurrenceRule).toBe("FREQ=WEEKLY;BYDAY=MO;COUNT=3");
        expect(event.exclusionDates).toEqual([[2026, 1, 12]]);
    });

    it("omits EXDATE for a contiguous schedule", () => {
        const event = buildCourseRecurringEvent(course({ dayOfWeek: 1 }));
        expect(event.exclusionDates).toBeUndefined();
    });

    it("throws when the course has no dates", () => {
        expect(() => buildCourseRecurringEvent(course({ dayOfWeek: 1, dates: [] }))).toThrow(
            /no class dates/
        );
    });

    it("throws on a malformed time", () => {
        expect(() =>
            buildCourseRecurringEvent(course({ dayOfWeek: 1, startTime: "25:00" }))
        ).toThrow(/Invalid time/);
    });

    it("throws on an invalid dayOfWeek", () => {
        expect(() => buildCourseRecurringEvent(course({ dayOfWeek: 0 as 1 }))).toThrow(
            /Invalid dayOfWeek/
        );
    });
});

describe("buildCourseCalendarIcs", () => {
    it("produces a complete, parseable iCalendar document", () => {
        const ics = buildCourseCalendarIcs([
            course({ dayOfWeek: 1 }),
            course({ dayOfWeek: 3, courseCode: "MT1001", dates: ["2026-01-07", "2026-01-14", "2026-01-21"] }),
        ]);

        expect(ics.startsWith("BEGIN:VCALENDAR")).toBe(true);
        expect(ics).toContain("END:VCALENDAR");
        expect(ics).toContain("BEGIN:VEVENT");
        expect(ics).toContain("END:VEVENT");
        expect(ics).toContain("RRULE:FREQ=WEEKLY;BYDAY=MO;COUNT=3");
        expect(ics).toContain("RRULE:FREQ=WEEKLY;BYDAY=WE;COUNT=3");
        expect(ics).toContain("BEGIN:VALARM");
        expect(ics).toContain("TRIGGER:-PT30M");
        expect(ics).toContain("DTSTART:20260105T093000");
        expect(ics).toContain("LOCATION:B11-101");
        expect(ics).toContain("SUMMARY:CO3001");
    });

    it("renders EXDATE for a broken schedule", () => {
        const broken = course({ dayOfWeek: 1, weeks: [1, 3], dates: ["2026-01-05", "2026-01-19"] });
        const ics = buildCourseCalendarIcs([broken]);
        expect(ics).toContain("EXDATE:20260112");
    });
});