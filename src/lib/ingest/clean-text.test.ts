import test from "node:test";
import assert from "node:assert/strict";

import { cleanPageText, cleanResourcePages } from "./clean-text.ts";

const HEADER = "Taxation Management – FIN623 VU";
const FOOTER = "©Copyright Virtual University of Pakistan";

function page(page: number, body: string): { page: number; text: string } {
  return { page, text: `${HEADER}\n${body}\nPage ${page} of 10\n${FOOTER}` };
}

test("page-number lines and consecutive duplicates are removed", () => {
  const cleaned = cleanPageText(
    "Real content line.\nReal content line.\n12 of 131\nPage 7\n- 3 -\nNext line.\n\n\n\nAfter blanks."
  );
  assert.equal(
    cleaned,
    "Real content line.\nNext line.\n\nAfter blanks."
  );
});

test("repeated headers and footers are stripped across pages", () => {
  const pages = Array.from({ length: 10 }, (_, i) =>
    page(i + 1, `Lesson ${i + 1} content about tax rules.\nMore detail here.`)
  );
  const cleaned = cleanResourcePages(pages);
  for (const p of cleaned) {
    assert.ok(!p.text.includes(HEADER), "header should be stripped");
    assert.ok(!p.text.includes(FOOTER), "footer should be stripped");
    assert.ok(!/Page \d+ of 10/.test(p.text), "page marker should be stripped");
    assert.ok(p.text.includes("content about tax rules"), "body must survive");
  }
});

test("digit variance in footers still counts as the same boilerplate line", () => {
  const pages = Array.from({ length: 8 }, (_, i) => ({
    page: i + 1,
    text: `Handout updated 2026-0${(i % 9) + 1}-15\nActual lesson body ${i}.\nSection continues here.`,
  }));
  const cleaned = cleanResourcePages(pages);
  for (const p of cleaned) {
    assert.ok(!p.text.includes("Handout updated"), "dated header unified by digit-normalization");
    assert.ok(p.text.includes("Actual lesson body"));
  }
});

test("legitimate repeated content in the page BODY is never stripped", () => {
  const refrain = "Tax is a compulsory contribution.";
  const pages = Array.from({ length: 10 }, (_, i) => ({
    page: i + 1,
    text: `${HEADER}\nIntro line ${i}.\nfiller\nfiller2\n${refrain}\nfiller3\nfiller4\nClosing line ${i}.`,
  }));
  const cleaned = cleanResourcePages(pages);
  for (const p of cleaned) {
    assert.ok(p.text.includes(refrain), "body-zone repeats must survive");
  }
});

test("cleaning is idempotent and safe on few pages", () => {
  const pages = [page(1, "Body one."), page(2, "Body two.")];
  const once = cleanResourcePages(pages);
  const twice = cleanResourcePages(once);
  assert.deepEqual(once, twice);
  // Below MIN_PAGES the cross-page pass is skipped but per-page cleanup runs.
  assert.ok(!/Page 1 of 10/.test(once[0].text));
});
