import { describe, expect, test } from "bun:test";
import { isLeaderOf, isMemberOf } from "@/lib/groups";
import type { Group } from "@/types";

const group: Group = {
    id: "g1",
    name: "Nhóm 1",
    courseCode: "CO3001",
    courseName: "Công nghệ phần mềm",
    createdBy: "khanh.nguyen",
    members: [
        {
            studentId: "2212345",
            email: "khanh.nguyen@hcmut.edu.vn",
            fullName: "Nguyễn Khánh",
            isLeader: true,
            joinedAt: "2026-01-01T00:00:00.000Z",
            scheduleShared: true,
            username: "khanh.nguyen",
        },
        {
            studentId: "2216789",
            email: "tuan.le@hcmut.edu.vn",
            fullName: "Lê Tuấn",
            isLeader: false,
            joinedAt: "2026-01-02T00:00:00.000Z",
            scheduleShared: true,
            username: "tuan.le",
        },
        {
            studentId: "2210000",
            email: "unknown@hcmut.edu.vn",
            fullName: "Unknown User",
            isLeader: false,
            joinedAt: "2026-01-03T00:00:00.000Z",
            scheduleShared: false,
        },
    ],
    createdAt: "2026-01-01T00:00:00.000Z",
};

describe("isLeaderOf", () => {
    test("matches by leader MSSV", () => {
        expect(isLeaderOf(group, "2212345")).toBe(true);
    });

    test("matches by legacy createdBy username", () => {
        expect(isLeaderOf(group, "khanh.nguyen")).toBe(true);
    });

    test("rejects members and strangers", () => {
        expect(isLeaderOf(group, "2216789")).toBe(false);
        expect(isLeaderOf(group, "9999999")).toBe(false);
    });

    test("rejects empty identity", () => {
        expect(isLeaderOf(group, "")).toBe(false);
        expect(isLeaderOf(group, "   ")).toBe(false);
    });
});

describe("isMemberOf", () => {
    test("matches by MSSV", () => {
        expect(isMemberOf(group, "2212345")).toBe(true);
        expect(isMemberOf(group, "2216789")).toBe(true);
    });

    test("matches members without username by MSSV only", () => {
        expect(isMemberOf(group, "2210000")).toBe(true);
    });

    test("matches by username and email prefix fallback", () => {
        expect(isMemberOf(group, "tuan.le")).toBe(true);
        expect(isMemberOf(group, "unknown")).toBe(true);
    });

    test("rejects non-members", () => {
        expect(isMemberOf(group, "9999999")).toBe(false);
    });

    test("rejects empty identity", () => {
        expect(isMemberOf(group, "")).toBe(false);
    });
});

describe("identity precedence", () => {
    const ambiguous: Group = {
        ...group,
        members: [
            { ...group.members[0], studentId: "1111111" },
            { ...group.members[1], studentId: "" },
        ],
    };

    test("MSSV takes precedence over username when both present", () => {
        expect(isLeaderOf(ambiguous, "1111111")).toBe(true);
        expect(isLeaderOf(ambiguous, "2212345")).toBe(false);
    });
});

describe("local-account members (no MSSV, email = username)", () => {
    const localGroup: Group = {
        ...group,
        createdBy: "kuumoneko",
        members: [
            {
                studentId: "",
                email: "kuumoneko",
                fullName: "Mai Ngọc Nhật",
                isLeader: true,
                joinedAt: "2026-08-15T00:00:00.000Z",
                scheduleShared: true,
                username: "kuumoneko",
            },
            {
                studentId: "",
                email: "import.test",
                fullName: "Import Test",
                isLeader: false,
                joinedAt: "2026-08-15T00:00:00.000Z",
                scheduleShared: true,
                username: "import.test",
            },
        ],
    };

    test("leader matched by username despite empty studentId", () => {
        expect(isLeaderOf(localGroup, "kuumoneko")).toBe(true);
        expect(isLeaderOf(localGroup, "import.test")).toBe(false);
    });

    test("member matched by username despite empty studentId", () => {
        expect(isMemberOf(localGroup, "kuumoneko")).toBe(true);
        expect(isMemberOf(localGroup, "import.test")).toBe(true);
    });

    test("empty identity never matches", () => {
        expect(isLeaderOf(localGroup, "")).toBe(false);
        expect(isMemberOf(localGroup, "")).toBe(false);
    });
});