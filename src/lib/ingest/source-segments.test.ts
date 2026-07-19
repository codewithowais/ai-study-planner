import test from "node:test";
import assert from "node:assert/strict";

import { segmentResourcePages } from "./source-segments.ts";

test("short pages remain unchanged", () => {
  const pages = [{ page: 1, text: "A complete short page." }];
  assert.deepEqual(segmentResourcePages(pages, 100, 10), pages);
});

test("long pages are fully represented instead of silently truncated", () => {
  const markers = Array.from(
    { length: 30 },
    (_, index) => `TOPIC_${index}_${"x".repeat(20)}`
  );
  const [page] = [{ page: 7, text: markers.join(" ") }];
  const segments = segmentResourcePages([page], 180, 30);

  assert.ok(segments.length > 1);
  assert.ok(segments.every((segment) => segment.page === 7));
  const represented = segments.map((segment) => segment.text).join("\n");
  for (const marker of markers) assert.match(represented, new RegExp(marker));
});

test("segment overlap preserves concepts that cross a boundary", () => {
  const phrase = "CROSS_BOUNDARY_CONCEPT";
  const text = `${"a".repeat(90)} ${phrase} ${"b".repeat(90)}`;
  const segments = segmentResourcePages([{ page: 2, text }], 110, 40);

  assert.ok(segments.some((segment) => segment.text.includes(phrase)));
});
