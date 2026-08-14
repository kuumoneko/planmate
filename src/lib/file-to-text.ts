/**
 * Client-side extraction of LMS deadline lists from uploaded files.
 * docx/pptx are ZIP+XML; pdf uses pdfjs-dist (lazy-loaded); txt/html are
 * plain text; jpg/png have no text layer and are handed to the server as
 * base64 for Gemini vision OCR.
 */

import { unzipSync } from "fflate";

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export type ExtractedFileContent =
    | { kind: "text"; text: string }
    | { kind: "image"; base64: string; mimeType: string };

/** Strip HTML tags and decode common entities so saved LMS pages parse cleanly. */
export function stripHtmlTags(html: string): string {
    const text = html
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/p>/gi, "\n")
        .replace(/<\/div>/gi, "\n")
        .replace(/<\/li>/gi, "\n")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">")
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'");
    return text.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

/** Decode HTML entities (named + numeric) in a plain-text chunk. */
function decodeEntities(text: string): string {
    return text
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">")
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
        .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(Number(dec)));
}

/**
 * Convert saved-LMS HTML into Markdown so the parser (regex or Gemini)
 * receives structured content: headings, nested lists, bold/italic, links.
 */
export function htmlToMarkdown(html: string): string {
    const src = html
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<style[\s\S]*?<\/style>/gi, "");

    const parts: string[] = [];
    const listStack: Array<"ul" | "ol"> = [];
    let linkHref = "";
    let cursor = 0;

    while (cursor < src.length) {
        const tagStart = src.indexOf("<", cursor);
        if (tagStart === -1) {
            parts.push(decodeEntities(src.slice(cursor)));
            break;
        }
        parts.push(decodeEntities(src.slice(cursor, tagStart)));
        const tagEnd = src.indexOf(">", tagStart);
        if (tagEnd === -1) {
            parts.push(decodeEntities(src.slice(tagStart)));
            break;
        }
        const raw = src.slice(tagStart + 1, tagEnd);
        cursor = tagEnd + 1;
        const closing = raw.startsWith("/");
        const name = (closing ? raw.slice(1) : raw).replace(/[\s/].*$/, "").toLowerCase();

        switch (name) {
            case "h1":
            case "h2":
            case "h3":
            case "h4":
            case "h5":
            case "h6":
                parts.push(closing ? "\n" : `\n${"#".repeat(Number(name[1]))} `);
                break;
            case "ul":
            case "ol":
                if (!closing) listStack.push(name as "ul" | "ol");
                else {
                    listStack.pop();
                    parts.push("\n");
                }
                break;
            case "li": {
                if (!closing) {
                    const indent = " ".repeat(Math.max(0, listStack.length - 1) * 2);
                    const type = listStack[listStack.length - 1] ?? "ul";
                    parts.push(`\n${indent}${type === "ol" ? "1. " : "- "}`);
                }
                break;
            }
            case "b":
            case "strong":
                parts.push("**");
                break;
            case "i":
            case "em":
                parts.push("*");
                break;
            case "br":
                parts.push("\n");
                break;
            case "p":
            case "div":
                if (closing) parts.push("\n");
                break;
            case "a": {
                if (!closing) {
                    linkHref =
                        raw.match(/href\s*=\s*["']?([^"'\s>]+)/i)?.[1] ?? "";
                    parts.push("[");
                } else {
                    parts.push(`](${linkHref})`);
                    linkHref = "";
                }
                break;
            }
            case "tr":
                if (closing) parts.push("\n");
                break;
            case "td":
            case "th":
                parts.push(closing ? " |" : "| ");
                break;
            default:
                break;
        }
    }

    return parts
        .join("")
        .replace(/(?<!\n)[ \t]+/g, " ")
        .replace(/\[\s+/g, "[")
        .replace(/\s+\]/g, "]")
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n{2,}(?=\s*(?:- |1\. |#|\* ))/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}

function extensionOf(name: string): string {
    const dot = name.lastIndexOf(".");
    return dot === -1 ? "" : name.slice(dot + 1).toLowerCase();
}

function decodeEntry(entry: Uint8Array): string {
    return new TextDecoder().decode(entry);
}

/** Pull the text content of the given XML tag (paragraphs kept separate). */
function xmlText(xml: string, tag: string, blockEnd: string): string {
    const blocks = xml.replaceAll(`</${blockEnd}>`, "\n");
    const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "g");
    let text = "";
    let match: RegExpExecArray | null;
    let lastEnd = 0;
    while ((match = re.exec(blocks)) !== null) {
        // A paragraph boundary (</w:p>) between the previous chunk and this
        // one means the run belongs to a new paragraph -> line break.
        if (/\n/.test(blocks.slice(lastEnd, match.index))) text += "\n";
        text += match[1];
        lastEnd = re.lastIndex;
    }
    return text
        .replace(/[ \t]+/g, " ")
        .replace(/[ \t]*\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
}

/** .docx -> text of word/document.xml (paragraphs split on </w:p>). */
function docxToText(buffer: ArrayBuffer): string {
    const files = unzipSync(new Uint8Array(buffer));
    const xml = files["word/document.xml"];
    if (!xml) throw new Error("File .docx không hợp lệ (thiếu word/document.xml)");
    return xmlText(decodeEntry(xml), "w:t", "w:p");
}

/** .pptx -> text of ppt/slides/slide*.xml, slides separated by blank lines. */
function pptxToText(buffer: ArrayBuffer): string {
    const files = unzipSync(new Uint8Array(buffer));
    const slides = Object.keys(files)
        .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
        .sort((a, b) => {
            const na = Number(a.match(/slide(\d+)/)?.[1] ?? 0);
            const nb = Number(b.match(/slide(\d+)/)?.[1] ?? 0);
            return na - nb;
        });
    if (slides.length === 0) {
        throw new Error("File .pptx không hợp lệ (thiếu slide)");
    }
    return slides
        .map((name) => xmlText(decodeEntry(files[name]), "a:t", "a:p"))
        .filter(Boolean)
        .join("\n\n");
}

/** .pdf -> page texts via pdfjs-dist (dynamic import keeps the bundle lean). */
async function pdfToText(buffer: ArrayBuffer): Promise<string> {
    const pdfjs = await import("pdfjs-dist");
    pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
    const loadingTask = pdfjs.getDocument({ data: new Uint8Array(buffer) });
    const doc = await loadingTask.promise;
    try {
        const pages: string[] = [];
        for (let i = 1; i <= doc.numPages; i++) {
            const page = await doc.getPage(i);
            const content = await page.getTextContent();
            pages.push(
                content.items
                    .map((item: any) => ("str" in item ? (item.str as string) : ""))
                    .join(" ")
                    .replace(/\s+/g, " ")
                    .trim()
            );
        }
        return pages.filter(Boolean).join("\n\n");
    } finally {
        await loadingTask.destroy();
    }
}

function toBase64(buffer: ArrayBuffer): string {
    let binary = "";
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
}

/** Wrap an extracted string, rejecting when nothing usable came out. */
function textResult(text: string): ExtractedFileContent {
    if (!text.trim()) {
        throw new Error("Không trích xuất được nội dung từ file");
    }
    return { kind: "text", text: text.trim() };
}

/**
 * Extract the content of an uploaded LMS file.
 * Throws a user-facing Vietnamese error for unsupported formats or when no
 * text could be extracted.
 */
export async function extractFileContent(file: File): Promise<ExtractedFileContent> {
    if (file.size > MAX_UPLOAD_BYTES) {
        throw new Error("File quá lớn (tối đa 10MB)");
    }

    const ext = extensionOf(file.name);
    if (ext === "txt") {
        return textResult(await file.text());
    }
    if (ext === "html" || ext === "htm") {
        return textResult(htmlToMarkdown(await file.text()));
    }
    if (ext === "docx") {
        return textResult(docxToText(await file.arrayBuffer()));
    }
    if (ext === "pptx") {
        return textResult(pptxToText(await file.arrayBuffer()));
    }
    if (ext === "pdf") {
        return textResult(await pdfToText(await file.arrayBuffer()));
    }
    if (ext === "jpg" || ext === "jpeg" || ext === "png") {
        return {
            kind: "image",
            base64: toBase64(await file.arrayBuffer()),
            mimeType: ext === "jpg" || ext === "jpeg" ? "image/jpeg" : "image/png",
        };
    }

    throw new Error("Định dạng không được hỗ trợ. Dùng .html, .txt, .docx, .pptx, .pdf, .jpg hoặc .png");
}
