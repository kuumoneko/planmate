import { NextApiRequest, NextApiResponse } from "next";
import { deleteGroup, getGroup, isLeaderOf, updateGroup } from "@/lib/groups";

/**
 * /api/groups/[id]
 *  GET    -> group detail
 *  PATCH  {studentId?, username?, name?, courseCode?, courseName?}  (leader only)
 *  DELETE {studentId?, username?}                                  (leader only)
 * Identity is MSSV first (`studentId`), `username` accepted as fallback.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    try {
        const group = await getGroup(String(req.query.id));
        if (!group) {
            return res.status(404).json({ ok: false, data: "Group not found" });
        }

        if (req.method === "GET") {
            return res.status(200).json({ ok: true, data: group });
        }

        const identity = String(req.body?.studentId ?? req.body?.username ?? "").trim();
        if (!identity) {
            return res.status(400).json({ ok: false, data: "studentId or username is required" });
        }
        const isLeader = isLeaderOf(group, identity);

        if (req.method === "PATCH") {
            if (!isLeader) {
                return res.status(403).json({ ok: false, data: "Chỉ trưởng nhóm được sửa" });
            }
            const { name, courseCode, courseName } = req.body ?? {};
            const updated = await updateGroup(group.id, {
                name: name !== undefined ? String(name) : undefined,
                courseCode: courseCode !== undefined ? String(courseCode) : undefined,
                courseName: courseName !== undefined ? String(courseName) : undefined,
            });
            return res.status(200).json({ ok: true, data: updated });
        }

        if (req.method === "DELETE") {
            if (!isLeader) {
                return res.status(403).json({ ok: false, data: "Chỉ trưởng nhóm được xoá" });
            }
            await deleteGroup(group.id);
            return res.status(200).json({ ok: true, data: "Deleted" });
        }

        return res.status(405).json({ ok: false, data: "Method not allowed" });
    } catch (e: any) {
        console.error(e);
        return res.status(500).json({ ok: false, data: e.message });
    }
}
