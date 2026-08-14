import { describe, expect, test } from "bun:test";
import {
    capTaskName,
    extractDueDate,
    extractDueTime,
    normalizeDueTime,
    parseDeadlinesRegex,
    validateParsedDeadlines,
} from "@/lib/lms-parse";

describe("parseDeadlinesRegex", () => {
    test("parses markdown headings and task bullets", () => {
        const text = [
            "# CO3001 - Phân tích thiết kế hướng đối tượng",
            "",
            "- [ ] **Bài tập 1** - hạn nộp: 15/04/2026 (10%)",
            "- [ ] Bài tập 2 - nộp ngày 30/05/2026 (0.2)",
        ].join("\n");
        const deadlines = parseDeadlinesRegex(text);
        expect(deadlines).toHaveLength(2);
        expect(deadlines[0]).toMatchObject({
            taskName: "Bài tập 1",
            dueDate: "2026-04-15",
            weight: 0.1,
            courseName: "CO3001 - Phân tích thiết kế hướng đối tượng",
        });
        expect(deadlines[1]).toMatchObject({
            taskName: "Bài tập 2",
            dueDate: "2026-05-30",
            weight: 0.2,
            courseName: "CO3001 - Phân tích thiết kế hướng đối tượng",
        });
    });

    test("keeps course name when the header is bold-markdown", () => {
        const text = [
            "**CO3001 - OOP**",
            "",
            "- Bài tập 1 - deadline: 15/04/2026 (30%)",
        ].join("\n");
        const deadlines = parseDeadlinesRegex(text);
        expect(deadlines).toHaveLength(1);
        expect(deadlines[0].courseName).toBe("CO3001 - OOP");
        expect(deadlines[0].taskName).toBe("Bài tập 1");
    });

    test("inherits the parent task name on nested bullet date lines", () => {
        const text = [
            "## CO3001",
            "- Bài tập 1",
            "  - hạn nộp: 15/04/2026",
            "  - trọng số: 10%",
        ].join("\n");
        const deadlines = parseDeadlinesRegex(text);
        expect(deadlines).toHaveLength(1);
        expect(deadlines[0]).toMatchObject({
            taskName: "Bài tập 1",
            dueDate: "2026-04-15",
            weight: null,
            courseName: "CO3001",
        });
    });

    test("ignores markdown tables (unsupported)", () => {
        const text = [
            "| Môn | Bài tập | Hạn nộp | Trọng số |",
            "|---|---|---|---|",
            "| CO3001 | BT1 | 15/04/2026 | 10% |",
        ].join("\n");
        expect(parseDeadlinesRegex(text)).toHaveLength(0);
    });

    test("still parses plain pasted text", () => {
        const text = [
            "CO3001 - Phân tích thiết kế hướng đối tượng",
            "- Bài tập 1 - hạn nộp: 15/04/2026 (10%)",
        ].join("\n");
        const deadlines = parseDeadlinesRegex(text);
        expect(deadlines).toHaveLength(1);
        expect(deadlines[0].taskName).toBe("Bài tập 1");
        expect(deadlines[0].courseName).toBe("CO3001 - Phân tích thiết kế hướng đối tượng");
    });

    test("extracts the due time from the task line", () => {
        const text = [
            "CO3001 - Phân tích thiết kế hướng đối tượng",
            "- Bài tập 1 - hạn nộp lúc 23:59 ngày 15/04/2026 (10%)",
        ].join("\n");
        const deadlines = parseDeadlinesRegex(text);
        expect(deadlines).toHaveLength(1);
        expect(deadlines[0]).toMatchObject({
            taskName: "Bài tập 1",
            dueDate: "2026-04-15",
            dueTime: "23:59",
            weight: 0.1,
        });
    });

    test("keeps dueTime null when the line has no time", () => {
        const deadlines = parseDeadlinesRegex("BT1 - hạn nộp: 15/04/2026");
        expect(deadlines[0].dueTime).toBeNull();
    });
});

