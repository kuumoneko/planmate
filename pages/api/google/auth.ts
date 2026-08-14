import { NextApiRequest, NextApiResponse } from "next";
import { authUrl, googleConfig } from "@/lib/calendar/google";

/**
 * GET /api/google/auth?username=xxx
 * Start the Google OAuth consent flow. The `username` is carried in `state`
 * so the callback knows which student the credential belongs to.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (!googleConfig()) {
        return res.status(501).json({ ok: false, data: "Google Calendar is not configured" });
    }
    const username = String(req.query.username ?? "").trim();
    if (!username) {
        return res.status(400).json({ ok: false, data: "username is required" });
    }
    try {
        const url = await authUrl(username);
        return res.redirect(url);
    } catch (e: any) {
        return res.status(500).json({ ok: false, data: e.message });
    }
}
