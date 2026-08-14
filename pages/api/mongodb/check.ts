import type { NextApiRequest, NextApiResponse } from "next";
import { getMongoClient } from "@/lib/mongodb";

/**
 * GET /api/mongodb/check
 * Connectivity health-check: pings the `hcmut` database and reports lag.
 */
export default async function handler(_req: NextApiRequest, res: NextApiResponse) {
    const started = Date.now();
    try {
        const client = await getMongoClient();
        await client.db("hcmut").command({ ping: 1 });
        const docs = await client.db("hcmut").collection("cache").countDocuments();
        return res.status(200).json({
            ok: true,
            data: { pingMs: Date.now() - started, cacheDocs: docs },
        });
    } catch (e: any) {
        console.error("[api/mongodb/check]", e);
        return res.status(500).json({ ok: false, data: e?.message ?? "Unknown mongo error" });
    }
}