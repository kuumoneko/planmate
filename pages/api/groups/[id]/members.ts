import { NextApiRequest, NextApiResponse } from "next";
import {
    addMember,
    getGroup,
    HCMUT_EMAIL_RE,
    isLeaderOf,
    removeMember,
    resolveUserByEmail,
    resolveUserByUsername,
    searchUsers,
} from "@/lib/groups";

/**
 * /api/groups/[id]/members
 *  GET    ?q=<term>         -> search app users (leader only)
 *  POST   {studentId?, username?, email}    -> add member by app email or username
 *                                              (registered users only, leader only)
 *  POST   {studentId?, username?, memberUsername} -> add member picked from the database (leader only)
 *  DELETE {studentId?, username?, email}    -> remove member (leader or self)
 * Identity is MSSV first (`studentId`), `username` accepted as fallback.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    try {
        const group = await getGroup(String(req.query.id));
        if (!group) {
            return res.status(404).json({ ok: false, data: "Group not found" });
        }

        const identity = String(
            req.query.studentId ?? req.query.username ?? req.body?.studentId ?? req.body?.username ?? ""
        ).trim();
        if (!identity && req.method !== "GET") {
            return res.status(400).json({ ok: false, data: "studentId/username are required" });
        }
        const isLeader = isLeaderOf(group, identity);

        if (req.method === "GET") {
            if (!isLeader) {
                return res.status(403).json({ ok: false, data: "Chỉ trưởng nhóm xem danh sách người dùng" });
            }
            const q = String(req.query.q ?? "").trim();
            if (!q) {
                return res.status(200).json({ ok: true, data: { users: [] } });
            }
            const users = await searchUsers(q, group.members.map((m) => m.email));
            return res.status(200).json({ ok: true, data: { users } });
        }

        const email = String(req.body?.email ?? "").trim().toLowerCase();

        if (req.method === "POST") {
            if (!isLeader) {
                return res.status(403).json({ ok: false, data: "Chỉ trưởng nhóm mời thành viên" });
            }

            if (email.length > 0) {
                const isHcmutEmail = HCMUT_EMAIL_RE.test(email);
                const resolved = isHcmutEmail
                    ? await resolveUserByEmail(email)
                    : await resolveUserByUsername(email);
                if (!resolved) {
                    return res.status(400).json({
                        ok: false,
                        data: "Người dùng chưa đăng ký tài khoản trên web — hãy yêu cầu họ đăng nhập vào web này ít nhất 1 lần.",
                    });
                }
                const memberKey = (resolved as { email?: string }).email ?? email.toLowerCase();
                if (group.members.some((m) => m.email === memberKey)) {
                    return res.status(400).json({ ok: false, data: "Thành viên đã có trong nhóm" });
                }
                const updated = await addMember(group, memberKey, resolved);
                return res.status(200).json({
                    ok: true,
                    data: { group: updated, resolved: true },
                });
            }

            const memberUsername = String(req.body?.memberUsername ?? "").trim();
            if (memberUsername.length === 0) {
                return res.status(400).json({ ok: false, data: "email or memberUsername are required" });
            }
            const resolved = await resolveUserByUsername(memberUsername);
            if (!resolved) {
                return res.status(400).json({
                    ok: false,
                    data: "Người dùng chưa đăng ký tài khoản trên web — hãy yêu cầu họ đăng nhập vào web này ít nhất 1 lần.",
                });
            }
            if (group.members.some((m) => m.email === resolved.email)) {
                return res.status(400).json({ ok: false, data: "Thành viên đã có trong nhóm" });
            }
            const updated = await addMember(group, resolved.email, resolved);
            return res.status(200).json({
                ok: true,
                data: { group: updated, resolved: true },
            });
        }

        if (req.method === "DELETE") {
            if (!email) {
                return res.status(400).json({ ok: false, data: "email are required" });
            }
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
