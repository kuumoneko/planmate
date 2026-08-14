import { describe, expect, it } from "bun:test";
import type { CourseSchedule } from "@/types";
import {
    CAMPUS_ADDRESSES,
    campusFromRoom,
    detectCampusTravelConflict,
    getFullAddress,
    getRoomAddress,
} from "../location-helper";

describe("campusFromRoom", () => {
    it("maps H-prefixed rooms to CS2", () => {
        expect(campusFromRoom("H1-201")).toBe("CS2");
        expect(campusFromRoom("H6-302")).toBe("CS2");
        expect(campusFromRoom(" H2-101 ")).toBe("CS2");
    });

    it("maps every other room to CS1", () => {
        expect(campusFromRoom("B11-101")).toBe("CS1");
        expect(campusFromRoom("GĐ-104")).toBe("CS1");
        expect(campusFromRoom("NHATHIDAU")).toBe("CS1");
    });
});

describe("getFullAddress / getRoomAddress", () => {
    it("returns the known addresses", () => {
        expect(getFullAddress("CS2")).toContain("Dĩ An");
        expect(CAMPUS_ADDRESSES.CS1).toContain("Lý Thường Kiệt");
    });

    it("bundles room, campus and address", () => {
        const info = getRoomAddress("H6-302");
        expect(info.room).toBe("H6-302");
        expect(info.campus).toBe("CS2");
        expect(info.address).toBe(CAMPUS_ADDRESSES.CS2);
    });
});

function course(dayOfWeek: 1 | 2 | 3 | 4 | 5 | 6 | 7, room: string, code: string): CourseSchedule {
    return {
        courseCode: code,
        courseName: code,
        classGroup: "01",
        teacher: "GV",
        room,
        building: room,
        dayOfWeek,
        startTime: "07:00",
        endTime: "09:00",
        weeks: [1],
        dates: ["2026-01-05"],
    };
}

describe("detectCampusTravelConflict", () => {
    it("flags a weekday with classes on both campuses", () => {
        const conflicts = detectCampusTravelConflict([
            course(1, "B11-101", "CO3001"),
            course(1, "H6-302", "MT1001"),
            course(2, "B11-201", "HH2001"),
        ]);

        expect(conflicts).toHaveLength(1);
        expect(conflicts[0].dayOfWeek).toBe(1);
        expect(conflicts[0].campuses).toEqual(["CS1", "CS2"]);
        expect(conflicts[0].courses.map((c) => c.courseCode)).toEqual(["CO3001", "MT1001"]);
    });

    it("returns [] for single-campus weeks", () => {
        const conflicts = detectCampusTravelConflict([
            course(1, "B11-101", "CO3001"),
            course(1, "B11-201", "MT1001"),
            course(2, "H6-302", "HH2001"),
        ]);
        expect(conflicts).toEqual([]);
    });

    it("returns [] for an empty timetable", () => {
        expect(detectCampusTravelConflict([])).toEqual([]);
    });

    it("sorts conflicts by weekday", () => {
        const conflicts = detectCampusTravelConflict([
            course(5, "B11-101", "CO3001"),
            course(5, "H6-302", "MT1001"),
            course(3, "H2-101", "HH2001"),
            course(3, "B11-201", "FL2001"),
        ]);
        expect(conflicts.map((c) => c.dayOfWeek)).toEqual([3, 5]);
    });
});