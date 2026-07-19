import type { ResourcePage } from "@/lib/types";
import { cleanResourcePages } from "@/lib/ingest/clean-text";

/**
 * Text extraction from uploaded files. Produces page-scoped text so every
 * fact taught later can cite a page number back to the source.
 *
 * IMPORTANT: extracted text is UNTRUSTED. Callers must wrap it in delimiters
 * and never treat it as instructions to the model.
 */

export interface ExtractResult {
  pages: ResourcePage[];
  pageCount: number;
}

const MAX_CHARS_PER_PAGE = 20000;

export async function extractPdf(buffer: Buffer): Promise<ExtractResult> {
  const path = await import("node:path");
  const { pathToFileURL } = await import("node:url");
  // Legacy build runs on the main thread in Node with a resolved worker path.
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  // A file:// URL works for ESM import on all platforms (a bare Windows path
  // like C:\... is not a valid ESM specifier).
  pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(
    path.join(process.cwd(), "node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs")
  ).href;

  const data = new Uint8Array(buffer);
  const doc = await pdfjs.getDocument({
    data,
    isEvalSupported: false,
    useSystemFonts: true,
  }).promise;

  const pages: ResourcePage[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    // Reconstruct readable text, inserting line breaks where items have EOL.
    let text = "";
    for (const item of content.items as Array<{ str: string; hasEOL?: boolean }>) {
      text += item.str;
      text += item.hasEOL ? "\n" : " ";
    }
    text = text.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
    pages.push({ page: i, text: text.slice(0, MAX_CHARS_PER_PAGE) });
    page.cleanup();
  }
  await doc.destroy();

  return { pages, pageCount: doc.numPages };
}

export function extractText(raw: string): ExtractResult {
  // Split plain text / markdown into ~2500-char pseudo-pages so citations and
  // chunking still have granularity.
  const clean = raw.replace(/\r\n/g, "\n").trim();
  const size = 2500;
  const pages: ResourcePage[] = [];
  if (clean.length === 0) return { pages: [], pageCount: 0 };
  for (let i = 0, p = 1; i < clean.length; i += size, p++) {
    pages.push({ page: p, text: clean.slice(i, i + size) });
  }
  return { pages, pageCount: pages.length };
}

export async function extractFromFile(
  buffer: Buffer,
  mimeType: string,
  fileName: string
): Promise<ExtractResult> {
  const lower = fileName.toLowerCase();
  if (mimeType === "application/pdf" || lower.endsWith(".pdf")) {
    const result = await extractPdf(buffer);
    // Strip repeated headers/footers/page markers ONCE at extraction so the
    // stored pages are clean for every downstream AI prompt.
    return { ...result, pages: cleanResourcePages(result.pages) };
  }
  if (
    mimeType.startsWith("text/") ||
    lower.endsWith(".txt") ||
    lower.endsWith(".md") ||
    lower.endsWith(".markdown")
  ) {
    return extractText(buffer.toString("utf8"));
  }
  throw new UnsupportedFileError(
    `Unsupported file type: ${mimeType || fileName}. Upload a PDF, .txt or .md file.`
  );
}

export class UnsupportedFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsupportedFileError";
  }
}
