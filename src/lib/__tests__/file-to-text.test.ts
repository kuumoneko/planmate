import { describe, expect, test } from "bun:test";
import { strToU8, zipSync } from "fflate";
import { extractFileContent, htmlToMarkdown, stripHtmlTags } from "@/lib/file-to-text";

const DOCX_XML = `<?xml version="1.0"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>CO3001 - Phân tích thiết kế hướng đối tượng</w:t></w:r></w:p>
    <w:p><w:r><w:t>Bài tập 1 - hạn nộp: 15/04/2026 (10%)</w:t></w:r></w:p>
  </w:body>
</w:document>`;

function docxFile(): File {
    return new File([zipSync({ "word/document.xml": strToU8(DOCX_XML) })], "todo.docx");
}

function pptxFile(): File {
    const slide = (n: number) =>
        `<?xml version="1.0"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">
        <a:p><a:r><a:t>Tuần ${n}</a:t></a:r></a:p>
        <a:p><a:r><a:t>Bài tập ${n} - hạn nộp: 15/04/2026</a:t></a:r></a:p></p:sld>`;
    return new File(
        [
            zipSync({
                "ppt/slides/slide1.xml": strToU8(slide(1)),
                "ppt/slides/slide2.xml": strToU8(slide(2)),
            }),
        ],
        "todo.pptx"
    );
}

describe("extractFileContent", () => {
    test("extracts text from .docx (zip + document.xml)", async () => {
        const out = await extractFileContent(docxFile());
        expect(out.kind).toBe("text");
        if (out.kind === "text") {
            expect(out.text).toContain("CO3001 - Phân tích thiết kế hướng đối tượng");
            expect(out.text).toContain("Bài tập 1 - hạn nộp: 15/04/2026 (10%)");
        }
    });

    test("keeps .docx paragraphs on separate lines (multi-run paragraphs joined)", async () => {
        const xml = `<?xml version="1.0"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>TRƯỜNG ĐẠI HỌC BÁCH KHOA, ĐHQG TPHCM</w:t></w:r></w:p>
    <w:p><w:r><w:t>KHOA KHOA HỌC ỨNG DỤNG</w:t></w:r></w:p>
    <w:p><w:r><w:t>BỘ MÔN</w:t></w:r><w:r><w:t> LÝ LUẬN CHÍNH TRỊ</w:t></w:r></w:p>
  </w:body>
</w:document>`;
        const file = new File([zipSync({ "word/document.xml": strToU8(xml) })], "p.docx");
        const out = await extractFileContent(file);
        expect(out.kind).toBe("text");
        if (out.kind === "text") {
            const lines = out.text.split("\n");
            expect(lines).toEqual([
                "TRƯỜNG ĐẠI HỌC BÁCH KHOA, ĐHQG TPHCM",
                "KHOA KHOA HỌC ỨNG DỤNG",
                "BỘ MÔN LÝ LUẬN CHÍNH TRỊ",
            ]);
        }
    });

    test("extracts text from .pptx slides in order", async () => {
        const out = await extractFileContent(pptxFile());
        expect(out.kind).toBe("text");
        if (out.kind === "text") {
            expect(out.text).toContain("Tuần 1");
            expect(out.text).toContain("Tuần 2");
            expect(out.text.indexOf("Tuần 1")).toBeLessThan(out.text.indexOf("Tuần 2"));
            expect(out.text).toContain("Bài tập 2 - hạn nộp: 15/04/2026");
        }
    });

    test("passes .txt through", async () => {
        const out = await extractFileContent(new File(["   bài tập 3 - hạn 20/05/2026  "], "a.txt"));
        expect(out).toEqual({ kind: "text", text: "bài tập 3 - hạn 20/05/2026" });
    });

    test("converts .html files to markdown", async () => {
        const out = await extractFileContent(
            new File(["<div>Bài tập <b>4</b> - hạn nộp: 15/04/2026</div>"], "a.html")
        );
        expect(out).toEqual({ kind: "text", text: "Bài tập **4** - hạn nộp: 15/04/2026" });
    });

    test("htmlToMarkdown converts headings and nested lists", () => {
        const html =
            "<h2>CO3001 - Phân tích thiết kế hướng đối tượng</h2>" +
            "<ul><li><strong>Bài tập 1</strong> - hạn nộp: 15/04/2026 (10%)" +
            "<ul><li>hạn nộp: 30/05/2026</li></ul></li></ul>";
        expect(htmlToMarkdown(html)).toBe(
            "## CO3001 - Phân tích thiết kế hướng đối tượng\n" +
                "- **Bài tập 1** - hạn nộp: 15/04/2026 (10%)\n" +
                "  - hạn nộp: 30/05/2026"
        );
    });

    test("htmlToMarkdown converts links and ordered lists", () => {
        const html =
            '<ol><li><a href="https://lms.hcmut.edu.vn">Bài tập 1</a></li>' +
            "<li>Bài tập <em>2</em></li></ol>";
        expect(htmlToMarkdown(html)).toBe(
            "1. [Bài tập 1](https://lms.hcmut.edu.vn)\n1. Bài tập *2*"
        );
    });

    test("htmlToMarkdown strips script and style blocks", () => {
        const html =
            "<script>var x = 1;</script><p>Bài tập 1</p>" +
            "<style>p { color: red; }</style><p>hạn nộp: 15/04/2026</p>";
        expect(htmlToMarkdown(html)).toBe("Bài tập 1\nhạn nộp: 15/04/2026");
    });

    test("returns image payload for .png", async () => {
        const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
        const out = await extractFileContent(new File([png], "screenshot.png"));
        expect(out).toEqual({ kind: "image", mimeType: "image/png", base64: "iVBORw0KGgo=" });
    });

    test("maps .jpg and .jpeg to image/jpeg", async () => {
        const jpg = new File([new Uint8Array([255, 216, 255])], "a.jpeg");
        const out = await extractFileContent(jpg);
        expect(out.kind).toBe("image");
        if (out.kind === "image") {
            expect(out.mimeType).toBe("image/jpeg");
        }
    });

    test("rejects unsupported legacy formats", async () => {
        await expect(extractFileContent(new File(["x"], "old.doc"))).rejects.toThrow(
            "Định dạng không được hỗ trợ"
        );
    });

    test("rejects empty extractions", async () => {
        await expect(extractFileContent(new File(["   "], "empty.txt"))).rejects.toThrow(
            "Không trích xuất được nội dung từ file"
        );
        await expect(
            extractFileContent(new File([zipSync({ "word/document.xml": strToU8("") })], "e.docx"))
        ).rejects.toThrow("Không trích xuất được nội dung từ file");
    });

    test("rejects files over 10MB", async () => {
        const big = new File([new Uint8Array(11 * 1024 * 1024)], "big.pdf");
        await expect(extractFileContent(big)).rejects.toThrow("File quá lớn");
    });
});

describe("stripHtmlTags", () => {
    test("removes tags and normalizes whitespace", () => {
        expect(
            stripHtmlTags("<p>Bài tập <b>5</b></p><div>&amp; deadline</div><script>var x=1;</script>")
        ).toBe("Bài tập 5 \n & deadline");
    });
});
