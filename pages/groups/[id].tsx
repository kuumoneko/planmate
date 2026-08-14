"use client";
import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import GroupView from "@/components/groups/GroupView";
import { useUser } from "@/hooks/useUser";
import { api } from "@/utils/api";
import { Group } from "@/types";
import { useRouter } from "next/router";

export default function GroupDetail() {
    const router = useRouter();
    const { user } = useUser();
    const identity = user?.mssv || user?.username || "";
    const groupId = String(router.query.id ?? "");
    const [group, setGroup] = useState<Group | null>(null);
    const [error, setError] = useState("");

    useEffect(() => {
        if (!groupId || !identity) return;
        api<Group>(`/api/groups/${groupId}`)
            .then(setGroup)
            .catch((e: any) => setError(e.message));
    }, [groupId, identity]);

    return (
        <div className="w-full h-full">
            <div className="p-4 pb-0">
                <Button variant="ghost" size="sm" onClick={() => (window.location.href = "/groups")}>
                    <ArrowLeft className="h-4 w-4 mr-2" /> Danh sách nhóm
                </Button>
            </div>
            {error ? (
                <p className="text-sm text-destructive p-4">{error}</p>
            ) : !group || !identity ? (
                <div className="p-4 flex flex-col gap-3">
                    <Skeleton className="h-8 w-64" />
                    <Skeleton className="h-40 w-full" />
                </div>
            ) : (
                <GroupView
                    group={group}
                    identity={identity}
                    onGroupChanged={setGroup}
                />
            )}
        </div>
    );
}