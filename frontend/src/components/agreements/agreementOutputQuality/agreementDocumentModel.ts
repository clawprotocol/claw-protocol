/**
 * Structured agreement document model — sections are the unit of isolated polish/repair.
 */

import { parseAgreementSections } from "../proOperationalSynthesis/sectionPurityValidator";
import type { AgreementDocument, AgreementDocumentSection } from "./types";

const NUMBERED_HEADING_RE = /^(?:\d+\.?\s+)([A-Z][A-Za-z0-9\s/&-]{2,72})\s*\.?\s*$/;
const ALL_CAPS_HEADING_RE = /^([A-Z][A-Z0-9\s/&-]{2,72})\s*\.?\s*$/;

function isSectionHeadingLine(line: string): boolean {
  const trimmed = line.replace(/\.\s*$/, "");
  const m = line.match(NUMBERED_HEADING_RE) || line.match(ALL_CAPS_HEADING_RE);
  if (!m) return false;
  const isAllCaps = Boolean(line.match(ALL_CAPS_HEADING_RE));
  return (
    trimmed.length < 72 &&
    (isAllCaps || !line.includes(".")) &&
    !/\b(?:shall|are|is|will|must|agreed|below|listed|resolved|provided)\b/i.test(trimmed)
  );
}

/** Split plain agreement text into preamble, typed sections, and trailing footer (e-sign, witnesses). */
export function parseAgreementDocument(text: string): AgreementDocument {
  const raw = (text || "").replace(/\r\n/g, "\n");
  const lines = raw.split("\n");
  const firstHeadingIdx = lines.findIndex((ln) => isSectionHeadingLine(ln.trim()));
  const preamble =
    firstHeadingIdx < 0 ? raw.trim() : lines.slice(0, firstHeadingIdx).join("\n").trim();

  const parsed = parseAgreementSections(raw);
  const sections: AgreementDocumentSection[] = parsed.map((s, index) => ({
    ...s,
    index,
  }));

  let footer = "";
  const sigIdx = sections.findIndex((s) => s.kind === "signatures");
  if (sigIdx >= 0) {
    const tailStart = sections[sigIdx].startLine;
    const tailLines = lines.slice(tailStart);
    const esignRe = /executed electronically via lawdog/i;
    const esignLine = tailLines.findIndex((ln) => esignRe.test(ln));
    if (esignLine >= 0) {
      footer = tailLines.slice(esignLine).join("\n").trim();
    }
  }

  return { preamble, sections, footer };
}

export function serializeAgreementDocument(doc: AgreementDocument): string {
  const parts: string[] = [];
  if (doc.preamble.trim()) parts.push(doc.preamble.trim());
  for (const sec of doc.sections) {
    parts.push(sec.heading);
    const body = (sec.body || "").trim();
    if (body) parts.push(body);
    parts.push("");
  }
  if (doc.footer.trim()) {
    if (parts.length) parts.push("");
    parts.push(doc.footer.trim());
  }
  return parts.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * Apply a mutator to one section body only; preamble/footer unchanged.
 */
export function mutateAgreementSection(
  doc: AgreementDocument,
  index: number,
  mutate: (body: string, section: AgreementDocumentSection) => string,
): AgreementDocument {
  const sections = doc.sections.map((sec) => {
    if (sec.index !== index) return sec;
    return { ...sec, body: mutate(sec.body || "", sec) };
  });
  return { ...doc, sections };
}

export function mutateSectionsByKind(
  doc: AgreementDocument,
  kinds: ReadonlySet<string>,
  mutate: (body: string, section: AgreementDocumentSection) => string,
): AgreementDocument {
  let out = doc;
  for (const sec of doc.sections) {
    if (!kinds.has(sec.kind)) continue;
    out = mutateAgreementSection(out, sec.index, mutate);
  }
  return out;
}
