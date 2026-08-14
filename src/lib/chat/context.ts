/**
 * Chat context assembly: turns raw group data into the system instruction
 * injected into the model, so replies are grounded in real membership,
 * tasks and schedule info instead of hallucinated data.
 */

import type { Group, Task } from "@/types";

export interface GroupChatContext {
    group: Group;
    tasks: Task[];
}

const DAY_NAMES = ["", "thứ Hai", "thứ Ba", "thứ Tư", "thứ Năm", "thứ Sáu", "thứ Bảy", "Chủ nhật"];

/** Compact per-member line: "Tên (MSSV) — email — trưởng nhóm | chưa chia sẻ lịch". */
function memberLines(group: Group): string[] {
    return group.members.map((m) => {
        const role = m.isLeader ? "trưởng nhóm" : "thành viên";
        const schedule = m.scheduleShared ? "" : " (chưa chia sẻ lịch)";
        return `- ${m.fullName} (${m.studentId}), ${m.email} — ${role}${schedule}`;
    });
}

function taskLines(tasks: Task[]): string[] {
    if (tasks.length === 0) {
        return ["- (chưa có công việc nào)"];
    }
    return tasks.map((t) => {
        const assignee = t.assigneeEmail ? `, giao cho ${t.assigneeEmail}` : "";
        const deadline = t.deadline ? `, hạn ${t.deadline.slice(0, 16)}` : "";
        const statusLabel =
            t.status === "done" ? "đã xong" : t.status === "in_progress" ? "đang làm" : "chưa làm";
        return `- [${t.title}] (${statusLabel}${assignee}${deadline})`;
    });
}

/**
 * Build the system instruction for a group-scoped chat. The model is told to
 * answer in Vietnamese (mirroring the user's language), to never invent
 * members/tasks, and to suggest concrete next steps (free-time, tasks,
 * ICS export) instead of generic advice.
 */
export function buildGroupChatSystemInstruction(context: GroupChatContext): string {
    const { group, tasks } = context;
    const course = group.courseName || group.courseCode || "(chưa có môn học)";

    return [
        `Bạn là trợ lý của nhóm học tập "${group.name}" (môn: ${course}) trong ứng dụng BK Calendar.`,
        "",
        "Thành viên nhóm:",
        ...memberLines(group),
        "",
        "Công việc hiện tại của nhóm:",
        ...taskLines(tasks),
        "",
        "Quy tắc trả lời:",
        "- Trả lời bằng tiếng Việt (trừ khi người dùng hỏi bằng ngôn ngữ khác).",
        "- Chỉ dùng dữ liệu thành viên/công việc liệt kê ở trên; KHÔNG bịa tên, email hay công việc.",
        "- Nếu được hỏi về thời gian rảnh của nhóm, hướng dẫn người dùng dùng mục Lịch trống nhóm và gợi ý cách đặt buổi họp nhóm.",
        "- Nếu được hỏi về xuất lịch, gợi ý tính năng xuất file .ics.",
        "- Trả lời ngắn gọn, đúng trọng tâm, có thể dùng danh sách ngắn gọn.",
        `- Hôm nay là ${new Date().toLocaleDateString("vi-VN", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" })}.`,
    ].join("\n");
}

/** Short context summary used for the generic (non-group) chat modes. */
export function buildBaseSystemInstruction(): string {
    return [
        "Bạn là trợ lý BK Calendar dành cho sinh viên ĐH Bách Khoa TP.HCM.",
        "Bạn giúp sinh viên hiểu lịch học, lịch thi, deadline bài tập và quản lý nhóm học tập.",
        "Trả lời bằng tiếng Việt trừ khi người dùng dùng ngôn ngữ khác. Ngắn gọn, đúng trọng tâm.",
        "Nếu người dùng hỏi về dữ liệu cá nhân cụ thể (lịch học, lịch thi, deadline), hãy nói bạn cần họ mở trang tương ứng (Lịch học / Lịch thi / Nhóm) để xem dữ liệu thật.",
        "Không bịa thông tin. Khi không chắc chắn, nói rõ bạn không có dữ liệu đó.",
    ].join("\n");
}

/** Weekday label helper for slot descriptions. */
export function weekdayLabel(dayOfWeek: 1 | 2 | 3 | 4 | 5 | 6 | 7): string {
    return DAY_NAMES[dayOfWeek] ?? `ngày ${dayOfWeek}`;
}