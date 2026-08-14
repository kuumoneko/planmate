"use client";

import { useCallback, useEffect, useState } from "react";

export type Theme = "dark" | "light";

const STORAGE_KEY = "theme";

function systemPrefersLight(): boolean {
    return (
        typeof window !== "undefined" &&
        window.matchMedia("(prefers-color-scheme: light)").matches
    );
}

/**
 * Class-based theme (html.dark) with the user's manual choice persisted in
 * localStorage. Without a stored choice the system preference applies.
 * The pre-paint inline script in pages/_document.tsx applies the same
 * resolution so there is no flash of the wrong theme.
 */
export function useTheme() {
    const [theme, setThemeState] = useState<Theme | null>(null);

    useEffect(() => {
        setThemeState(resolveTheme());
    }, []);

    const setTheme = useCallback((next: Theme) => {
        localStorage.setItem(STORAGE_KEY, next);
        document.documentElement.classList.toggle("dark", next === "dark");
        setThemeState(next);
    }, []);

    const toggle = useCallback(() => {
        setTheme(theme === "dark" ? "light" : "dark");
    }, [theme, setTheme]);

    return { theme, toggle };
}

function resolveTheme(): Theme {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "dark" || stored === "light") return stored;
    return systemPrefersLight() ? "light" : "dark";
}
