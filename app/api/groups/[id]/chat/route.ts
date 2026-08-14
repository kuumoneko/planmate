import { NextRequest, NextResponse } from "next/server";
import { runChat, hasGeminiConfigured, type ChatTurn } from "@/lib/chat/gemini";
import { classifyIntent } from "@/lib/intent-classifier";
import { handleGroupChat } from "../../../chat/group-chat";

export const runtime = "nodejs";
export const maxDuration = 60;

interface ChatRequestBody {
    message?: unknown;
    username?: unknown;
    history?: unknown;
}

/**
 * POST /api/groups/[id]/chat
 * Body: { message, username, history? }
 *
 * Group-scoped assistant: validates membership, grounds the model in the
 * group's members + tasks, and returns the classified intent with optional
 * computed free-time slots (intent = "group-free-time").
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;

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

    const intent = classifyIntent(message);

    if (!hasGeminiConfigured()) {
        return NextResponse.json(
            {
                ok: false,
                data: "Gemini chưa được cấu hình (thiếu GOOGLE_GEMINI_API_KEY).",
                mode: "group",
                intent: intent.intent,
            },
            { status: 501 }
        );
    }

    const history: ChatTurn[] = Array.isArray(body.history)
        ? (body.history as { role: string; text: string }[])
              .filter((t) => t && (t.role === "user" || t.role === "model") && typeof t.text === "string")
              .map((t) => ({ role: t.role as "user" | "model", text: t.text }))
        : [];

    try {
        return await handleGroupChat({
            username: String(body.username ?? ""),
            groupId: id,
            message,
            history,
            intent,
        });
    } catch (error) {
        console.error(`[api/groups/${id}/chat] failed:`, error);
        const messageText = error instanceof Error ? error.message : "Unknown error";
        return NextResponse.json({ ok: false, data: messageText, mode: "group", intent: intent.intent }, { status: 500 });
    }
}