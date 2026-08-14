import { NextApiRequest, NextApiResponse } from "next";
import Mongo_client_Component from "@/lib/mongodb";
import { googleConfig, syncScheduleToGoogle } from "@/lib/calendar/google";
import { parseScheduleToEvents } from "@/utils/calendar/parser";
import { ExamInfo, SubjectInfo } from "@/types";

/**
 * POST /api/google/sync   { username }
 * Push the student's cached schedule + exams to their Google Calendar.
 * Idempotent (see google_events mapping collection).
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== "POST") {
        return res.status(405).json({ ok: false, data: "Method not allowed" });
    }
    if (!googleConfig()) {
        return res.status(501).json({ ok: false, data: "Google Calendar is not configured" });
    }

    const username = String(req.body?.username ?? "").trim();
    if (!username) {
        return res.status(400).json({ ok: false, data: "username is required" });
    }

    try {
        const client = await Mongo_client_Component();
        await client.connect();
        const record = await client
            .db("hcmut")
            .collection("data")
            .findOne({ username }, { projection: { _id: 0, schedule: 1, exam: 1 } });

        const schedule = (record?.schedule ?? []).filter(
            (item: unknown) => typeof item !== "string"
        ) as SubjectInfo[];
        const exams = (record?.exam ?? []).filter(
            (item: unknown) => typeof item !== "string"
        ) as ExamInfo[];

        const events = parseScheduleToEvents(schedule, exams);
        const result = await syncScheduleToGoogle(username, events);

        return res.status(200).json({ ok: true, data: result });
    } catch (e: any) {
        console.error(e);
        return res.status(500).json({ ok: false, data: e.message });
    }
}
