"use client";
import { useEffect, useMemo, useState } from "react";
import {
    ClipboardPaste,
    FileUp,
    Loader2,
    TriangleAlert,
    Upload,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
} from "@/components/ui/tabs";
import { extractFileContent } from "@/lib/file-to-text";
import {
    MAX_IMAGE_PAYLOAD_BYTES,
    fileToBase64,
    prepareImage,
} from "@/lib/image-prepare";
import { api } from "@/utils/api";
import { matchAssigneeToMember, normalizeForMatch } from "@/utils/groups/assignee-match";
import type { Group, ParsedDeadline, Task } from "@/types";

interface ReviewRow {
    deadline: ParsedDeadline;
    assigneeEmail: string;
    skip: boolean;
    duplicate: boolean;
}

function todayIso(): string {
    return new Date().toISOString().slice(0, 10);
}

function priorityVariant(priority: string | undefined): "destructive" | "default" | "secondary" {
    if (priority === "High") return "destructive";
    if (priority === "Medium") return "default";
    return "secondary";
}

function formatDue(deadline: ParsedDeadline): string {
    const date = deadline.dueDate;
    const time = deadline.dueTime ? ` ${deadline.dueTime}` : "";
    const weight =
        deadline.weight != null ? ` · ${Math.round(deadline.weight * 100)}%` : "";
    return `${date}${time}${weight}`;
}

/**
 * Import LMS deadlines into a group's task board.
 *
 * Stage 1 — input: paste LMS text or upload a file/screenshot (reuses the
 * dashboard's extractFileContent + /api/lms/parse pipeline, but scoped to the
 * group and returning candidates WITHOUT persisting anything).
 * Stage 2 — review: each parsed row gets an assignee (auto-matched from the
 * Gemini-assigned name, manually overridable) and a skip toggle; expired and
 * duplicate rows are filtered/flagged.
 * Stage 3 — commit: confirmed rows are created one-by-one through the
 * existing POST /api/groups/[id]/tasks so invites (.ics) and Google Calendar
 * pushes keep working unchanged.
 */
