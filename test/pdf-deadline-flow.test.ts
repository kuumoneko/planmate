/**
 * End-to-end pipeline for uploaded LMS files:
 *   file -> extract text (pdfjs for .pdf) -> Gemini structured output
 *
 * The PDF fixture lives in test/fixtures/ (gitignored — signed documents may
 * contain personal data). The tests skip with a clear message when it is
 * missing. Gemini tests skip when no API key is configured.
 */

import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { hasGeminiConfigured } from "@/lib/chat/gemini";
import { extractFileContent } from "@/lib/file-to-text";
import { parseLmsMarkdown } from "@/lib/lms-parse";

const FIXTURE_NAME = "577.Thong bao tiep nhan tan sinh vien nam hoc 2026-2027.signed.pdf";
const fixturePath = resolve("E:\\Download\\577.Thong bao tiep nhan tan sinh vien nam hoc 2026-2027.signed.pdf");

function fixtureFile(): File {
    if (!existsSync(fixturePath)) {
        throw new Error(
            `Fixture thiếu: ${fixturePath}\nĐặt file PDF vào test/fixtures/ để chạy bài test này.`
        );
    }
    return new File([readFileSync(fixturePath)], FIXTURE_NAME, {
        type: "application/pdf",
    });
}

describe("PDF -> text -> Gemini deadline pipeline", () => {
    test("extracts text from the PDF (pdfjs, no browser)", async () => {
        const extracted = await extractFileContent(fixtureFile());
        expect(extracted.kind).toBe("text");
        const text = (extracted as { text: string }).text;
        expect(text.length).toBeGreaterThan(100);
        console.log("--- extracted preview (first 800 chars) ---");
        console.log(text.slice(0, 800));
    }, { timeout: 60_000 });

    const withGemini = test.skipIf(!hasGeminiConfigured());

    withGemini("extracts deadlines via Gemini (new Task/Deadline prompt)", async () => {
        const extracted = await extractFileContent(fixtureFile());
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
    }, { timeout: 120_000 });
});
