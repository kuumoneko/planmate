"use client";
import { useState, type ReactNode } from "react";
import { Users } from "lucide-react";
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
import { api } from "@/utils/api";
import { Group } from "@/types";

export default function GroupCreateDialog({
    username,
    onCreated,
    trigger,
}: {
    username: string;
    onCreated: (group: Group) => void;
    trigger?: ReactNode;
}) {
    const [open, setOpen] = useState(false);
    const [name, setName] = useState("");
    const [courseCode, setCourseCode] = useState("");
    const [courseName, setCourseName] = useState("");
    const [error, setError] = useState("");
    const [submitting, setSubmitting] = useState(false);

    const submit = async () => {
        if (!name.trim()) {
            setError("Tên nhóm là bắt buộc");
            return;
        }
        setError("");
        setSubmitting(true);
        try {
            const group = await api<Group>("/api/groups", {
                method: "POST",
                body: { username, name, courseCode, courseName },
            });
            setOpen(false);
            setName("");
            setCourseCode("");
            setCourseName("");
            onCreated(group);
        } catch (e: any) {
            setError(e.message);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                {trigger ?? (
                    <Button>
                        <Users className="h-4 w-4 mr-2" /> Tạo nhóm
                    </Button>
                )}
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle>Tạo nhóm học tập</DialogTitle>
                    <DialogDescription>
                        Tạo nhóm cho một môn học (BTL) và mời thành viên đã đăng ký trên web.
                    </DialogDescription>
                </DialogHeader>
                <div className="flex flex-col gap-3">
                    <div className="flex flex-col gap-1.5">
                        <Label htmlFor="group-name">Tên nhóm *</Label>
                        <Input
                            id="group-name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="VD: Nhóm BTL Cấu trúc dữ liệu"
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div className="flex flex-col gap-1.5">
                            <Label htmlFor="course-code">Mã môn học</Label>
                            <Input
                                id="course-code"
                                value={courseCode}
                                onChange={(e) => setCourseCode(e.target.value)}
                                placeholder="VD: CO2003"
                            />
                        </div>
                        <div className="flex flex-col gap-1.5">
                            <Label htmlFor="course-name">Tên môn học</Label>
                            <Input
                                id="course-name"
                                value={courseName}
                                onChange={(e) => setCourseName(e.target.value)}
                                placeholder="VD: Cấu trúc dữ liệu"
                            />
                        </div>
                    </div>
                    {error && <p className="text-sm text-destructive">{error}</p>}
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => setOpen(false)}>
                        Hủy
                    </Button>
                    <Button onClick={submit} disabled={submitting}>
                        {submitting ? "Đang tạo..." : "Tạo nhóm"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