describe("extractDueTime", () => {
    test("parses 24h times", () => {
        expect(extractDueTime("hạn nộp lúc 23:59")).toBe("23:59");
        expect(extractDueTime("nộp trước 9:30")).toBe("09:30");
        expect(extractDueTime("deadline 23:59, ngày 15/04")).toBe("23:59");
    });

    test("parses 12h AM/PM times", () => {
        expect(extractDueTime("11:59 PM")).toBe("23:59");
        expect(extractDueTime("11:59 PM ngày 15/04/2026")).toBe("23:59");
        expect(extractDueTime("12:00 AM")).toBe("00:00");
        expect(extractDueTime("12:00 PM")).toBe("12:00");
        expect(extractDueTime("9:30 am")).toBe("09:30");
        expect(extractDueTime("11 PM")).toBe("23:00");
    });

    test("returns null without a time", () => {
        expect(extractDueTime("hạn nộp: 15/04/2026")).toBeNull();
        expect(extractDueTime("Bài tập nhóm")).toBeNull();
    });
});

describe("normalizeDueTime", () => {
    test("normalizes and rejects invalid values", () => {
        expect(normalizeDueTime("23:59")).toBe("23:59");
        expect(normalizeDueTime("9:5")).toBe("09:05");
        expect(normalizeDueTime("25:00")).toBeNull();
        expect(normalizeDueTime("12:60")).toBeNull();
        expect(normalizeDueTime("")).toBeNull();
        expect(normalizeDueTime(null)).toBeNull();
        expect(normalizeDueTime(undefined)).toBeNull();
    });
});

describe("extractDueDate", () => {
    test("parses iso, slash, and yearless dates", () => {
        expect(extractDueDate("hạn nộp: 2026-04-15")).toBe("2026-04-15");
        expect(extractDueDate("hạn nộp: 15/04/2026")).toBe("2026-04-15");
        expect(extractDueDate("hạn nộp: 15/04")).toBe(String(new Date().getFullYear()) + "-04-15");
    });

    test("returns null without a date", () => {
        expect(extractDueDate("Bài tập nhóm")).toBeNull();
    });
});

describe("capTaskName", () => {
    test("leaves short names unchanged", () => {
        expect(capTaskName("Bài tập 1")).toBe("Bài tập 1");
        expect(capTaskName("  Bài tập 1  ")).toBe("Bài tập 1");
    });

    test("truncates long names with an ellipsis", () => {
        const long = "x".repeat(200);
        const capped = capTaskName(long);
        expect(capped).toHaveLength(121);
        expect(capped.endsWith("…")).toBe(true);
        expect(capTaskName(long, 10)).toBe("x".repeat(10) + "…");
    });

    test("keeps names at exactly the cap", () => {
        expect(capTaskName("x".repeat(120))).toBe("x".repeat(120));
    });
});

describe("validateParsedDeadlines caps oversized fields", () => {
    test("caps a document-blob taskName", () => {
        const blob = "Bài tập 1: " + "nội dung tài liệu ".repeat(30);
        const [d] = validateParsedDeadlines([{
            taskName: blob,
            dueDate: "2026-04-15",
            weight: 0.1,
            courseName: "CO3001 - OOP",
        }]);
        expect(d.taskName.length).toBeLessThanOrEqual(121);
        expect(d.taskName.endsWith("…")).toBe(true);
        expect(d.courseName).toBe("CO3001 - OOP");
    });

    test("caps oversized course names at 60 chars", () => {
        const [d] = validateParsedDeadlines([{
            taskName: "Bài tập 1",
            dueDate: "2026-04-15",
            weight: null,
            courseName: "CO3001 - " + "tên môn rất dài ".repeat(10),
        }]);
        expect(d.courseName.length).toBeLessThanOrEqual(61);
        expect(d.courseName.endsWith("…")).toBe(true);
    });
});