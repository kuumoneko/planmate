import { describe, expect, it } from "bun:test";
import { classifyIntent, foldDiacritics } from "../intent-classifier";

describe("foldDiacritics", () => {
    it("strips Vietnamese accents and lowercases", () => {
        expect(foldDiacritics("Lịch Học")).toBe("lich hoc");
        expect(foldDiacritics("Thời khóa biểu Ứng dụng")).toBe("thoi khoa bieu ung dung");
        expect(foldDiacritics("Đợt thi cuối kỳ")).toBe("dot thi cuoi ky");
    });

    it("leaves ASCII text untouched", () => {
        expect(foldDiacritics("Timetable 2026")).toBe("timetable 2026");
    });
});

describe("classifyIntent", () => {
    it("detects schedule questions (Vietnamese, with accents)", () => {
        expect(classifyIntent("Lịch học tuần này của tôi thế nào?").intent).toBe("schedule");
        expect(classifyIntent("xem thời khóa biểu giúp mình").intent).toBe("schedule");
    });

    it("detects schedule questions (English)", () => {
        expect(classifyIntent("show my timetable").intent).toBe("schedule");
        expect(classifyIntent("whats my schedule?").intent).toBe("schedule");
    });

    it("detects exam questions", () => {
        expect(classifyIntent("Lịch thi cuối kỳ khi nào?").intent).toBe("exams");
        expect(classifyIntent("kiểm tra lịch thi lại").intent).toBe("exams");
    });

    it("detects LMS deadline questions", () => {
        expect(classifyIntent("deadline bài tập tuần này là gì?").intent).toBe("lms");
        expect(classifyIntent("hạn nộp bài tập lớn môn CNPM?").intent).toBe("lms");
        expect(classifyIntent("có assignment mới trên LMS không?").intent).toBe("lms");
    });

    it("detects group free-time questions", () => {
        expect(classifyIntent("khi nào cả nhóm rảnh để họp?").intent).toBe("group-free-time");
        expect(classifyIntent("tìm lịch rảnh chung của nhóm").intent).toBe("group-free-time");
    });

    it("detects group task questions", () => {
        expect(classifyIntent("liệt kê công việc của nhóm").intent).toBe("group-tasks");
        expect(classifyIntent("tiến độ các task thế nào?").intent).toBe("group-tasks");
    });

    it("detects ICS export requests", () => {
        expect(classifyIntent("xuất lịch ra file ics giúp tôi").intent).toBe("ics-export");
        expect(classifyIntent("export my schedule").intent).toBe("ics-export");
    });

    it("falls back to general for unrelated chatter", () => {
        expect(classifyIntent("chào bạn, hôm nay thế nào?").intent).toBe("general");
    });

    it("reports matched keywords and scores", () => {
        const result = classifyIntent("xem lịch học và lịch thi của tôi");
        expect(result.matches).toContain("lich hoc");
        expect((result.scores.schedule ?? 0)).toBeGreaterThan(0);
        expect((result.scores.exams ?? 0)).toBeGreaterThan(0);
        expect((result.scores.schedule ?? 0)).toBeGreaterThanOrEqual(result.scores.exams ?? 0);
    });
});