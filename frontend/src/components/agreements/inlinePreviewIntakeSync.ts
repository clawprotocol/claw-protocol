import type { LivePreviewInlineField } from "./liveDraftHeuristics";

/** Insert or replace a single `Field: value` line (case-insensitive label match on that line). */
export function upsertLabeledIntakeLine(source: string, field: LivePreviewInlineField, value: string): string {
  const v = value.trim();
  if (!v) return source;
  const line = `${field}: ${v}`;
  const lines = source.split(/\n/);
  const escaped = field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`^\\s*${escaped}:\\s*`, "i");
  let idx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (re.test(lines[i] ?? "")) {
      idx = i;
      break;
    }
  }
  if (idx >= 0) {
    const next = [...lines];
    next[idx] = line;
    return next.join("\n");
  }
  const t = source.trimEnd();
  return t ? `${t}\n${line}` : line;
}
