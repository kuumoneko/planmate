import { NextApiRequest, NextApiResponse } from "next";
import {
    createGroup,
    getUserProfile,
    listGroupsForUser,
    listTasksForUser,
} from "@/lib/groups";

/**
 * /api/groups
 *  GET  ?studentId=x[&withTasks=1]  -> groups the user belongs to (MSSV first,
 *                                      `?username=` accepted as fallback)
 *  POST {username, name, courseCode, courseName} -> create group
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    try {
        const identity = String(
            req.method === "GET"
                ? (req.query.studentId ?? req.query.username ?? "")
                : req.body?.username ?? ""
        ).trim();
        if (!identity) {
            return res.status(400).json({ ok: false, data: "studentId or username is required" });
        }

        if (req.method === "GET") {
            const groups = await listGroupsForUser(identity);
            if (req.query.withTasks === "1") {
                const tasks = await listTasksForUser(identity);
                const byGroup = new Map<string, any[]>();
                for (const task of tasks) {
                    const list = byGroup.get(task.groupId) ?? [];
                    list.push(task);
                    byGroup.set(task.groupId, list);
                }
                return res
                    .status(200)
                    .json({ ok: true, data: groups.map((g) => ({ ...g, tasks: byGroup.get(g.id) ?? [] })) });
            }
            return res.status(200).json({ ok: true, data: groups });
        }

        if (req.method === "POST") {
            const username = String(req.body?.username ?? "").trim();
            if (!username) {
                return res.status(400).json({ ok: false, data: "username is required" });
            }
            const { name, courseCode, courseName } = req.body ?? {};
            if (!name || !String(name).trim()) {
                return res.status(400).json({ ok: false, data: "name is required" });
            }
            const profile = await getUserProfile(username);
            if (!profile) {
                return res.status(400).json({
                    ok: false,
                    data: "Không tìm thấy hồ sơ người dùng. Hãy đăng nhập lại lần đầu để kích hoạt tài khoản.",
                });
            }
            const group = await createGroup({
                name: String(name),
                courseCode: String(courseCode ?? ""),
                courseName: String(courseName ?? ""),
                username,
                fullName: profile.fullName,
                email: profile.email,
                mssv: profile.mssv,
            });
            return res.status(201).json({ ok: true, data: group });
        }

        return res.status(405).json({ ok: false, data: "Method not allowed" });
    } catch (e: any) {
        console.error(e);
        return res.status(500).json({ ok: false, data: e.message });
    }
}
