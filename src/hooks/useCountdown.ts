"use client";
import { useEffect, useState } from "react";

export interface Countdown {
    totalMs: number;
    days: number;
    hours: number;
    minutes: number;
    seconds: number;
    expired: boolean;
}

/** Live countdown to a target date (ticks every second). */
export function useCountdown(target: Date | string | null): Countdown | null {
    const [countdown, setCountdown] = useState<Countdown | null>(null);

    useEffect(() => {
        if (!target) {
            setCountdown(null);
            return;
        }
        const end = new Date(target).getTime();

        const tick = () => {
            const totalMs = end - Date.now();
            setCountdown({
                totalMs,
                days: Math.max(0, Math.floor(totalMs / 86400000)),
                hours: Math.max(0, Math.floor((totalMs / 3600000) % 24)),
                minutes: Math.max(0, Math.floor((totalMs / 60000) % 60)),
                seconds: Math.max(0, Math.floor((totalMs / 1000) % 60)),
                expired: totalMs <= 0,
            });
        };

        tick();
        const timer = setInterval(tick, 1000);
        return () => clearInterval(timer);
    }, [target]);

    return countdown;
}
