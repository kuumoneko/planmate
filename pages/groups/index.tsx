"use client";
import { useEffect, useState } from "react";
import { FileText, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import GroupCreateDialog from "@/components/groups/GroupCreateDialog";
import { useUser } from "@/hooks/useUser";
import { api } from "@/utils/api";
import { Group } from "@/types";

export default function Groups() {
    const { user } = useUser();
    const [groups, setGroups] = useState<Group[] | null>(null);
    const [error, setError] = useState("");

    const identity = user?.mssv || user?.username || "";

    const load = async () => {
        if (!identity) return;
        try {
            setGroups(await api<Group[]>(`/api/groups?studentId=${encodeURIComponent(identity)}`));
            setError("");
        } catch (e: any) {
            setError(e.message);
        }
    };

    useEffect(() => {
        load();
    }, [identity]);

    return (
        <div className="w-full h-full overflow-y-auto p-4 flex flex-col gap-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-2">
                        <Users className="h-6 w-6" /> Nhóm học tập
                    </h1>
                    <p className="text-sm text-muted-foreground">
                        Làm BTL nhóm: mời bạn, tìm lịch rảnh chung và quản lý deadline.
                    </p>
                </div>
                {identity && (
                    <GroupCreateDialog username={user?.username ?? ""} onCreated={(g) => setGroups((prev) => [g, ...(prev ?? [])])} />
                )}
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            {groups === null ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <Skeleton className="h-32" />
                    <Skeleton className="h-32" />
                </div>
            ) : groups.length === 0 ? (
                <Card>
                    <CardHeader>
                        <CardTitle className="text-lg">Chưa có nhóm nào</CardTitle>
                        <CardDescription>
                            Tạo nhóm đầu tiên để mời bạn học cùng môn và đồng bộ hạn chót vào lịch.
                        </CardDescription>
                    </CardHeader>
                </Card>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {groups.map((g) => (
                        <Card key={g.id} className="hover:bg-accent/40 transition-colors cursor-pointer" onClick={() => (window.location.href = `/groups/${g.id}`)}>
                            <CardHeader>
                                <CardTitle className="text-base flex items-center gap-2">
                                    {g.name}
                                    <Badge variant="outline" className="text-xs">
                                        {g.members.length} TV
                                    </Badge>
                                </CardTitle>
                                <CardDescription className="flex items-center gap-1.5">
                                    <FileText className="h-3.5 w-3.5" />
                                    {g.courseCode || g.courseName || "Không có môn học"}
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                <Button variant="ghost" size="sm" className="h-7 px-2">
                                    Mở nhóm →
                                </Button>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    );
}