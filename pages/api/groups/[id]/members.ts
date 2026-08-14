import { NextApiRequest, NextApiResponse } from "next";
import { addMember, getGroup, HCMUT_EMAIL_RE, isLeaderOf, removeMember, resolveUserByEmail } from "@/lib/groups";

/**
 * /api/groups/[id]/members
 *  POST   {studentId?, username?, email}  -> invite member by HCMUT email (leader only)
 *  DELETE {studentId?, username?, email}  -> remove member (leader or self)
 * Identity is MSSV first (`studentId`), `username` accepted as fallback.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    try {
        const group = await getGroup(String(req.query.id));
        if (!group) {
            return res.status(404).json({ ok: false, data: "Group not found" });
        }

        const identity = String(req.body?.studentId ?? req.body?.username ?? "").trim();
        const email = String(req.body?.email ?? "").trim().toLowerCase();
        if (!identity || !email) {
            return res.status(400).json({ ok: false, data: "studentId/username and email are required" });
        }
        if (!HCMUT_EMAIL_RE.test(email)) {
            return res.status(400).json({
                ok: false,
                data: "Email phải là email HCMUT (@hcmut.edu.vn)",
            });
        }

        const isLeader = isLeaderOf(group, identity);

        if (req.method === "POST") {
            if (!isLeader) {
                return res.status(403).json({ ok: false, data: "Chỉ trưởng nhóm mời thành viên" });
            }
            if (group.members.some((m) => m.email === email)) {
                return res.status(400).json({ ok: false, data: "Thành viên đã có trong nhóm" });
            }
            const resolved = await resolveUserByEmail(email);
            const updated = await addMember(group, email, resolved);
            return res.status(200).json({
                ok: true,
                data: { group: updated, resolved: Boolean(resolved) },
            });
        }

        if (req.method === "DELETE") {
            const member = group.members.find((m) => m.email === email);
            if (!member) {
                return res.status(404).json({ ok: false, data: "Thành viên không tồn tại" });
            }
            const isSelf = member.studentId === identity || member.username === identity;
            if (!isLeader && !isSelf) {
                return res.status(403).json({ ok: false, data: "Không có quyền xoá thành viên này" });
            }
            if (member.isLeader) {
                return res.status(400).json({ ok: false, data: "Không thể xoá trưởng nhóm" });
            }
            const updated = await removeMember(group, email);
            return res.status(200).json({ ok: true, data: updated });
        }

        return res.status(405).json({ ok: false, data: "Method not allowed" });
    } catch (e: any) {
        console.error(e);
        return res.status(500).json({ ok: false, data: e.message });
    }
}
