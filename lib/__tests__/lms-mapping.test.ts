import { describe, expect, test } from "bun:test";
import { groupByCourse, mergeLmsDeadlines } from "../lms/mapping";
import type { LmsCourse, ParsedDeadline } from "@/types";

describe("mergeLmsDeadlines", () => {
    const existing: LmsCourse[] = [
        {
            id: "1",
            code: "CO3001",
            name: "Phân tích thiết kế hướng đối tượng",
            url: "https://lms.hcmut.edu.vn/course/view.php?id=1",
            deadlines: [
                { taskName: "Bài tập 1", dueDate: "2026-04-15", weight: null, courseName: "CO3001" },
            ] as ParsedDeadline[],
        },
        {
            id: "99",
            code: "DEMO101",
            name: "Môn minh hoạ",
            deadlines: [
                { taskName: "Nộp báo cáo", dueDate: "2026-06-01", weight: 0.1, courseName: "DEMO101" },
            ] as ParsedDeadline[],
        },
    ];

    test("incoming course replaces the existing one and keeps its url", () => {
        const incoming: LmsCourse[] = [
            {
                id: "1",
                code: "CO3001",
                name: "Phân tích thiết kế hướng đối tượng",
                deadlines: [
                    { taskName: "Bài tập 2", dueDate: "2026-05-01", weight: 0.3, courseName: "CO3001" },
                ] as ParsedDeadline[],
            },
        ];
        const merged = mergeLmsDeadlines(existing, incoming);
        expect(merged).toHaveLength(2);
        const oop = merged.find((c) => c.code === "CO3001")!;
        expect(oop.url).toBe("https://lms.hcmut.edu.vn/course/view.php?id=1");
        expect(oop.deadlines.map((d) => d.taskName)).toEqual(["Bài tập 1", "Bài tập 2"]);
    });

    test("dedupes by taskName case-insensitively, incoming wins", () => {
        const incoming: LmsCourse[] = [
            {
                id: "1",
                code: "CO3001",
                name: "Phân tích thiết kế hướng đối tượng",
                deadlines: [
                    { taskName: "bài tập 1", dueDate: "2026-04-16", weight: 1, courseName: "CO3001" },
                ] as ParsedDeadline[],
            },
        ];
        const merged = mergeLmsDeadlines(existing, incoming);
        const oop = merged.find((c) => c.code === "CO3001")!;
        expect(oop.deadlines).toHaveLength(1);
        expect(oop.deadlines[0].dueDate).toBe("2026-04-16");
    });

    test("appends new incoming courses in order", () => {
        const incoming: LmsCourse[] = [
            { id: "2", code: "EE2015", name: "Kỹ thuật điện", deadlines: [] },
        ];
        const merged = mergeLmsDeadlines(existing, incoming);
        expect(merged.map((c) => c.code)).toEqual(["CO3001", "DEMO101", "EE2015"]);
    });

    test("keeps unrelated existing courses untouched", () => {
        const merged = mergeLmsDeadlines(existing, []);
        expect(merged).toEqual(existing);
    });
});

describe("groupByCourse", () => {
    test("groups deadlines by course name and builds course fields", () => {
        const deadlines: ParsedDeadline[] = [
            { taskName: "Bài tập 1", dueDate: "2026-04-15", weight: null, courseName: "CO3001 - OOP" },
            { taskName: "Bài tập 2", dueDate: "2026-05-30", weight: 0.2, courseName: "CO3001 - OOP" },
            { taskName: "Báo cáo", dueDate: "2026-06-01", weight: null, courseName: "Toán rời rạc" },
        ];
        const courses = groupByCourse(deadlines);
        expect(courses).toHaveLength(2);
        const oop = courses.find((c) => c.code === "CO3001 - OOP")!;
        expect(oop.id).toBe("co3001-oop");
        expect(oop.name).toBe("CO3001 - OOP");
        expect(oop.deadlines.map((d) => d.taskName)).toEqual(["Bài tập 1", "Bài tập 2"]);
    });

    test("sorts deadlines and courses deterministically", () => {
        const courses = groupByCourse([
            { taskName: "Muộn", dueDate: "2026-06-01", weight: null, courseName: "Z2022" },
            { taskName: "Sớm", dueDate: "2026-03-01", weight: null, courseName: "Z2022" },
            { taskName: "A", dueDate: "2026-05-01", weight: null, courseName: "A1011" },
        ]);
        expect(courses.map((c) => c.code)).toEqual(["A1011", "Z2022"]);
        expect(courses[1].deadlines.map((d) => d.taskName)).toEqual(["Sớm", "Muộn"]);
    });

    test("returns empty for no deadlines", () => {
        expect(groupByCourse([])).toEqual([]);
    });
});
