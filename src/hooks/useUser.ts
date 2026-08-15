"use client";
import { useEffect, useState } from "react";
import { Student } from "@/types";

/**
 * Reads the authenticated student profile from localStorage
 * (written by src/utils/data/login.ts during login).
 *
 * `loading` is true until the localStorage read has completed, so callers can
 * wait instead of falling back to placeholder student ids.
 */
export function useUser(): { user: Student | null; loading: boolean } {
    const [user, setUser] = useState<Student | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const raw = localStorage.getItem("user");
        if (!raw) {
            setUser(null);
            setLoading(false);
            return;
        }
        try {
            const parsed = JSON.parse(raw);
            setUser({
                username: parsed.username ?? "",
                mssv: parsed.MSSV ?? parsed.id,
                fullName: parsed.name ?? parsed.HO ?? "",
                email: parsed.email,
                major: parsed.major,
                faculty: parsed.teachingDep,
                semester: parsed.semester,
            });
        } catch {
            setUser(null);
        } finally {
            setLoading(false);
        }
        const onLogout = () => {
            setUser(null);
            setLoading(false);
        };
        window.addEventListener("logout", onLogout);
        return () => window.removeEventListener("logout", onLogout);
    }, []);

    return { user, loading };
}
