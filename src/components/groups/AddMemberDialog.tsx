"use client";
import { useEffect, useRef, useState } from "react";
import { Check, Database, Loader2, Search, UserPlus } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { api } from "@/utils/api";
import { Group } from "@/types";

interface DbUser {
    username: string;
    fullName: string;
    mssv: string;
    email: string;
}

function initials(name: string): string {
    return name
        .split(/\s+/)
        .filter(Boolean)
        .slice(-2)
        .map((w) => w[0])
        .join("")
        .toUpperCase();
}

export default function AddMemberDialog({
    group,
    identity,
    onAdded,
}: {
    group: Group;
    identity: string;
    onAdded: (g: Group) => void;
}) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [users, setUsers] = useState<DbUser[] | null>(null);
    const [error, setError] = useState("");
    const [adding, setAdding] = useState<string | null>(null);
    const [addedUsernames, setAddedUsernames] = useState<Set<string>>(new Set());
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        if (!open) return;
        setError("");
        setAddedUsernames(new Set());
        setUsers(null);
        setQuery("");
    }, [open]);

    useEffect(() => {
        if (!open) return;
        if (timerRef.current) clearTimeout(timerRef.current);
        if (query.trim().length === 0) {
            setUsers([]);
            setError("");
            return;
        }
        timerRef.current = setTimeout(async () => {
            try {
                const data = await api<{ users: DbUser[] }>(
                    `/api/groups/${group.id}/members?studentId=${encodeURIComponent(identity)}&q=${encodeURIComponent(query.trim())}`
                );
                setUsers(data.users);
                setError("");
            } catch (e: any) {
                setError(e.message);
                setUsers([]);
            }
        }, 250);
        return () => {
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, [query, open, group.id, identity]);

    const add = async (u: DbUser) => {
        setAdding(u.username);
        setError("");
        try {
            const data = await api<{ group: Group; resolved: boolean }>(
                `/api/groups/${group.id}/members`,
                { method: "POST", body: { studentId: identity, memberUsername: u.username } }
            );
            onAdded(data.group);
            setAddedUsernames((prev) => new Set(prev).add(u.username));
        } catch (e: any) {
            setError(e.message);
        } finally {
            setAdding(null);
        }
    };

    return (
        <>
            <Button
                variant="outline"
                size="sm"
                onClick={() => setOpen(true)}
                className="w-full"
            >
                <Database className="h-4 w-4 mr-2" /> Thêm từ cơ sở dữ liệu
            </Button>
            <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Thêm thành viên từ cơ sở dữ liệu</DialogTitle>
                    <DialogDescription>
                        Tìm người dùng đã đăng ký trong hệ thống để thêm vào {group.name}.
                    </DialogDescription>
                </DialogHeader>
                <div className="flex flex-col gap-3">
                    <div className="relative">
                        <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            className="pl-9"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder="Tìm theo tên, username, MSSV hoặc email…"
                            autoFocus
                        />
                    </div>

                    {error ? (
                        <p className="text-sm text-destructive">{error}</p>
                    ) : users === null ? (
                        <p className="text-sm text-muted-foreground flex items-center gap-2">
                            <Loader2 className="h-4 w-4 animate-spin" /> Đang tải danh sách…
                        </p>
                    ) : users.length === 0 ? (
                        query.trim().length === 0 ? (
                            <p className="text-sm text-muted-foreground">
                                Nhập từ khóa để tìm kiếm người dùng.
                            </p>
                        ) : (
                            <p className="text-sm text-muted-foreground">
                                Không tìm thấy người dùng nào (đã loại các thành viên hiện có).
                            </p>
                        )
                    ) : (
                            <div className="max-h-64 overflow-y-auto flex flex-col gap-1">
                            {users.map((u) => {
                                const added = addedUsernames.has(u.username);
                                return (
                                    <div
                                        key={u.username}
                                        className="flex items-center justify-between gap-2 rounded-lg border p-2"
                                    >
                                        <div className="flex items-center gap-2 min-w-0">
                                            <Avatar className="h-8 w-8 shrink-0">
                                                <AvatarFallback>{initials(u.fullName)}</AvatarFallback>
                                            </Avatar>
                                            <div className="min-w-0">
                                                <p className="text-sm font-medium truncate">{u.fullName}</p>
                                                <p className="text-xs text-muted-foreground truncate">
                                                    {u.username} · {u.email}
                                                </p>
                                            </div>
                                        </div>
                                        {added ? (
                                            <Check className="h-4 w-4 text-green-500 shrink-0" />
                                        ) : (
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                className="h-7 shrink-0"
                                                onClick={() => add(u)}
                                                disabled={adding !== null}
                                            >
                                                {adding === u.username ? (
                                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                ) : (
                                                    <UserPlus className="h-3.5 w-3.5" />
                                                )}
                                            </Button>
                                        )}
                                    </div>
                                );
                            })}
                            </div>
                        )}
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => setOpen(false)}>
                        Đóng
                    </Button>
                </DialogFooter>
            </DialogContent>
            </Dialog>
        </>
    );
}
