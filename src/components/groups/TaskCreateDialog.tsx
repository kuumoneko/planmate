"use client";
import { useState } from "react";
import { CalendarClock, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { api } from "@/utils/api";
import { Group, Task } from "@/types";

export default function TaskCreateDialog({
    group,
    identity,
    onCreated,
}: {
    group: Group;
    identity: string;
    onCreated: (task: Task) => void;
}) {
    const [open, setOpen] = useState(false);
    const [title, setTitle] = useState("");
    const [description, setDescription] = useState("");
    const [assigneeEmail, setAssigneeEmail] = useState("");
    const [deadline, setDeadline] = useState("");
    const [error, setError] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [inviteIcs, setInviteIcs] = useState<string | null>(null);
    const [googlePushed, setGooglePushed] = useState(false);

    const submit = async () => {
        if (!title.trim()) {
            setError("Tiêu đề là bắt buộc");
            return;
        }
        if (assigneeEmail && !group.members.some((m) => m.email === assigneeEmail)) {
            setError("Email phân công phải là thành viên trong nhóm");
            return;
        }
        setError("");
        setSubmitting(true);
        try {
            const data = await api<{ task: Task; ics: string | null; googlePushed: boolean }>(
                `/api/groups/${group.id}/tasks`,
                {
                    method: "POST",
                    body: {
                        studentId: identity,
                        title,
                        description,
                        assigneeEmail: assigneeEmail || undefined,
                        deadline: deadline ? new Date(deadline).toISOString() : undefined,
                    },
                }
            );
            setOpen(false);
            setTitle("");
            setDescription("");
            setAssigneeEmail("");
            setDeadline("");
            setInviteIcs(data.ics);
            setGooglePushed(Boolean(data.googlePushed));
            onCreated(data.task);
        } catch (e: any) {
            setError(e.message);
        } finally {
            setSubmitting(false);
        }
    };

    const downloadInvite = () => {
        if (!inviteIcs) return;
        const blob = new Blob([inviteIcs], { type: "text/calendar;charset=utf-8;" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `invite-${Date.now()}.ics`;
        a.click();
    };

    return (
        <>
            <Dialog open={open} onOpenChange={setOpen}>
                <DialogTrigger asChild>
                    <Button size="sm">
                        <CalendarClock className="h-4 w-4 mr-2" /> Thêm công việc
                    </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Tạo công việc cho {group.name}</DialogTitle>
                        <DialogDescription>
                            Công việc có hạn chót sẽ tự tạo lời mời lịch cho cả nhóm.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="flex flex-col gap-3">
                        <div className="flex flex-col gap-1.5">
                            <Label htmlFor="task-title">Tiêu đề *</Label>
                            <Input
                                id="task-title"
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                placeholder="VD: Hoàn thành báo cáo phần 1"
                            />
                        </div>
                        <div className="flex flex-col gap-1.5">
                            <Label htmlFor="task-desc">Mô tả</Label>
                            <Input
                                id="task-desc"
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                placeholder="Chi tiết công việc (tùy chọn)"
                            />
                        </div>
                        <div className="flex flex-col gap-1.5">
                            <Label htmlFor="task-assignee">Giao cho</Label>
                            <Select
                                value={assigneeEmail}
                                onValueChange={(v) => setAssigneeEmail(v)}
                            >
                                <SelectTrigger id="task-assignee" className="w-full justify-start">
                                    <SelectValue placeholder="Chưa phân công" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="">Chưa phân công (không giao)</SelectItem>
                                    {group.members.map((m) => (
                                        <SelectItem key={m.email} value={m.email}>
                                            <span>{m.fullName}</span>
                                            <span className="text-xs text-muted-foreground">
                                                {m.email}
                                            </span>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="flex flex-col gap-1.5">
                            <Label htmlFor="task-deadline">Hạn chót</Label>
                            <Input
                                id="task-deadline"
                                type="datetime-local"
                                value={deadline}
                                onChange={(e) => setDeadline(e.target.value)}
                            />
                        </div>
                        {error && <p className="text-sm text-destructive">{error}</p>}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setOpen(false)}>
                            Hủy
                        </Button>
                        <Button onClick={submit} disabled={submitting}>
                            {submitting ? "Đang tạo..." : "Tạo công việc"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {inviteIcs && (
                <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 rounded-lg border bg-card p-3 shadow-lg">
                    <p className="text-sm font-medium">
                        {googlePushed
                            ? "Đã đồng bộ lời mời vào Google Calendar 🎉"
                            : "Lời mời lịch đã sẵn sàng"}
                    </p>
                    <div className="flex gap-2">
                        {!googlePushed && (
                            <Button size="sm" variant="outline" onClick={downloadInvite}>
                                <UserPlus className="h-4 w-4 mr-1" /> Tải .ics
                            </Button>
                        )}
                        <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setInviteIcs(null)}
                        >
                            Đóng
                        </Button>
                    </div>
                </div>
            )}
        </>
    );
}
