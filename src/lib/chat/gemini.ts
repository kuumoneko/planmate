/**
 * Gemini API access for the chat endpoints (@google/genai, API-key auth).
 *
 * Key resolution order: GOOGLE_GEMINI_API_KEY (server-only), then
 * NEXT_PUBLIC_GOOGLE_GEMINI_API_KEY (client-safe), then the conventional
 * GEMINI_API_KEY. The model can be overridden via GEMINI_MODEL (default
 * "gemini-3.7-flash").
 *
 * No caching: every call goes straight to the model, per the threads-mode
 * requirement. Route handlers decide how much history to pass.
 */

import { GoogleGenAI } from "@google/genai";

export const DEFAULT_MODEL = "gemini-3.7-flash";

export function getGeminiKey(): string | undefined {
    return (
        process.env.GOOGLE_GEMINI_API_KEY ??
        process.env.NEXT_PUBLIC_GOOGLE_GEMINI_API_KEY ??
        process.env.GEMINI_API_KEY
    );
}

export function hasGeminiConfigured(): boolean {
    return Boolean(getGeminiKey());
}

export function createGeminiClient(): GoogleGenAI {
    const apiKey = getGeminiKey();
    if (!apiKey) {
        throw new Error(
            "GOOGLE_GEMINI_API_KEY is not configured; set it in the environment"
        );
    }
    return new GoogleGenAI({ apiKey });
}

export function getGeminiModel(): string {
    return process.env.GEMINI_MODEL ?? DEFAULT_MODEL;
}

export interface ChatTurn {
    role: "user" | "model";
    /** Plain-text content of the turn. */
    text: string;
}

export interface RunChatParams {
    systemInstruction?: string;
    /** Optional multi-turn history (oldest first). */
    history?: ChatTurn[];
    userMessage: string;
    temperature?: number;
    maxOutputTokens?: number;
}

export interface RunChatResult {
    text: string;
    finishReason: string | undefined;
}

/** Max turns kept when the client sends a long history. */
export const MAX_HISTORY_TURNS = 20;

/**
 * Send one message to Gemini and return the model's text reply.
 * A fresh chat session is created per call (stateless across requests).
 */
export async function runChat(params: RunChatParams): Promise<RunChatResult> {
    const client = createGeminiClient();
    const history = (params.history ?? []).slice(-MAX_HISTORY_TURNS);

    const chat = client.chats.create({
        model: getGeminiModel(),
        config: {
            temperature: params.temperature ?? 0.4,
            maxOutputTokens: params.maxOutputTokens ?? 1024,
            systemInstruction: params.systemInstruction
                ? { parts: [{ text: params.systemInstruction }] }
                : undefined,
        },
        history: history.map((turn) => ({
            role: turn.role,
            parts: [{ text: turn.text }],
        })),
    });

    const response = await chat.sendMessage({ message: params.userMessage });
    return {
        text: response.text ?? "",
        finishReason: response.candidates?.[0]?.finishReason,
    };
}