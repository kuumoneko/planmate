"use client";

import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { useUser } from "@/hooks/useUser";
import type { Group } from "@/types";
import GroupCreateDialog from "@/components/groups/GroupCreateDialog";

export default function Sidebar_Groups() {
    const { user, loading: userLoading } = useUser();
    const [groups, setGroups] = useState<Group[] | null>(null);

    useEffect(() => {
        if (userLoading) return;
        let cancelled = false;
        const accountId = (user?.username || "").trim();
        const lmsLoginId = (user?.mssv || accountId).trim() || accountId;
        if (!lmsLoginId) {
            setGroups([]);
            return;
        }
        (async () => {
            try {
                const res = await fetch(
                    `/api/groups?studentId=${encodeURIComponent(lmsLoginId)}`,
                );
                const json = await res.json();
                if (!cancelled)
                    setGroups(json.ok ? (json.data as Group[]) : []);
            } catch {
                if (!cancelled) setGroups([]);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [user?.username, user?.mssv, userLoading]);

    return (
        <div className="w-full mt-4 bg-slate-700 text-slate-800 dark:text-white rounded-3xl p-4 flex flex-[0.7] flex-col gap-3 min-h-0">
            <a
                href="/groups"
                className="flex items-center justify-between hover:opacity-80"
            >
                <span className="text-sm font-medium">Nhóm học tập</span>
                <span className="text-xs text-[#64748b] dark:text-slate-400">
                    {groups === null
                        ? "..."
                        : `${groups.length} nhóm của bạn`}
                </span>
            </a>
            <GroupCreateDialog
                username={user?.username ?? ""}
                onCreated={(g) => setGroups((prev) => [g, ...(prev ?? [])])}
                trigger={
                    <button className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-slate-600/60 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-600">
                        <Plus className="size-4" /> Thêm nhóm
                    </button>
                }
            />
            {groups === null && (
                <div className="flex flex-col gap-2">
                    {[0, 1].map((i) => (
                        <div
                            key={i}
                            className="h-8 rounded-xl bg-slate-600/60 animate-pulse"
                        />
                    ))}
                </div>
            )}
            {groups !== null && groups.length === 0 && (
                <p className="text-xs text-[#64748b] dark:text-slate-400">
                    Chưa tham gia nhóm nào. Bấm Thêm nhóm để tạo.
                </p>
            )}
            {groups !== null && groups.length > 0 && (
                <div className="flex flex-col gap-1.5 min-h-0 overflow-y-auto">
                    {groups.map((g) => (
                        <a
                            key={g.id}
                            href={`/groups/${g.id}`}
                            className="rounded-xl bg-slate-600/60 px-3 py-2 hover:bg-slate-600"
                        >
                            <p className="truncate text-sm">{g.name}</p>
                            <p className="truncate text-xs text-[#64748b] dark:text-slate-400">
                                {g.courseName ||
                                    g.courseCode ||
                                    "Chưa có môn"}{" "}
                                · {g.members.length} thành viên
                            </p>
                        </a>
                    ))}
                </div>
            )}
        </div>
    );
}
