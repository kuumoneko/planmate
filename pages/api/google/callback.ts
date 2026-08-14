import { NextApiRequest, NextApiResponse } from "next";
import { googleConfig, handleCallback } from "@/lib/calendar/google";

/**
 * GET /api/google/callback?code=...&state=username
 * Google redirect target. Exchanges the code for a refresh token,
 * persists it per-student, then returns the user to the Export page.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (!googleConfig()) {
        return res.status(501).json({ ok: false, data: "Google Calendar is not configured" });
    }
    const code = String(req.query.code ?? "");
    const username = String(req.query.state ?? "").trim();

    if (!code || !username) {
        return res.redirect("/export?google=error");
    }
    try {
        await handleCallback(code, username);
        return res.redirect("/export?google=connected");
    } catch (e: any) {
        console.error(e);
        return res.redirect("/export?google=error");
    }
}
