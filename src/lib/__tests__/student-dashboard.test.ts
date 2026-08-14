import { describe, expect, test } from "bun:test";
import { removeLmsDeadline } from "@/lib/student-dashboard";
import type { StudentDashboardData } from "@/types";

function makeDashboard(lmsCourses: StudentDashboardData["lmsCourses"]): StudentDashboardData {
    return {
        studentId: "nhat.maikuumo",
        profile: { fullName: "Sinh viên test", email: "test@hcmut.edu.vn" },
        timetable: [],
        exams: [],
        lmsCourses,
        campusConflicts: [],
        source: "none",
    };
}

describe("removeLmsDeadline", () => {
    test("removes the matching deadline and keeps others", () => {
        const dashboard = makeDashboard([
            {
                id: "CO3001",
                code: "CO3001",
                name: "PTTK hướng đối tượng",
                deadlines: [
                    { taskName: "Bài tập 1", dueDate: "2026-04-15", weight: 0.1, courseName: "CO3001" },
                    { taskName: "Bài tập 2", dueDate: "2026-05-30", weight: 0.2, courseName: "CO3001" },
                ],
            },
        ]);
        const updated = removeLmsDeadline(dashboard, {
            courseCode: "CO3001",
            taskName: "Bài tập 1",
            dueDate: "2026-04-15",
        });
        expect(updated.lmsCourses).toHaveLength(1);
        expect(updated.lmsCourses[0].deadlines).toHaveLength(1);
        expect(updated.lmsCourses[0].deadlines[0].taskName).toBe("Bài tập 2");
    });

    test("drops the course when no deadlines remain", () => {
        const dashboard = makeDashboard([
            {
                id: "CO3001",
                code: "CO3001",
                name: "PTTK hướng đối tượng",
                deadlines: [
                    { taskName: "Bài tập 1", dueDate: "2026-04-15", weight: null, courseName: "CO3001" },
                ],
            },
            {
                id: "CO2003",
                code: "CO2003",
                name: "Toán rời rạc",
                deadlines: [
                    { taskName: "Bài tập 2", dueDate: "2026-05-30", weight: null, courseName: "CO2003" },
                ],
            },
        ]);
        const updated = removeLmsDeadline(dashboard, {
            courseCode: "CO3001",
            taskName: "Bài tập 1",
            dueDate: "2026-04-15",
        });
        expect(updated.lmsCourses).toHaveLength(1);
        expect(updated.lmsCourses[0].code).toBe("CO2003");
    });

    test("removes all identical duplicates in the same course", () => {
        const dashboard = makeDashboard([
            {
                id: "CO3001",
                code: "CO3001",
                name: "PTTK hướng đối tượng",
                deadlines: [
                    { taskName: "Bài tập 1", dueDate: "2026-04-15", weight: null, courseName: "CO3001" },
                    { taskName: "Bài tập 1", dueDate: "2026-04-15", weight: 0.1, courseName: "CO3001" },
                ],
            },
        ]);
        const updated = removeLmsDeadline(dashboard, {
            courseCode: "CO3001",
            taskName: "Bài tập 1",
            dueDate: "2026-04-15",
        });
        expect(updated.lmsCourses).toHaveLength(0);
    });

    test("no-op when nothing matches", () => {
        const dashboard = makeDashboard([
            {
                id: "CO3001",
                code: "CO3001",
                name: "PTTK hướng đối tượng",
                deadlines: [
                    { taskName: "Bài tập 1", dueDate: "2026-04-15", weight: null, courseName: "CO3001" },
                ],
            },
        ]);
        const updated = removeLmsDeadline(dashboard, {
            courseCode: "CO3001",
            taskName: "Không tồn tại",
            dueDate: "2026-04-15",
        });
        expect(updated.lmsCourses).toHaveLength(1);
        expect(updated.lmsCourses[0].deadlines).toHaveLength(1);
    });
});
