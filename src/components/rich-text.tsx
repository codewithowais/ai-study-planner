import React from "react";

/** Render inline **bold** and `code` spans safely as React nodes. */
function inline(text: string, keyBase: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const regex = /\*\*(.+?)\*\*|`(.+?)`/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = regex.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    if (m[1] !== undefined) {
      nodes.push(
        <strong key={`${keyBase}-b-${i}`} className="font-semibold text-foreground">
          {m[1]}
        </strong>
      );
    } else if (m[2] !== undefined) {
      nodes.push(
        <code
          key={`${keyBase}-c-${i}`}
          className="rounded bg-secondary px-1 py-0.5 text-[0.85em]"
        >
          {m[2]}
        </code>
      );
    }
    last = m.index + m[0].length;
    i++;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

/**
 * Minimal, safe renderer for tutor-generated content. Supports paragraphs,
 * "- " / "* " bullet lists, and inline bold / code. No raw HTML is injected.
 */
export function RichText({ text, className }: { text: string; className?: string }) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks: React.ReactNode[] = [];
  let bullets: string[] = [];
  let key = 0;

  const flush = () => {
    if (bullets.length) {
      blocks.push(
        <ul key={`ul-${key++}`} className="my-2 ml-5 list-disc space-y-1">
          {bullets.map((b, i) => (
            <li key={i}>{inline(b, `li-${key}-${i}`)}</li>
          ))}
        </ul>
      );
      bullets = [];
    }
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    const bullet = line.match(/^\s*[-*]\s+(.*)$/);
    if (bullet) {
      bullets.push(bullet[1]);
    } else if (line.trim() === "") {
      flush();
    } else {
      flush();
      blocks.push(
        <p key={`p-${key++}`} className="my-2 leading-relaxed">
          {inline(line, `p-${key}`)}
        </p>
      );
    }
  }
  flush();

  return <div className={className}>{blocks}</div>;
}
