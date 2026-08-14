import "@/styles/globals.css";
import type { Metadata } from "next";

/**
 * Root layout for the App Router tree (login, dashboard, ...).
 * The legacy Pages Router tree keeps its own template (pages/template.tsx).
 * Class "app-root" on <body> scopes the legacy full-page centering rules
 * out of the App Router pages (see src/styles/globals.css).
 */
export const metadata: Metadata = {
    title: "BK Calendar",
    description: "Lịch học, lịch thi và quản lý nhóm BTL cho sinh viên HCMUT",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="vi">
            <body className="app-root antialiased">{children}</body>
        </html>
    );
}