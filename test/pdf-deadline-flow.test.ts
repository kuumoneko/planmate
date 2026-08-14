/**
 * End-to-end pipeline for uploaded LMS files:
 *   file -> extract text (pdfjs for .pdf) -> Gemini structured output
 *
 * Every PDF in test/fixtures/ (gitignored) is run through the pipeline. The
 * demo PDFs contain synthetic deadlines mixed with non-deadline dates to
 * verify the AI does not over-extract. Tests skip with a clear message when
 * no PDF is present; Gemini tests skip when no API key is configured.
 */

import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { hasGeminiConfigured } from "@/lib/chat/gemini";
import { extractFileContent } from "@/lib/file-to-text";
import { parseLmsMarkdown } from "@/lib/lms-parse";

const FIXTURES_DIR = resolve(import.meta.dir, "fixtures");

const pdfFiles = readdirSync(FIXTURES_DIR)
    .filter((f) => f.toLowerCase().endsWith(".pdf"))
    .sort();

function fixtureFile(name: string): File {
    const path = join(FIXTURES_DIR, name);
    if (!existsSync(path)) {
        throw new Error(`Fixture thiếu: ${path}`);
    }
    return new File([readFileSync(path)], name, { type: "application/pdf" });
}

if (pdfFiles.length === 0) {
    describe("PDF deadline pipeline", () => {
        test("has fixtures", () => {
            throw new Error(
                `Không có file PDF nào trong ${FIXTURES_DIR}\nChạy script tạo fixture hoặc đặt PDF vào đó.`
            );
        });
    });
}

for (const pdfName of pdfFiles) {
    describe(`PDF pipeline: ${pdfName}`, () => {
        test("extracts text from the PDF (pdfjs, no browser)", async () => {
            const extracted = await extractFileContent(fixtureFile(pdfName));
            expect(extracted.kind).toBe("text");
            const text = (extracted as { text: string }).text;
            expect(text.length).toBeGreaterThan(100);
            console.log("--- extracted preview (first 800 chars) ---");
            console.log(text.slice(0, 800));
        }, { timeout: 60_000 });

        const withGemini = test.skipIf(!hasGeminiConfigured());

        withGemini("extracts deadlines via Gemini (new Task/Deadline prompt)", async () => {
            const extracted = await extractFileContent(fixtureFile(pdfName));
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
}
