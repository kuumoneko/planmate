"use client";
import { useRouter } from "next/router";
import DashboardClient from "@/components/dashboard/DashboardClient";

/**
 * /dashboard
 * Rendered inside the legacy Pages Router shell (Nav + Sidebar + Footer via
 * pages/template.tsx), so it matches the rest of the main UI. The client
 * dashboard resolves the logged-in student (username keyed Mongo data docs,
 * MSSV for groups/LMS) and fetches /api/student/:id (cache -> live -> none).
 */
export default function DashboardPage() {
    const router = useRouter();

    if (!router.isReady) {
        return (
            <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                Đang tải…
            </div>
        );
    }

    const studentId = String(router.query.studentId ?? "").trim();
    return <DashboardClient studentId={studentId} />;
}
