import { NextApiRequest, NextApiResponse } from "next";
import Mongo_client_Component from "@/lib/mongodb";
import { ExamInfo, SubjectInfo } from "@/types";
import { parseScheduleToEvents } from "@/utils/calendar/parser";
import { buildIcs } from "@/utils/calendar/ics";

/**
 * GET /api/calendar/:studentId.ics
 *
 * Serves the student's cached schedule + exams as a standard iCalendar file.
 * The same URL works as a Webcal subscription:
 *   webcal://{host}/api/calendar/{mssv}.ics
 *
 * Data comes from the Mongo cache, so it keeps working while
 * mybk.hcmut.edu.vn is down (the app's existing offline story).
 * NOTE: user-applied filters are client-side only and not reflected here (MVP).
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    try {
        const studentId = String(req.query.studentId ?? "").trim();
        if (!studentId) {
            return res.status(400).json({ ok: false, data: "studentId is required" });
        }

        const client = await Mongo_client_Component();
        await client.connect();
        const collection = client.db("hcmut").collection("data");

        // Resolve MSSV -> username (the app stores profiles under `user.MSSV`).
        const docs = await collection
            .find({}, { projection: { _id: 0, username: 1, user: 1, MSSV: 1 } })
            .toArray();
        const match = docs.find(
            (doc: any) =>
                String(doc?.user?.MSSV ?? doc?.MSSV ?? "") === studentId
        );
        if (!match) {
            return res.status(404).json({ ok: false, data: "Student not found" });
        }

        const record = await collection.findOne(
            { username: match.username },
            { projection: { _id: 0, schedule: 1, exam: 1 } }
        );

        const schedule = (record?.schedule ?? []).filter(
            (item: unknown) => typeof item !== "string"
        ) as SubjectInfo[];
        const exams = (record?.exam ?? []).filter(
            (item: unknown) => typeof item !== "string"
        ) as ExamInfo[];

        const events = parseScheduleToEvents(schedule, exams);
        const ics = buildIcs(events, {
            owner: studentId,
            calendarName: `Lịch học ${studentId}`,
        });

        res.setHeader("Content-Type", "text/calendar; charset=utf-8");
        res.setHeader(
            "Content-Disposition",
            `attachment; filename="schedule-${studentId}.ics"`
        );
        res.setHeader("Cache-Control", "no-store");
        return res.status(200).send(ics);
    } catch (e: any) {
        return res.status(500).json({ ok: false, data: e.message });
    }
}
