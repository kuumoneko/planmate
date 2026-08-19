import "@/styles/globals.css";
import type { Metadata, Viewport } from "next";

/**
 * Root layout for the App Router tree (login, dashboard, ...).
 * The legacy Pages Router tree keeps its own template (pages/template.tsx).
 * Class "app-root" on <body> scopes the legacy full-page centering rules
 * out of the App Router pages (see src/styles/globals.css).
 */
export const metadata: Metadata = {
    title: "NoZal",
    description: "Lịch học, lịch thi và quản lý tiến độ BTL dành cho sinh viên",
    icons: [{ rel: "icon", url: "/nozal.png" }],
};

export const viewport: Viewport = {
    width: "device-width",
    initialScale: 1,
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="vi">
            <body className="app-root antialiased">{children}</body>
        </html>
    );
}
