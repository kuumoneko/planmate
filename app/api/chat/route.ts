import { NextRequest, NextResponse } from "next/server";
import { runChat, hasGeminiConfigured, type ChatTurn } from "@/lib/chat/gemini";
import { buildBaseSystemInstruction } from "@/lib/chat/context";
import { classifyIntent, type ChatIntent } from "@/lib/intent-classifier";

export const runtime = "nodejs";
export const maxDuration = 60;

export type ChatMode = "threads" | "group" | "raw";

interface ChatRequestBody {
    message?: unknown;
    username?: unknown;
    mode?: unknown;
    groupId?: unknown;
    history?: unknown;
}

/**
 * POST /api/chat
 * Body: { message, username, mode: "threads"|"group"|"raw", groupId?, history? }
 *
 * Mode dispatch:
 *  - "threads": full Gemini conversation (multi-turn via `history`), no caching.
 *  - "group":   group-scoped assistant; requires `groupId`; the route loads the
 *               group + tasks and grounds the answer in them. Returns the
 *               classified intent and, for free-time requests, computed slots.
 *  - "raw":     stateless pass-through to the model with the base prompt.
 *
 * Requires GOOGLE_GEMINI_API_KEY (or NEXT_PUBLIC_GOOGLE_GEMINI_API_KEY);
 * returns 501 otherwise so clients can fall back to the demo assistant.
 */
export async function POST(req: NextRequest) {
    let body: ChatRequestBody;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ ok: false, data: "Invalid JSON body" }, { status: 400 });
    }

    const message = String(body.message ?? "").trim();
    if (!message) {
        return NextResponse.json({ ok: false, data: "message is required" }, { status: 400 });
    }

    const mode: ChatMode =
        body.mode === "threads" || body.mode === "group" ? body.mode : "raw";

    const intent = classifyIntent(message);

    if (!hasGeminiConfigured()) {
        return NextResponse.json(
            {
                ok: false,
                data: "Gemini chưa được cấu hình (thiếu GOOGLE_GEMINI_API_KEY).",
                mode,
                intent: intent.intent,
            },
            { status: 501 }
        );
    }

    const history = Array.isArray(body.history)
        ? (body.history as { role: string; text: string }[])
              .filter((t) => t && (t.role === "user" || t.role === "model") && typeof t.text === "string")
              .map((t) => ({ role: t.role as "user" | "model", text: t.text }))
        : [];

    try {
        if (mode === "group") {
            const { handleGroupChat } = await import("./group-chat");
            return await handleGroupChat({
                username: String(body.username ?? ""),
                groupId: String(body.groupId ?? ""),
                message,
                history,
                intent,
            });
        }

        const result = await runChat({
            systemInstruction: buildBaseSystemInstruction(),
            history,
            userMessage: message,
        });

        return NextResponse.json({
            ok: true,
            reply: result.text,
            mode,
            intent: intent.intent,
        });
    } catch (error) {
        console.error(`[api/chat] mode=${mode} failed:`, error);
        const messageText = error instanceof Error ? error.message : "Unknown error";
        return NextResponse.json({ ok: false, data: messageText, mode, intent: intent.intent }, { status: 500 });
    }
}

/** Intent payload shape shared by both chat routes. */
export type { ChatIntent };