"use client";
import { useState, useEffect } from "react";
import {
    CalendarClock,
    Check,
    Clock,
    Crown,
    Mail,
    Plus,
    RefreshCw,
    Trash2,
    TriangleAlert,
    UserMinus,
    UserPlus,
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import TaskCreateDialog from "./TaskCreateDialog";
import AddMemberDialog from "./AddMemberDialog";
import { api } from "@/utils/api";
import { FreeTimeSlot, Group, Task } from "@/types";

const DAY_NAMES = ["Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy", "Chủ Nhật"];

function initials(name: string): string {
    return name
        .split(/\s+/)
        .filter(Boolean)
        .slice(-2)
        .map((w) => w[0])
        .join("")
        .toUpperCase();
}

export default function GroupView({
    group,
    identity,
    onGroupChanged,
}: {
    group: Group;
    identity: string;
    onGroupChanged: (g: Group) => void;
}) {
    const isLeader =
        group.createdBy === identity ||
        Boolean(group.members.find((m) => m.isLeader)?.studentId === identity);

    const [tasks, setTasks] = useState<Task[] | null>(null);
    const [slots, setSlots] = useState<FreeTimeSlot[] | null>(null);
    const [slotMeta, setSlotMeta] = useState<{ memberCount: number; totalMembers: number } | null>(null);
    const [freeLoading, setFreeLoading] = useState(false);
    const [inviteEmail, setInviteEmail] = useState("");
    const [error, setError] = useState("");
    const [notice, setNotice] = useState("");

    useEffect(() => {
        if (!notice) return;
        const t = setTimeout(() => setNotice(""), 6000);
        return () => clearTimeout(t);
    }, [notice]);

    const unresolvedCount = group.members.filter((m) => !m.scheduleShared).length;

    const loadTasks = async () => {
        try {
            setTasks(await api<Task[]>(`/api/groups/${group.id}/tasks`));
        } catch {
            setTasks([]);
        }
    };

    const findFreeTime = async () => {
        setFreeLoading(true);
        setError("");
        try {
            const data = await api<{
                slots: FreeTimeSlot[];
                memberCount: number;
                totalMembers: number;
            }>(`/api/groups/${group.id}/free-time`, {
                method: "POST",
                body: { studentId: identity },
            });
            setSlots(data.slots);
            setSlotMeta({ memberCount: data.memberCount, totalMembers: data.totalMembers });
        } catch (e: any) {
            setError(e.message);
        } finally {
            setFreeLoading(false);
        }
    };

    const invite = async () => {
        if (!inviteEmail.trim()) return;
        setError("");
        try {
            const data = await api<{ group: Group; resolved: boolean }>(
                `/api/groups/${group.id}/members`,
                { method: "POST", body: { studentId: identity, email: inviteEmail } }
            );
            setInviteEmail("");
            onGroupChanged(data.group);
            setNotice(
                data.resolved
                    ? "Đã thêm thành viên. Nhắc họ đăng nhập vào web này để đồng bộ lịch học."
                    : `Đã thêm ${inviteEmail}. Tài khoản này chưa đăng nhập — thành viên phải đăng nhập vào web này ít nhất 1 lần để đồng bộ lịch học.`
            );
        } catch (e: any) {
            setError(e.message);
        }
    };

    const removeMember = async (email: string) => {
        try {
            const g = await api<Group>(`/api/groups/${group.id}/members`, {
                method: "DELETE",
                body: { studentId: identity, email },
            });
            onGroupChanged(g);
        } catch (e: any) {
            setError(e.message);
        }
    };

    const toggleTask = async (task: Task) => {
        const nextStatus =
            task.status === "done" ? "todo" : task.status === "in_progress" ? "done" : "in_progress";
        const updated = await api<Task>(`/api/groups/${group.id}/tasks`, {
            method: "PATCH",
            body: { studentId: identity, taskId: task.id, status: nextStatus },
        });
        setTasks((prev) =>
            (prev ?? []).map((t) => (t.id === task.id ? { ...t, ...updated } : t))
        );
    };

    const deleteTask = async (taskId: string) => {
        await api(`/api/groups/${group.id}/tasks`, {
            method: "DELETE",
            body: { studentId: identity, taskId },
        });
        setTasks((prev) => (prev ?? []).filter((t) => t.id !== taskId));
    };

    const doneCount = (tasks ?? []).filter((t) => t.status === "done").length;
    const progress = tasks && tasks.length > 0 ? Math.round((doneCount / tasks.length) * 100) : 0;

    return (
        <div className="w-full h-full overflow-y-auto p-4 flex flex-col gap-4">
            {/* Header */}
            <div className="flex items-start justify-between flex-wrap gap-2">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-2">
                        {group.name}
                        {isLeader && (
                            <Badge variant="secondary">
                                <Crown className="h-3 w-3 mr-1" /> Trưởng nhóm
                            </Badge>
                        )}
                    </h1>
                    <p className="text-sm text-muted-foreground">
                        {group.courseCode && <Badge variant="outline" className="mr-2">{group.courseCode}</Badge>}
                        {group.courseName}
                    </p>
                </div>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                        setTasks(null);
                        loadTasks();
                    }}
                >
                    <RefreshCw className="h-4 w-4 mr-2" /> Làm mới
                </Button>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            {unresolvedCount > 0 && (
                <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-600">
                    <TriangleAlert className="h-4 w-4 mt-0.5 shrink-0" />
                    <p>
                        <span className="font-medium">
                            Có {unresolvedCount} thành viên chưa đăng nhập vào web này.
                        </span>{" "}
                        Mọi thành viên phải đăng nhập ít nhất 1 lần để đồng bộ lịch học — nếu
                        không, họ sẽ hiện là “chưa có lịch” và bị bỏ qua khi tìm lịch trống
                        chung / giao việc.
                    </p>
                </div>
            )}

            {notice && <p className="text-sm text-amber-600">{notice}</p>}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Members */}
                <Card>
                    <CardHeader>
                        <CardTitle className="text-lg">Thành viên ({group.members.length})</CardTitle>
                        <CardDescription>Mời bạn học bằng email HCMUT</CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-3">
                        <div className="flex flex-col gap-2">
                            {group.members.map((m) => (
                                <div key={m.email} className="flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-2 min-w-0">
                                        <Avatar className="h-8 w-8">
                                            <AvatarFallback>{initials(m.fullName)}</AvatarFallback>
                                        </Avatar>
                                        <div className="min-w-0">
                                            <p className="text-sm font-medium truncate flex items-center gap-1">
                                                {m.fullName}
                                                {m.isLeader && <Crown className="h-3 w-3 text-amber-400" />}
                                            </p>
                                            <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
                                                <Mail className="h-3 w-3" /> {m.email}
                                            </p>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        {!m.scheduleShared && (
                                            <Badge variant="outline" className="text-[10px]">
                                                chưa có lịch
                                            </Badge>
                                        )}
                                        {!m.isLeader &&
                                            (isLeader ||
                                                m.studentId === identity ||
                                                m.username === identity) && (
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-7 w-7"
                                                onClick={() => removeMember(m.email)}
                                            >
                                                <UserMinus className="h-3.5 w-3.5" />
                                            </Button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                        {isLeader && (
                            <div className="flex flex-col gap-2 pt-2 border-t">
                                <div className="flex gap-2">
                                    <Input
                                        value={inviteEmail}
                                        onChange={(e) => setInviteEmail(e.target.value)}
                                        placeholder="mssv@hcmut.edu.vn"
                                        onKeyDown={(e) => e.key === "Enter" && invite()}
                                    />
                                    <Button variant="outline" size="icon" onClick={invite}>
                                        <UserPlus className="h-4 w-4" />
                                    </Button>
                                </div>
                                <AddMemberDialog
                                    group={group}
                                    identity={identity}
                                    onAdded={(g) => {
                                        onGroupChanged(g);
                                        setNotice(
                                            "Đã thêm thành viên. Nhắc họ đăng nhập vào web này để đồng bộ lịch học."
                                        );
                                    }}
                                />
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Free time */}
                <Card className="lg:col-span-2">
                    <CardHeader>
                        <CardTitle className="text-lg flex items-center gap-2">
                            <Clock className="h-5 w-5" /> Lịch trống chung
                        </CardTitle>
                        <CardDescription>
                            So sánh thời khóa biểu của các thành viên (khung 07:00 - 21:00)
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-3">
                        <div className="flex items-center gap-2">
                            <Button size="sm" onClick={findFreeTime} disabled={freeLoading}>
                                <CalendarClock className="h-4 w-4 mr-2" />
                                {freeLoading ? "Đang tính..." : "Tìm lịch trống"}
                            </Button>
                            {slotMeta && (
                                <p className="text-xs text-muted-foreground">
                                    Đã so sánh {slotMeta.memberCount}/{slotMeta.totalMembers} thành viên
                                </p>
                            )}
                        </div>

                        {slots === null ? (
                            <p className="text-sm text-muted-foreground">
                                Nhấn “Tìm lịch trống” để xem khoảng thời gian cả nhóm rảnh trong tuần.
                            </p>
                        ) : slots.length === 0 ? (
                            <p className="text-sm text-muted-foreground">
                                Không tìm thấy khoảng trống chung nào ≥ 30 phút trong tuần.
                            </p>
                        ) : (
                            <div className="flex flex-col gap-2">
                                {DAY_NAMES.map((dayName, idx) => {
                                    const daySlots = slots.filter((s) => s.dayOfWeek === idx + 1);
                                    if (daySlots.length === 0) return null;
                                    return (
                                        <div key={dayName} className="flex items-center gap-2">
                                            <span className="w-20 text-sm font-medium">{dayName}</span>
                                            <div className="flex flex-wrap gap-1.5">
                                                {daySlots.map((s, i) => (
                                                    <Badge key={i} variant="secondary" className="font-mono">
                                                        {s.start} - {s.end}
                                                    </Badge>
                                                ))}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Tasks */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-lg flex items-center justify-between">
                        <span className="flex items-center gap-2">
                            <Check className="h-5 w-5" /> Công việc
                            {tasks && tasks.length > 0 && (
                                <Badge variant="outline">
                                    {doneCount}/{tasks.length}
                                </Badge>
                            )}
                        </span>
                        {isLeader && (
                            <TaskCreateDialog group={group} identity={identity} onCreated={(t) => {
                                setTasks((prev) => [...(prev ?? []), t]);
                            }} />
                        )}
                    </CardTitle>
                    <CardDescription>
                        {isLeader
                            ? "Bạn là trưởng nhóm — tạo công việc và giao việc cho thành viên."
                            : "Đánh dấu tiến độ công việc của nhóm."}
                    </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                    {tasks === null ? (
                        <div className="flex flex-col gap-2">
                            <Skeleton className="h-10 w-full" />
                            <Skeleton className="h-10 w-full" />
                        </div>
                    ) : tasks.length === 0 ? (
                        <p className="text-sm text-muted-foreground">Chưa có công việc nào.</p>
                    ) : (
                        <>
                            <Progress value={progress} className="h-2" />
                            <div className="flex flex-col gap-2">
                                {tasks.map((t) => {
                                    const overdue = Boolean(
                                        t.deadline &&
                                            t.status !== "done" &&
                                            new Date(t.deadline) < new Date()
                                    );
                                    return (
                                        <div
                                            key={t.id}
                                            className="flex items-center gap-3 rounded-lg border p-3"
                                        >
                                            <Checkbox
                                                checked={t.status === "done"}
                                                onCheckedChange={() => toggleTask(t)}
                                            />
                                            <div className="min-w-0 flex-1">
                                                <p
                                                    className={`text-sm font-medium truncate ${
                                                        t.status === "done" ? "line-through text-muted-foreground" : ""
                                                    }`}
                                                >
                                                    {t.title}
                                                </p>
                                                <p className="text-xs text-muted-foreground">
                                                    {t.assigneeEmail ? `Giao cho ${t.assigneeEmail}` : "Chưa phân công"}
                                                    {t.deadline &&
                                                        ` · Hạn: ${new Date(t.deadline).toLocaleString("vi-VN", {
                                                            day: "2-digit",
                                                            month: "2-digit",
                                                            year: "numeric",
                                                            hour: "2-digit",
                                                            minute: "2-digit",
                                                        })}`}
                                                </p>
                                            </div>
                                            {overdue && <Badge variant="destructive">Quá hạn</Badge>}
                                            {t.status === "in_progress" && (
                                                <Badge variant="secondary">Đang làm</Badge>
                                            )}
                                            {isLeader && (
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-7 w-7"
                                                    onClick={() => deleteTask(t.id)}
                                                >
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                </Button>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
