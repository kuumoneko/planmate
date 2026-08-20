import { describe, expect, test } from "bun:test";
import {
    matchAssigneeToMember,
    normalizeForMatch,
} from "@/utils/groups/assignee-match";
import type { GroupMember } from "@/types";

const members: GroupMember[] = [
    {
        studentId: "2310001",
        email: "nhat.mai@hcmut.edu.vn",
        fullName: "Mai Ngọc Nhật",
        isLeader: true,
        joinedAt: "",
        scheduleShared: true,
        username: "nhat.mai",
    },
    {
        studentId: "",
        email: "alex_dev",
        fullName: "Alex Nguyễn",
        isLeader: false,
        joinedAt: "",
        scheduleShared: true,
        username: "alex_dev",
    },
    {
        studentId: "",
        email: "linh_tran",
        fullName: "Trần Thu Linh",
        isLeader: false,
        joinedAt: "",
        scheduleShared: true,
        username: "linh_tran",
    },
];

describe("normalizeForMatch", () => {
    test("strips diacritics and lowercases", () => {
        expect(normalizeForMatch("Mai Ngọc Nhật")).toBe("mai ngoc nhat");
        expect(normalizeForMatch("NGUYỄN VĂN AN")).toBe("nguyen van an");
    });

    test("collapses separators into spaces", () => {
        expect(normalizeForMatch("nhat.mai")).toBe("nhat mai");
        expect(normalizeForMatch("alex_dev")).toBe("alex dev");
    });
});

describe("matchAssigneeToMember", () => {
    test("exact full name match", () => {
        const result = matchAssigneeToMember("Mai Ngọc Nhật", members);
        expect(result?.member.email).toBe("nhat.mai@hcmut.edu.vn");
        expect(result?.confidence).toBe("exact");
    });

    test("diacritic-insensitive full name match", () => {
        const result = matchAssigneeToMember("MAI NGỌC NHẬT", members);
        expect(result?.member.username).toBe("nhat.mai");
    });

    test("email prefix match", () => {
        const result = matchAssigneeToMember("nhat.mai", members);
        expect(result?.member.email).toBe("nhat.mai@hcmut.edu.vn");
        expect(result?.confidence).toBe("exact");
    });

    test("local username match", () => {
        const result = matchAssigneeToMember("alex_dev", members);
        expect(result?.member.username).toBe("alex_dev");
        expect(result?.confidence).toBe("exact");
    });

    test("single-token partial match", () => {
        const result = matchAssigneeToMember("Linh", members);
        expect(result?.member.username).toBe("linh_tran");
        expect(result?.confidence).toBe("partial");
    });

    test("null on empty / unassigned / unknown assignee", () => {
        expect(matchAssigneeToMember("", members)).toBeNull();
        expect(matchAssigneeToMember("   ", members)).toBeNull();
        expect(matchAssigneeToMember("Unassigned", members)).toBeNull();
        expect(matchAssigneeToMember("Team Dev", members)).toBeNull();
        expect(matchAssigneeToMember(null, members)).toBeNull();
    });

    test("excluded members are skipped", () => {
        const result = matchAssigneeToMember("Linh", members, {
            excludeEmails: ["linh_tran"],
        });
        expect(result).toBeNull();
    });
});
