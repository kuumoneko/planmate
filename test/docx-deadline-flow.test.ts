/**
 * End-to-end pipeline for uploaded .docx files:
 *   file -> extract text (zip + word/document.xml) -> Gemini structured output
 *
 * Point DOCX_PATH at a real .docx file (defaults to test/fixtures/example.docx).
 * The file is gitignored — signed documents may contain personal data. Tests
 * skip with a clear message when the file is missing; Gemini tests additionally
 * skip when no API key is configured.
 */

import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { hasGeminiConfigured } from "@/lib/chat/gemini";
import { extractFileContent } from "@/lib/file-to-text";
import { parseLmsMarkdown } from "@/lib/lms-parse";

const DOCX_PATH = resolve("E:\\Documents\\HK253\\BTL\\CHỦ ĐỀ VÀ ĐỀ CƯƠNG CHI TIẾT BTL-20260618\\HK 253- KẾ HOẠCH HƯỚNG DẪN BTL - TRIẾT HỌC ML - TS.ĐÔ THỊ CƯỜNG.docx");
const hasFixture = existsSync(DOCX_PATH);

if (!hasFixture) {
    console.log(
        `[skip] Fixture thiếu: ${DOCX_PATH}\nĐặt file .docx vào DOCX_PATH trong test/docx-deadline-flow.test.ts để chạy bài test này.`
    );
}

function docxFile(): File {
    const name = DOCX_PATH.split(/[\\/]/).pop() ?? "example.docx";
    return new File([readFileSync(DOCX_PATH)], name, {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
}

describe("DOCX -> text -> Gemini deadline pipeline", () => {
    const withFixture = test.skipIf(!hasFixture);

    withFixture("extracts text from the .docx (zip + document.xml)", async () => {
        const extracted = await extractFileContent(docxFile());
        expect(extracted.kind).toBe("text");
        const text = (extracted as { text: string }).text;
        expect(text.length).toBeGreaterThan(100);
        console.log("--- extracted preview (first 800 chars) ---");
        console.log(text.slice(0, 800));
    }, { timeout: 60_000 });

    const withGemini = test.skipIf(!hasFixture || !hasGeminiConfigured());

    withGemini(
        "extracts deadlines via Gemini (new Task/Deadline prompt)",
        async () => {
            const extracted = await extractFileContent(docxFile());
            const result = await parseLmsMarkdown((extracted as { text: string }).text);
            expect(result.source).toBe("gemini");
            console.log(
                `--- deadlines (source=${result.source}, count=${result.deadlines.length}) ---`
            );
            for (const d of result.deadlines) {
                console.log(
                    `- ${d.dueDate} ${d.dueTime ?? "??:??"} | ${d.courseName} | ${d.taskName} | priority=${d.priority ?? "-"} | assignee=${d.assignee ?? "-"}`
                );
            }
            for (const d of result.deadlines) {
                expect(d.taskName.trim().length).toBeGreaterThan(0);
                expect(d.dueDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
                expect(d.courseName.trim().length).toBeGreaterThan(0);
            }
        },
        { timeout: 120_000 }
    );
});
