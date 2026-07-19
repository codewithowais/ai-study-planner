"use client";

import { Workflow, Columns3, Clock, Calculator, ArrowRight, type LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { Visual } from "@/lib/teach/content-quality";

/**
 * Native (no-dependency) renderers for a lesson's optional visual explainers.
 * The model emits a small structured shape (validated + filtered in the lesson
 * schema, so anything here is already well-formed); rendering is still
 * defensive — a missing cell shows blank rather than breaking the table.
 */
export function LessonVisuals({ visuals }: { visuals: Visual[] }) {
  if (!visuals?.length) return null;
  return (
    <section>
      <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold">
        <Workflow className="h-4 w-4 text-primary" />
        See it laid out
      </h2>
      <div className="space-y-3">
        {visuals.map((v, i) => (
          <Card key={i}>
            <CardContent className="p-4">
              {v.type === "flow" && <FlowStrip v={v} />}
              {v.type === "compare" && <CompareTable v={v} />}
              {v.type === "timeline" && <TimelineList v={v} />}
              {v.type === "calc" && <CalcLadder v={v} />}
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}

function Header({ icon: Icon, title }: { icon: LucideIcon; title: string }) {
  return (
    <p className="mb-3 flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
      <Icon className="h-3.5 w-3.5" />
      {title}
    </p>
  );
}

function FlowStrip({ v }: { v: Extract<Visual, { type: "flow" }> }) {
  return (
    <>
      <Header icon={Workflow} title={v.title} />
      <div className="flex flex-wrap items-center gap-2">
        {v.steps.map((s, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className="rounded-md border border-border bg-secondary/40 px-3 py-2">
              <p className="text-sm font-medium">{s.label}</p>
              {s.note && <p className="mt-0.5 text-xs text-muted-foreground">{s.note}</p>}
            </div>
            {i < v.steps.length - 1 && (
              <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            )}
          </div>
        ))}
      </div>
    </>
  );
}

function CompareTable({ v }: { v: Extract<Visual, { type: "compare" }> }) {
  return (
    <>
      <Header icon={Columns3} title={v.title} />
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className="border-b border-border px-2 py-1.5 text-left font-medium" />
              {v.columns.map((c, i) => (
                <th key={i} className="border-b border-border px-2 py-1.5 text-left font-medium">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {v.rows.map((r, ri) => (
              <tr key={ri}>
                <td className="border-b border-border/60 px-2 py-1.5 align-top font-medium text-muted-foreground">
                  {r.label}
                </td>
                {v.columns.map((_, ci) => (
                  <td key={ci} className="border-b border-border/60 px-2 py-1.5 align-top">
                    {r.cells[ci] ?? ""}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function TimelineList({ v }: { v: Extract<Visual, { type: "timeline" }> }) {
  return (
    <>
      <Header icon={Clock} title={v.title} />
      <ol className="relative ml-3 border-l border-border">
        {v.events.map((e, i) => (
          <li key={i} className="mb-3 ml-4 last:mb-0">
            <span className="absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full bg-primary" />
            <p className="text-xs font-medium text-primary">{e.when}</p>
            <p className="text-sm">{e.what}</p>
          </li>
        ))}
      </ol>
    </>
  );
}

function CalcLadder({ v }: { v: Extract<Visual, { type: "calc" }> }) {
  return (
    <>
      <Header icon={Calculator} title={v.title} />
      <div className="divide-y divide-border/60 overflow-hidden rounded-md border border-border">
        {v.steps.map((s, i) => (
          <div key={i} className="flex items-baseline justify-between gap-3 px-3 py-2">
            <div className="min-w-0">
              <p className="text-sm">{s.label}</p>
              {s.note && <p className="text-xs text-muted-foreground">{s.note}</p>}
            </div>
            <p className="shrink-0 font-mono text-sm font-medium tabular-nums">{s.value}</p>
          </div>
        ))}
      </div>
    </>
  );
}
