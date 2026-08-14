import { describe, expect, test } from "bun:test";
import {
    buildCourseEvent,
    buildCourseRecurrence,
    buildExamEvent,
    examToExamSchedule,
    minutesToTime,
    normalizeDayOfWeek,
    parseTimeToMinutes,
    parseScheduleToEvents,
    subjectToCourse,
} from "./parser";
import type { ExamInfo, SubjectInfo } from "@/types";

const sampleSubject = (overrides: Partial<SubjectInfo> = {}): SubjectInfo => ({
    subject: "GIẢI TÍCH I (MT1005)",
    teacher: "Nguyễn Văn A",
    class: "L01",
    lesson: "2 - 4",
    startTime: "07:00",
    endTime: "09:50",
    dayOfWeek: 2, // Monday
    weeks: [3, 4, 5, 6],
    room: "H1-201",
    building: "CS1",
    dates: [
        "2026-01-12",
        "2026-01-19",
        "2026-02-02",
        "2026-02-09",
        "2026-02-16",
    ], // note: week of 26/01 missing (break)
    ...overrides,
});

describe("time helpers", () => {
    test("parseTimeToMinutes", () => {
        expect(parseTimeToMinutes("07:00")).toBe(420);
        expect(parseTimeToMinutes("21:20")).toBe(1280);
        expect(parseTimeToMinutes("bad")).toBe(-1);
    });

    test("minutesToTime", () => {
        expect(minutesToTime(420)).toBe("07:00");
        expect(minutesToTime(0)).toBe("00:00");
    });
});

describe("normalizeDayOfWeek", () => {
    test("maps mybk 2..8 to 1..7", () => {
        expect(normalizeDayOfWeek(2)).toBe(1);
        expect(normalizeDayOfWeek(8)).toBe(7);
        expect(normalizeDayOfWeek(1)).toBeNull();
    });
});

describe("subjectToCourse", () => {
    test("bridges raw payload", () => {
        const course = subjectToCourse(sampleSubject());
        expect(course).not.toBeNull();
        expect(course!.courseCode).toBe("MT1005");
        expect(course!.dayOfWeek).toBe(1);
        expect(course!.startTime).toBe("07:00");
        expect(course!.dates).toHaveLength(5);
    });

    test("returns null for unknown day (dates === --)", () => {
        expect(
            subjectToCourse({ ...sampleSubject(), dates: "--", dayOfWeek: 0 })
        ).toBeNull();
    });
});

describe("buildCourseRecurrence", () => {
    test("RRULE covers first..last with BYDAY", () => {
        const { rrule } = buildCourseRecurrence(
            subjectToCourse(sampleSubject())!
        );
        expect(rrule).toBe(
            "FREQ=WEEKLY;BYDAY=MO;UNTIL=20260216T095000"
        );
    });

    test("EXDATEs the missing mid-semester week", () => {
        const { exdates } = buildCourseRecurrence(
            subjectToCourse(sampleSubject())!
        );
        // 12/01 + weekly -> 19/01, 26/01 (missing!), 02/02, 09/02, 16/02
        expect(exdates).toContain("2026-01-26");
        expect(exdates).not.toContain("2026-01-19");
    });
});

describe("buildCourseEvent", () => {
    test("produces calendar-ready draft", () => {
        const ev = buildCourseEvent(subjectToCourse(sampleSubject())!);
        expect(ev.uid).toContain("course-");
        expect(ev.startLocal).toBe("2026-01-12T07:00");
        expect(ev.endLocal).toBe("2026-01-12T09:50");
        expect(ev.rrule).toContain("FREQ=WEEKLY");
        expect(ev.reminders).toEqual([{ method: "popup", minutesBefore: 30 }]);
        expect(ev.location).toContain("H1-201");
    });
});

describe("exam handling", () => {
    const sampleExam: ExamInfo = {
        subject: "CẤU TRÚC DỮ LIỆU (CO2003)",
        date: "2026-05-20",
        building: "CS1",
        room: "H6-101",
        startTime: "08:00",
        duration: "90",
        class: "L01",
    };

    test("examToExamSchedule", () => {
        const exam = examToExamSchedule(sampleExam)!;
        expect(exam.courseCode).toBe("CO2003");
        expect(exam.durationMin).toBe(90);
    });

    test("buildExamEvent uses 1-day email reminder", () => {
        const ev = buildExamEvent(examToExamSchedule(sampleExam)!);
        expect(ev.title).toBe("Kiểm tra CẤU TRÚC DỮ LIỆU (CO2003)");
        expect(ev.reminders).toContainEqual({
            method: "email",
            minutesBefore: 1440,
        });
        expect(ev.startLocal).toBe("2026-05-20T08:00");
        expect(ev.endLocal).toBe("2026-05-20T09:30");
    });
});

describe("parseScheduleToEvents", () => {
    test("combines courses and exams, skips unparseable", () => {
        const events = parseScheduleToEvents(
            [sampleSubject(), { ...sampleSubject(), dates: "--", dayOfWeek: 0 }],
            [
                {
                    subject: "VẬT LÝ (PH1001)",
                    date: "2026-05-10",
                    building: "CS2",
                    room: "H2-301",
                    startTime: "13:00",
                    duration: "120",
                    class: "L02",
                },
            ]
        );
        expect(events).toHaveLength(2);
        expect(events[0].source!.type).toBe("course");
        expect(events[1].source!.type).toBe("exam");
    });
});