export default function ImportDeadlinesDialog({
    group,
    identity,
    existingTasks,
    onImported,
}: {
    group: Group;
    identity: string;
    onImported: (summary: string) => void;
    existingTasks: Task[];
}) {
    const [open, setOpen] = useState(false);
    const [stage, setStage] = useState<"input" | "parsing" | "review" | "creating">("input");
    const [text, setText] = useState("");
    const [fileName, setFileName] = useState<string | null>(null);
    const [rows, setRows] = useState<ReviewRow[]>([]);
    const [source, setSource] = useState("");
    const [skippedExpired, setSkippedExpired] = useState(0);
    const [error, setError] = useState<string | null>(null);
    const [busyLabel, setBusyLabel] = useState("");
    const [invites, setInvites] = useState<{ title: string; ics: string }[] | null>(null);

    const pending = rows.filter((r) => !r.skip);
    const creating = stage === "creating";

    const memberOptions = useMemo(
        () => group.members.filter((m) => m.email.includes("@") || Boolean(m.username)),
        [group.members]
    );

    const close = () => {
        setOpen(false);
        reset();
    };

    const reset = () => {
        setStage("input");
        setText("");
        setFileName(null);
        setRows([]);
        setSource("");
        setSkippedExpired(0);
        setError(null);
        setBusyLabel("");
    };

    const applyParsed = (deadlines: ParsedDeadline[], source: string) => {
        const today = todayIso();
        const fresh = deadlines.filter((d) => d.dueDate >= today);
        const expiredCount = deadlines.length - fresh.length;

        const existingKeys = new Set(
            existingTasks
                .filter((t) => t.deadline)
                .map((t) => `${normalizeForMatch(t.title)}|${t.deadline!.slice(0, 10)}`)
        );

        const reviewRows: ReviewRow[] = fresh.map((deadline) => {
            const match = matchAssigneeToMember(deadline.assignee, group.members);
            const duplicate = existingKeys.has(
                `${normalizeForMatch(deadline.taskName)}|${deadline.dueDate}`
            );
            return {
                deadline,
                assigneeEmail: match?.member.email ?? "",
                skip: duplicate,
                duplicate,
            };
        });

        setRows(reviewRows);
        setSource(source);
        setSkippedExpired(expiredCount);
        setStage("review");
    };

    const parseText = async (
        payload: { text: string } | { image: string; mimeType: string },
        label: string
    ) => {
        setError(null);
        setInvites(null);
        setBusyLabel(label);
        setStage("parsing");
        try {
            const data = await api<{ deadlines: ParsedDeadline[]; source: string }>(
                `/api/groups/${group.id}/deadlines/import`,
                { method: "POST", body: { studentId: identity, ...payload } }
            );
            if (data.deadlines.length === 0) {
                setError("Không tìm thấy deadline nào trong nội dung vừa nhập.");
                setStage("input");
                return;
            }
            applyParsed(data.deadlines, data.source);
        } catch (e: any) {
            setError(e.message);
            setStage("input");
        }
    };

    const parseFile = async (file: File) => {
        setError(null);
        setFileName(file.name);
        try {
            setBusyLabel("Đang đọc nội dung file…");
            setStage("parsing");
            const extracted = await extractFileContent(file);
            await parseText(
                extracted.kind === "image"
                    ? { image: extracted.base64, mimeType: extracted.mimeType }
                    : { text: extracted.text },
                extracted.kind === "image"
                    ? "Đang phân tích ảnh bằng Gemini (có thể mất 1–2 phút)…"
                    : "Đang phân tích nội dung…"
            );
        } catch (e: any) {
            setError(e?.message ?? "Không đọc được file");
            setStage("input");
        }
    };

    const parsePastedImage = async (file: File) => {
        setError(null);
        setFileName("Ảnh đã dán (Ctrl+V)");
        try {
            setBusyLabel("Đang xử lý ảnh đã dán…");
            setStage("parsing");
            const ready = await prepareImage(file);
            const base64 = await fileToBase64(ready);
            if (base64.length * 0.75 > MAX_IMAGE_PAYLOAD_BYTES) {
                setError("Ảnh quá lớn, hãy cắt bớt vùng thừa rồi thử lại");
                setStage("input");
                return;
            }
            await parseText(
                { image: base64, mimeType: ready.type },
                "Đang phân tích ảnh bằng Gemini (có thể mất 1–2 phút)…"
            );
        } catch (e: any) {
            setError(e?.message ?? "Không đọc được ảnh");
            setStage("input");
        }
    };

    useEffect(() => {
        if (!open || stage !== "input") return;
        const onPaste = (e: ClipboardEvent) => {
            const items = e.clipboardData?.items;
            if (!items) return;
            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                if (item.kind === "file" && item.type.startsWith("image/")) {
                    const file = item.getAsFile();
                    if (file) {
                        e.preventDefault();
                        void parsePastedImage(file);
                    }
                    return;
                }
            }
        };
        window.addEventListener("paste", onPaste);
        return () => window.removeEventListener("paste", onPaste);
    }, [open, stage]);

    const commit = async () => {
        const toCreate = rows.filter((r) => !r.skip);
        if (toCreate.length === 0) return;
        setError(null);
        setStage("creating");
        let created = 0;
        let invites = 0;
        const inviteFiles: { title: string; ics: string }[] = [];
        try {
            for (let i = 0; i < toCreate.length; i++) {
                const row = toCreate[i];
                setBusyLabel(`Đang tạo công việc ${i + 1}/${toCreate.length}…`);
                const result = await api<{ task: Task; ics: string | null }>(
                    `/api/groups/${group.id}/tasks`,
                    {
                        method: "POST",
                        body: {
                            studentId: identity,
                            title: row.deadline.taskName,
                            description: buildDescription(row.deadline),
                            assigneeEmail: row.assigneeEmail || undefined,
                            deadline: `${row.deadline.dueDate}T${row.deadline.dueTime ?? "23:59"}`,
                        },
                    }
                );
                created++;
                if (result.ics) {
                    invites++;
                    inviteFiles.push({ title: row.deadline.taskName, ics: result.ics });
                }
            }
            const summary =
                `Đã tạo ${created} công việc${invites > 0 ? ` (${invites} lời mời .ics)` : ""}.`;
            setInvites(inviteFiles);
            onImported(summary);
            close();
        } catch (e: any) {
            setError(
                `Tạo thất bại (đã tạo ${created} công việc): ${e.message}`
            );
            if (created > 0) {
                setInvites(inviteFiles);
                onImported(`Đã tạo ${created} công việc trước khi dừng.`);
            }
            setStage("review");
        }
    };

    const downloadInvite = (ics: string, title: string) => {
        const blob = new Blob([ics], { type: "text/calendar;charset=utf-8;" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `invite-${normalizeFileName(title)}.ics`;
        a.click();
    };

    return (
        <Dialog open={open} onOpenChange={(v) => (v ? setOpen(true) : close())}>
            <DialogTrigger asChild>
                <Button size="sm" variant="outline">
                    <Upload className="h-4 w-4 mr-2" /> Nhập deadline
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Nhập deadline từ LMS cho {group.name}</DialogTitle>
                    <DialogDescription>
                        Dán nội dung bài tập từ LMS (hoặc tải file/ảnh, hoặc sao
                        chép ảnh Ctrl+C và dán vào đây Ctrl+V) để tạo công việc
                        cho cả nhóm — người được giao việc trong nội dung sẽ
                        được gán tự động.
                    </DialogDescription>
                </DialogHeader>

                {stage === "input" && (
                    <Tabs defaultValue="paste">
                        <TabsList>
                            <TabsTrigger value="paste">
                                <ClipboardPaste className="size-4" /> Dán văn bản
                            </TabsTrigger>
                            <TabsTrigger value="upload">
                                <FileUp className="size-4" /> Tải file / ảnh
                            </TabsTrigger>
                        </TabsList>
                        <TabsContent value="paste" className="flex flex-col gap-2">
                            <Label htmlFor="import-paste">Nội dung LMS</Label>
                            <textarea
                                id="import-paste"
                                className="h-40 w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:border-ring focus:ring-3 focus:ring-ring/50"
                                value={text}
                                onChange={(e) => setText(e.target.value)}
                                placeholder={
                                    "CO3001 - Phân tích thiết kế hướng đối tượng\n- Bài tập 1 - hạn nộp 15/04/2026 (10%) - giao cho Nam\n- Bài tập 2 - nộp ngày 30/05/2026 (0.2)"
                                }
                            />
                            <Button
                                onClick={() => void parseText({ text }, "Đang phân tích nội dung…")}
                                disabled={!text.trim()}
                                className="self-end"
                            >
                                Phân tích
                            </Button>
                        </TabsContent>
                        <TabsContent value="upload" className="flex flex-col gap-2">
                            <Label htmlFor="import-file">File bài tập LMS</Label>
                            <Input
                                id="import-file"
                                type="file"
                                accept=".html,.htm,.txt,.docx,.pptx,.pdf,.jpg,.jpeg,.png"
                                onChange={(e) => {
                                    const file = e.target.files?.[0] ?? null;
                                    if (file) void parseFile(file);
                                }}
                            />
                            {fileName && (
                                <p className="text-sm text-muted-foreground">
                                    Đã chọn: {fileName}
                                </p>
                            )}
                            <p className="text-xs text-muted-foreground">
                                Hỗ trợ .html, .txt, .docx, .pptx, .pdf (tối đa 10MB) và
                                ảnh .jpg/.png (cần GEMINI_API_KEY). Có thể sao chép
                                ảnh (Ctrl+C) và dán vào đây (Ctrl+V).
                            </p>
                        </TabsContent>
                    </Tabs>
                )}

                {stage === "parsing" && (
                    <p className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="size-4 animate-spin" />
                        {busyLabel}
                    </p>
                )}

                {stage === "review" && (
                    <div className="flex flex-col gap-3">
                        {skippedExpired > 0 && (
                            <p className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs text-amber-600">
                                <TriangleAlert className="size-4 mt-0.5 shrink-0" />
                                Đã bỏ qua {skippedExpired} mục đã hết hạn (hạn trước
                                hôm nay).
                            </p>
                        )}
                        <div className="flex max-h-[50vh] flex-col gap-2 overflow-y-auto pr-1">
                            {rows.map((row, idx) => (
                                <div
                                    key={idx}
                                    className={`flex items-start gap-3 rounded-lg border p-3 ${
                                        row.skip ? "opacity-50" : ""
                                    }`}
                                >
                                    <Checkbox
                                        checked={row.skip}
                                        onCheckedChange={(checked) =>
                                            setRows((prev) =>
                                                prev.map((r, i) =>
                                                    i === idx
                                                        ? { ...r, skip: Boolean(checked) }
                                                        : r
                                                )
                                            )
                                        }
                                        aria-label="Bỏ qua"
                                    />
                                    <div className="min-w-0 flex-1">
                                        <div className="flex flex-wrap items-center gap-1.5">
                                            <p className="text-sm font-medium">
                                                {row.deadline.taskName}
                                            </p>
                                            {row.deadline.priority && (
                                                <Badge
                                                    variant={priorityVariant(
                                                        row.deadline.priority
                                                    )}
                                                >
                                                    {row.deadline.priority}
                                                </Badge>
                                            )}
                                            {row.duplicate && (
                                                <Badge variant="outline">đã tồn tại</Badge>
                                            )}
                                        </div>
                                        <p className="text-xs text-muted-foreground">
                                            {row.deadline.courseName} · Hạn:{" "}
                                            {formatDue(row.deadline)}
                                            {row.deadline.assignee &&
                                                ` · Giao: ${row.deadline.assignee}`}
                                        </p>
                                    </div>
                                    <Select
                                        value={row.assigneeEmail}
                                        onValueChange={(email) =>
                                            setRows((prev) =>
                                                prev.map((r, i) =>
                                                    i === idx ? { ...r, assigneeEmail: email } : r
                                                )
                                            )
                                        }
                                    >
                                        <SelectTrigger className="w-44 justify-start text-xs">
                                            <SelectValue placeholder="Chưa phân công" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="">
                                                Chưa phân công (không giao)
                                            </SelectItem>
                                            {memberOptions.map((m) => (
                                                <SelectItem key={m.email} value={m.email}>
                                                    {m.fullName}
                                                    <span className="ml-1 text-xs text-muted-foreground">
                                                        {m.email}
                                                    </span>
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            ))}
                        </div>
                        <p className="text-xs text-muted-foreground">
                            Nguồn phân tích: {source === "gemini" ? "Gemini" : "regex (không dùng AI)"}.
                            Đánh dấu {rows.length - pending.length}/{rows.length} mục bỏ qua.
                        </p>
                    </div>
                )}

                {error && <p className="text-sm text-destructive">{error}</p>}

                <DialogFooter>
                    {stage === "review" && (
                        <Button
                            variant="ghost"
                            onClick={() => setStage("input")}
                            disabled={creating}
                        >
                            Phân tích lại
                        </Button>
                    )}
                    <Button
                        variant="outline"
                        onClick={close}
                        disabled={creating}
                    >
                        {stage === "review" ? "Huỷ" : "Đóng"}
                    </Button>
                    {stage === "review" && (
                        <Button onClick={() => void commit()} disabled={pending.length === 0 || creating}>
                            {creating ? (
                                <>
                                    <Loader2 className="size-4 animate-spin" />
                                    {busyLabel}
                                </>
                            ) : (
                                `Tạo ${pending.length} công việc`
                            )}
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>

            {invites && invites.length > 0 && (
                <div className="fixed bottom-4 right-4 z-50 flex max-w-sm flex-col gap-2 rounded-lg border bg-card p-3 shadow-lg">
                    <p className="text-sm font-medium">
                        {invites.length} lời mời lịch (.ics) đã sẵn sàng
                    </p>
                    <div className="flex max-h-56 flex-col gap-1.5 overflow-y-auto pr-1">
                        {invites.map((invite, idx) => (
                            <Button
                                key={idx}
                                size="sm"
                                variant="outline"
                                className="justify-start text-xs"
                                onClick={() => downloadInvite(invite.ics, invite.title)}
                            >
                                <FileUp className="h-3.5 w-3.5 shrink-0" />
                                <span className="truncate">{invite.title}</span>
                            </Button>
                        ))}
                    </div>
                    <Button
                        size="sm"
                        variant="ghost"
                        className="self-end"
                        onClick={() => setInvites(null)}
                    >
                        Đóng
                    </Button>
                </div>
            )}
        </Dialog>
    );
}

function buildDescription(deadline: ParsedDeadline): string {
    const parts = [deadline.courseName];
    if (deadline.priority) parts.push(`Ưu tiên: ${deadline.priority}`);
    if (deadline.context) parts.push(deadline.context);
    return parts.join(" · ").slice(0, 500);
}

function normalizeFileName(title: string): string {
    return title
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 60) || "task";
}