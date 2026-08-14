import { NextResponse } from "next/server";
import { getGroup, listTasks, loadMemberSchedules } from "@/lib/groups";
import { subjectToCourse } from "@/utils/calendar/parser";
import { runChat, type ChatTurn } from "@/lib/chat/gemini";
import { buildGroupChatSystemInstruction } from "@/lib/chat/context";
import { findGroupFreeTime } from "../../../lib/group-free-time";
import type { CourseSchedule, QualifiedFreeTimeSlot } from "@/types";
import type { ChatIntent } from "@/lib/intent-classifier";

/**
 * Shared implementation of the group-scoped assistant, used by both
 * POST /api/chat (mode="group") and POST /api/groups/[id]/chat.
 */
export async function handleGroupChat(params: {
    username: string;
    groupId: string;
    message: string;
    history: ChatTurn[];
    intent: { intent: ChatIntent; matches: string[] };
}) {
    const { username, groupId, message, history, intent } = params;

    if (!username) {
        return NextResponse.json({ ok: false, data: "username is required" }, { status: 400 });
    }
    if (!groupId) {
        return NextResponse.json({ ok: false, data: "groupId is required" }, { status: 400 });
    }

    const group = await getGroup(groupId);
    if (!group) {
        return NextResponse.json({ ok: false, data: "Group not found" }, { status: 404 });
    }

    const isMember =
        group.createdBy === username ||
        group.members.some(
            (m) => m.username === username || m.email.split("@")[0] === username
        );
    if (!isMember) {
        return NextResponse.json(
            { ok: false, data: "Bạn không thuộc nhóm này" },
            { status: 403 }
        );
    }

    const tasks = await listTasks(group.id);
    const systemInstruction = buildGroupChatSystemInstruction({ group, tasks });

    const meta: {
        groupId: string;
        groupName: string;
        intent: ChatIntent;
        freeTimeSlots?: QualifiedFreeTimeSlot[];
        unavailableMembers?: string[];
    } = {
        groupId: group.id,
        groupName: group.name,
        intent: intent.intent,
    };

    // Free-time requests are answered with the computed intersection too, so
    // the client can render the slots instead of just prose.
    if (intent.intent === "group-free-time") {
        const schedules = await loadMemberSchedules(group);
        const timetables: CourseSchedule[][] = schedules.map((s) =>
            s.courses
                .map((sub) => subjectToCourse(sub))
                .filter((c): c is CourseSchedule => c !== null)
        );
        meta.freeTimeSlots = findGroupFreeTime(timetables);
        const known = new Set(schedules.map((s) => s.studentId));
        meta.unavailableMembers = group.members
            .filter((m) => !known.has(m.studentId))
            .map((m) => m.fullName);
    }

    const result = await runChat({
        systemInstruction,
        history,
        userMessage: message,
    });

    return NextResponse.json({
        ok: true,
        reply: result.text,
        mode: "group",
        intent: intent.intent,
        meta,
    });
}