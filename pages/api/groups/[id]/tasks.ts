import { NextApiRequest, NextApiResponse } from "next";
import {
    createTask,
    deleteTask,
    getGroup,
    isLeaderOf,
    isMemberOf,
    listTasks,
    updateTask,
} from "@/lib/groups";
import { GOOGLE_CALENDAR_ENABLED } from "@/lib/calendar/config";
import { pushEventToGoogle } from "@/lib/calendar/google";
import { buildIcs } from "@/utils/calendar/ics";
import { CalendarEventDraft, Task } from "@/types";

/**
 * /api/groups/[id]/tasks
 *  GET             -> tasks of the group
 *  POST   {studentId?, username?, title, description?, assigneeEmail?, deadline?}  (leader only)
 *  PATCH  {studentId?, username?, taskId, status?|title?|...}  (status by any member, edit by leader)
 *  DELETE {studentId?, username?, taskId}                                          (leader only)
 *
 * Identity is MSSV first (`studentId`), `username` accepted as fallback.
 * Creating a task with a deadline auto-builds a calendar invite (ICS, with
 * attendee list) and, when the leader has connected Google Calendar, pushes
 * it to everyone's calendars via the leader's account (username-keyed).
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    try {
        const group = await getGroup(String(req.query.id));
        if (!group) {
            return res.status(404).json({ ok: false, data: "Group not found" });
        }

        if (req.method === "GET") {
            const tasks = await listTasks(group.id);
            return res.status(200).json({ ok: true, data: tasks });
        }

        const identity = String(req.body?.studentId ?? req.body?.username ?? "").trim();
        if (!identity) {
            return res.status(400).json({ ok: false, data: "studentId or username is required" });
        }
        const leader = group.members.find((m) => m.isLeader);
        const leaderUsername = leader?.username ?? group.createdBy;
        const isLeader = isLeaderOf(group, identity);
        const isMember = isMemberOf(group, identity);

        if (req.method === "POST") {
            if (!isLeader) {
                return res.status(403).json({ ok: false, data: "Chỉ trưởng nhóm tạo công việc" });
            }
            const { title, description, assigneeEmail, deadline } = req.body ?? {};
            if (!title || !String(title).trim()) {
                return res.status(400).json({ ok: false, data: "title is required" });
            }

            const task = await createTask({
                groupId: group.id,
                title: String(title),
                description: String(description ?? ""),
                assigneeEmail: assigneeEmail ? String(assigneeEmail).toLowerCase() : undefined,
                deadline: deadline ? new Date(deadline).toISOString() : undefined,
                createdBy: identity,
            });

            // Group calendar push: invite ICS for every member.
            let ics: string | null = null;
            let googlePushed = false;
            if (task.deadline) {
                const event: CalendarEventDraft = {
                    uid: `task-${task.id}`,
                    title: `[${group.name}] ${task.title}`,
                    description: task.description || `Công việc nhóm ${group.name}`,
                    location: "",
                    startLocal: task.deadline.slice(0, 16),
                    endLocal: task.deadline.slice(0, 16),
                    exdates: [],
                    reminders: [
                        { method: "popup", minutesBefore: 60 },
                        { method: "email", minutesBefore: 1440 },
                    ],
                    attendees: group.members.map((m) => ({ email: m.email })),
                    source: { type: "task", id: task.id },
                };
                ics = buildIcs([event], { owner: group.id });

                if (GOOGLE_CALENDAR_ENABLED) {
                    googlePushed = await pushEventToGoogle(leaderUsername, event);
                }
            }

            return res.status(201).json({
                ok: true,
                data: { task, ics, googlePushed },
            });
        }

        if (req.method === "PATCH") {
            const taskId = String(req.body?.taskId ?? "");
            if (!taskId) return res.status(400).json({ ok: false, data: "taskId is required" });

            const tasks = await listTasks(group.id);
            const task = tasks.find((t: Task) => t.id === taskId);
            if (!task) return res.status(404).json({ ok: false, data: "Task not found" });

            const patch: Record<string, any> = {};
            if (req.body?.status !== undefined) {
                if (!["todo", "in_progress", "done"].includes(req.body.status)) {
                    return res.status(400).json({ ok: false, data: "invalid status" });
                }
                patch.status = req.body.status;
            }
            if (isLeader) {
                if (req.body?.title !== undefined) patch.title = String(req.body.title).trim();
                if (req.body?.description !== undefined)
                    patch.description = String(req.body.description);
                if (req.body?.assigneeEmail !== undefined)
                    patch.assigneeEmail = String(req.body.assigneeEmail).toLowerCase();
                if (req.body?.deadline !== undefined)
                    patch.deadline = req.body.deadline ? new Date(req.body.deadline).toISOString() : null;
            } else if (!isMember) {
                return res.status(403).json({ ok: false, data: "Không có quyền sửa" });
            }

            const updated = await updateTask(taskId, patch);
            return res.status(200).json({ ok: true, data: updated });
        }

        if (req.method === "DELETE") {
            if (!isLeader) {
                return res.status(403).json({ ok: false, data: "Chỉ trưởng nhóm xoá công việc" });
            }
            await deleteTask(String(req.body?.taskId ?? ""));
            return res.status(200).json({ ok: true, data: "Deleted" });
        }

        return res.status(405).json({ ok: false, data: "Method not allowed" });
    } catch (e: any) {
        console.error(e);
        return res.status(500).json({ ok: false, data: e.message });
    }
}
