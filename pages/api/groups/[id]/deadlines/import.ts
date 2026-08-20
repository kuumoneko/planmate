import { NextApiRequest, NextApiResponse } from "next";
import { getGroup, isLeaderOf } from "@/lib/groups";
import { hasGeminiConfigured } from "@/lib/chat/gemini";
import { parseDeadlinesFromImage, parseLmsMarkdown } from "@/lib/lms-parse";

/**
 * /api/groups/[id]/deadlines/import
 *  POST {studentId?, username?, text} | {image, mimeType}   (leader only)
 *
 * Parses LMS content (pasted text with regex/Gemini, screenshots with Gemini
 * vision) into candidate deadlines for the group. Nothing is persisted here —
 * the leader reviews the parsed rows client-side and commits them via the
 * existing POST /api/groups/[id]/tasks endpoint (one call per task), which
 * keeps authorization, invite .ics generation and Google Calendar push in one
 * battle-tested place.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    try {
        if (req.method !== "POST") {
            return res.status(405).json({ ok: false, data: "Method not allowed" });
        }

        const group = await getGroup(String(req.query.id));
        if (!group) {
            return res.status(404).json({ ok: false, data: "Group not found" });
        }

        const identity = String(req.body?.studentId ?? req.body?.username ?? "").trim();
        if (!identity) {
            return res.status(400).json({ ok: false, data: "studentId or username is required" });
        }
        if (!isLeaderOf(group, identity)) {
            return res.status(403).json({ ok: false, data: "Chỉ trưởng nhóm nhập deadline" });
        }

        const image = typeof req.body?.image === "string" ? req.body.image : "";
        const mimeType = typeof req.body?.mimeType === "string" ? req.body.mimeType : "";

        if (image) {
            if (!["image/jpeg", "image/png"].includes(mimeType)) {
                return res.status(400).json({ ok: false, data: "Chỉ hỗ trợ ảnh jpg/png" });
            }
            if (!hasGeminiConfigured()) {
                return res
                    .status(501)
                    .json({ ok: false, data: "Chưa cấu hình GEMINI_API_KEY, không thể nhận dạng ảnh" });
            }
            const deadlines = await parseDeadlinesFromImage(image, mimeType);
            return res.status(200).json({ ok: true, data: { deadlines, source: "gemini" } });
        }

        const text = String(req.body?.text ?? "");
        if (!text.trim()) {
            return res.status(400).json({ ok: false, data: "text is required" });
        }

        const startedAt = Date.now();
        const { deadlines, source } = await parseLmsMarkdown(text);
        console.log(
            `[api/groups/${group.id}/deadlines/import] done in ${Date.now() - startedAt}ms source=${source} deadlines=${deadlines.length}`
        );
        return res.status(200).json({ ok: true, data: { deadlines, source } });
    } catch (e: any) {
        console.error(e);
        return res.status(500).json({ ok: false, data: e.message });
    }
}