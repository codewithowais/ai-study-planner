# MarkItDown vs pdfjs-dist for PDF Text Extraction

Research report for the amna study app (local Next.js/Node, student-uploaded lecture PDFs, per-page text used for AI lesson generation and page-level citations).

Date researched: 2026-07-19. Sources fetched live from GitHub, project docs, and third-party reviews. Anything not directly verifiable is flagged.

---

## Summary

- **MarkItDown is a Python 3.10+ CLI/library** (Microsoft, MIT license, `pip install 'markitdown[pdf]'`) that converts many formats to Markdown for LLM consumption. For PDFs it is **not** a layout-analysis tool: prose PDFs come out as **plain text via pdfminer.six**, with no heading levels and no page markers.
- **Page-level mapping — the app's hard requirement — is not supported in released MarkItDown.** Output is one continuous string; a PR adding `extract_pages` (PR #1263) has been open since May 2025 and is still unmerged as of mid-2026.
- Adopting it would add a **Python runtime + subprocess bridge** to a local app distributed to non-technical Windows/macOS users, for output quality that is roughly equivalent to what pdfjs-dist already produces on text-based lecture handouts.
- **Recommendation: keep pdfjs-dist as the extractor and invest in a text-cleaning/normalization layer.** If richer structure is ever needed, the best upgrade paths keep page fidelity: `mupdf` (npm, WASM, Node-native) or `pymupdf4llm` with `page_chunks=True` (Python).

---

## What MarkItDown Is

- Python utility from Microsoft that converts PDF, DOCX, PPTX, XLSX, images, audio, HTML, CSV/JSON/XML, ZIP, EPub, and YouTube URLs to Markdown, "optimized for use with large language models."
- Language/runtime: **Python >= 3.10**. Install: `pip install 'markitdown[all]'` or `'markitdown[pdf]'` for just PDF support. Usable as a CLI (`markitdown file.pdf > out.md`) or as a Python library.
- The README itself says the output "is meant to be consumed by text analysis tools" and "may not be the best option for high-fidelity document conversions" — i.e., it optimizes for token-friendly text, not layout fidelity.
- LLM features: an `llm_client`/`llm_model` option (tested with GPT-4o) generates **image descriptions for images and PPTX only** — it does not apply to PDF text. Third-party plugins (e.g., `markitdown-ocr`) are off by default.

