"use client";
import { useSyncExternalStore } from "react";

const MEDIA_QUERY = "(max-width: 767px)";

function subscribe(callback: () => void) {
    const mql = window.matchMedia(MEDIA_QUERY);
    mql.addEventListener("change", callback);
    window.addEventListener("resize", callback);
    window.addEventListener("orientationchange", callback);
    return () => {
        mql.removeEventListener("change", callback);
        window.removeEventListener("resize", callback);
        window.removeEventListener("orientationchange", callback);
    };
}

function getSnapshot(): "row" | "col" {
    return window.matchMedia(MEDIA_QUERY).matches ? "col" : "row";
}

function getServerSnapshot(): "row" | "col" {
    return "row";
}

/**
 * "row" = desktop/laptop layout (sidebar on the left), "col" = mobile layout
 * (sidebar on top). Classified by viewport width (< 768px = mobile), so phones
 * in landscape are treated as mobile too. Hydration-safe: no desktop-first
 * paint flash on phones (useSyncExternalStore re-renders before paint when the
 * client snapshot differs from the server one).
 */
export function useOrientationMode() {
    return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function useIsMobile() {
    return useOrientationMode() === "col";
}