Sources: [microsoft/markitdown README](https://github.com/microsoft/markitdown), [MarkItDown PDF docs (mintlify.wiki mirror)](https://mintlify.wiki/microsoft/markitdown/formats/pdf).

## PDF Extraction Internals

- The current PDF converter (`packages/markitdown/src/markitdown/converters/_pdf_converter.py` on `main`) uses a **hybrid**: `pdfplumber` to detect form/table-style content (word-position/column-alignment heuristics, emitted as pipe Markdown tables), and **`pdfminer.high_level.extract_text()` as the path for ordinary prose** pages. Earlier releases were pure pdfminer.
- **What it can infer from a PDF:** paragraph flow, and borderless form/invoice-style tables (a heuristic aimed at forms, not lecture tables). **What it cannot infer:** heading levels, lists, bold/italic, multi-column reading in all cases, images (placeholders only), PDF metadata. PDFs carry no semantic structure, and MarkItDown does not do font-size/layout analysis to reconstruct headings the way pymupdf4llm or Marker do.
- Independent reviews confirm this: MarkItDown's "PDF conversion extracts plain text only, no heading levels or layout"; tables are "mostly plain text, complex styles lost" ([Jimmy Song, Marker vs MinerU vs MarkItDown deep dive](https://jimmysong.io/blog/pdf-to-markdown-open-source-deep-dive/); see also [GitHub issue #206 "Extraction is not in markdown"](https://github.com/microsoft/markitdown/issues/206)).
- **Net: for a text-based lecture handout (e.g., VU handouts), MarkItDown's output is essentially pdfminer.six plain text — a `.md` file with no actual Markdown structure.**

## Page-Mapping Constraint (hard requirement for this app)

- **Released MarkItDown returns one concatenated string for the whole document. There are no page markers, no page numbers, no per-page API.**
- This is a long-standing, repeatedly requested gap:
  - [Issue #122 — "Pagewise Markdown output"](https://github.com/microsoft/markitdown/issues/122) (requested precisely for RAG citations, the app's use case)
  - [Issue #210 — "Output PageNumber" option](https://github.com/microsoft/markitdown/issues/210), [Issue #1317 — "How to keep page number"](https://github.com/microsoft/markitdown/issues/1317)
  - [PR #1263 — adds `extract_pages` / per-page `PageInfo` results](https://github.com/microsoft/markitdown/pull/1263): maintainers responded positively, but the PR has been **open and unmerged from May 2025 through at least June 2026**.
- Workaround would be splitting the PDF into single-page PDFs and running MarkItDown per page — N subprocess invocations per document, with per-page pdfminer layout analysis overhead. Ugly and slow for a feature pdfjs-dist gives natively (`page.getTextContent()` is inherently per-page).
- Also note [Discussion #1326](https://github.com/microsoft/markitdown/discussions/1326): MarkItDown does not strip running headers/footers/page indicators either — so it does not even clean the one page-related artifact you might want removed.

**This alone disqualifies MarkItDown as the primary extractor for this app.**

## Integration Cost

- **Python runtime dependency.** The app is a local Next.js/Node tool for non-technical users on Windows/macOS. MarkItDown requires Python 3.10+, a pip environment, and native deps (pdfminer.six, pdfplumber, cryptography). There is no official JS port or WASM build; npm packages named "markitdown" are unofficial wrappers that still shell out to Python or reimplement fragments.
- **Bridging:** `child_process.spawn('markitdown', ...)` or a long-lived Python sidecar; either way you own Python discovery, venv setup, PATH issues on Windows, stderr/exit-code handling, and version pinning. Packaging Python alongside a Node/Electron-style local app (embedded CPython or PyInstaller-frozen binary) adds ~50–100 MB and a second toolchain to CI.
- Compare: pdfjs-dist is already in `node_modules`, pure JS/WASM, zero extra runtime. For a personal/local tool, every extra runtime is a real support cost.

## Quality Comparison for Text-Based Lecture PDFs

For born-digital, text-layer PDFs (typical VU handouts), both stacks read the same embedded text; differences are in ordering/spacing heuristics, not recovered structure:

- **Reading order:** pdfminer.six performs layout analysis (grouping into text boxes) and generally emits human reading order; pdf.js `getTextContent()` returns items in **content-stream order**, which for normally-authored single-column lecture PDFs matches reading order, but can interleave on multi-column or heavily absolutely-positioned pages. If your handouts are single-column (VU handouts are), this rarely matters. Neither tool reliably fixes true multi-column reading order — MarkItDown's own docs admit "multi-column newspaper-style layouts may not be perfectly preserved."
- **Ligatures/Unicode:** pdf.js applies ToUnicode maps and normalizes common ligatures (fi/fl) when the PDF provides the mapping; pdfminer.six does the same. When the PDF lacks a ToUnicode map, **both** produce garbage — that is a property of the file, not the library. (Both projects have open issues on pathological files, e.g. [pdf.js #20376](https://github.com/mozilla/pdf.js/issues/20376).)
- **Spacing/line joining:** pdf.js gives you positioned items (`transform`, `width`, `hasEOL`) and leaves joining to you — which is exactly where a small cleaning layer (join hyphenated line breaks, insert spaces on x-gaps, collapse whitespace) pays off. pdfminer applies its own heuristics (word margin/char margin) with occasional mis-merges. Neither is categorically better; both are tunable.
- **Tables:** MarkItDown's pdfplumber path targets *form-style* documents (field/value pairs); it is not a general table reconstructor. pdfjs-dist does nothing for tables. For occasional tables in lecture notes, both effectively produce run-together text — a wash.
- **Structure (headings/lists):** neither recovers it. MarkItDown outputs plain text for prose PDFs (verified above); pdfjs-dist outputs plain text. If heading recovery mattered, the tools that actually do it are pymupdf4llm (font-size histogram → `#` levels), Marker, MinerU, Docling — not MarkItDown.
- **Scanned pages/OCR:** neither pdfjs-dist nor core MarkItDown handles image-only PDFs. MarkItDown's docs state it "cannot extract text from scanned/image PDFs"; OCR requires the third-party `markitdown-ocr` plugin (LLM-vision based, needs an API key) or Azure Document Intelligence. So MarkItDown buys no OCR advantage out of the box.

**Verdict for this corpus:** no meaningful quality win from switching. The realistic quality gains for lecture handouts come from post-processing (dehyphenation, header/footer stripping, whitespace normalization), which is library-agnostic and cheap to add on top of pdfjs-dist.

Sources: [Jimmy Song comparison](https://jimmysong.io/blog/pdf-to-markdown-open-source-deep-dive/), [MarkItDown PDF docs](https://mintlify.wiki/microsoft/markitdown/formats/pdf), [Nutrient: extracting text with PDF.js](https://www.nutrient.io/blog/how-to-extract-text-from-a-pdf-using-javascript/), [Strapi: 7 PDF parsing libraries for Node.js](https://strapi.io/blog/7-best-javascript-pdf-parsing-libraries-nodejs-2025), [pdfminer.six docs](https://pdfminersix.readthedocs.io/).

*Not verified:* no rigorous published benchmark directly scoring pdfminer.six vs pdf.js on extraction accuracy was found; the equivalence claim above is based on both libraries' documented mechanisms and multiple qualitative reviews.

## Alternatives (one line each)

- **[unpdf](https://github.com/unjs/unpdf)** (Node): serverless-friendly repackaging of PDF.js with a simpler API — same engine as pdfjs-dist, so no quality change; only worth it for API ergonomics.
- **[pdf-parse](https://www.npmjs.com/package/pdf-parse)** (Node): the classic pdf.js wrapper; long unmaintained with known fs footguns — do not migrate to it.
- **[mupdf](https://artifex.com/blog/mupdfjs-with-npm) (npm, WASM)** (Node-native): MuPDF compiled to WASM with per-page structured text (blocks/lines/spans with fonts and coordinates) — the strongest Node-native upgrade if you ever want font-size-based heading inference while keeping page mapping; AGPL/commercial dual license.
- **[pymupdf4llm](https://pymupdf.readthedocs.io/en/latest/pymupdf4llm/)** (Python): actually produces Markdown headings (font-size histogram) and supports `page_chunks=True` for per-page output — the right Python choice if you ever add a Python sidecar, far better fit than MarkItDown; AGPL.
- **[Marker](https://github.com/VikParuchuri/marker)** (Python, ML): best structure fidelity (headings, tables, reading order) but heavy deep-learning deps, GPU-preferred — overkill for a local personal app.
- **[Docling](https://github.com/docling-project/docling)** (Python, IBM): layout-model-based, good tables and reading order, page provenance in its JSON output — same heavy-Python objection.

## Recommendation

**Keep pdfjs-dist as the primary (and only) extractor. Do not adopt MarkItDown.** Rationale:

1. **Page mapping is a hard requirement** the app already satisfies; MarkItDown cannot satisfy it without unmerged PRs or a page-splitting hack.
2. **Zero quality upside for this corpus:** for text-based single-column lecture handouts, MarkItDown ≈ pdfminer plain text ≈ pdfjs-dist plain text.
3. **High integration cost:** a Python runtime, subprocess bridging, and Windows/macOS packaging pain in a local app for non-technical users.

Instead, invest ~a day in a **text-cleaning layer over the existing per-page pdfjs-dist output**:

- join items using `transform`/`hasEOL` with an x-gap threshold (fixes missing/spurious spaces);
- de-hyphenate line-break hyphens (`exam-\nple` → `example`);
- strip repeated running headers/footers and bare page-number lines by detecting lines that recur across >60% of pages;
- normalize Unicode (NFKC handles residual ligature codepoints) and collapse whitespace;
- optionally flag pages whose extracted text is near-empty (likely scanned) so the UI can warn the student instead of silently generating lessons from nothing.

If richer structure ever becomes necessary (heading detection for better lesson outlines), the upgrade path is **`mupdf` on npm (stays Node, keeps pages)** or an optional **pymupdf4llm** sidecar with `page_chunks=True` — not MarkItDown.

---

### Source Index

- https://github.com/microsoft/markitdown (README)
- https://github.com/microsoft/markitdown — `packages/markitdown/src/markitdown/converters/_pdf_converter.py` (main branch source)
- https://mintlify.wiki/microsoft/markitdown/formats/pdf (PDF format docs)
- https://github.com/microsoft/markitdown/issues/122, /issues/210, /issues/1317, /issues/206, /discussions/1326
- https://github.com/microsoft/markitdown/pull/1263 (per-page extraction PR, open)
- https://jimmysong.io/blog/pdf-to-markdown-open-source-deep-dive/ (Marker vs MinerU vs MarkItDown)
- https://strapi.io/blog/7-best-javascript-pdf-parsing-libraries-nodejs-2025
- https://www.nutrient.io/blog/how-to-extract-text-from-a-pdf-using-javascript/
- https://github.com/unjs/unpdf, https://www.npmjs.com/package/pdf-parse
- https://artifex.com/blog/mupdfjs-with-npm (MuPDF.js npm)
- https://pymupdf.readthedocs.io/en/latest/pymupdf4llm/ (headings + page_chunks)
- https://pdfminersix.readthedocs.io/
