import type { ParsedDraftShape } from "./intakeSmartDefaults";

export const USER_MATERIAL_TERMS_HEADER = "User-stated material terms:";

export function normalizeTextForMaterialDedup(s: string): string {
  return s
    .toLowerCase()
    .replace(/[\s\u00a0]+/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripUserMaterialBlock(additional: string): string {
  const t = (additional || "").replace(/\r\n/g, "\n");
  if (!t.includes(USER_MATERIAL_TERMS_HEADER)) return t;
  return t
    .replace(
      new RegExp(
        `\\n*${USER_MATERIAL_TERMS_HEADER.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\\s\\S]*$`,
        "i",
      ),
      "",
    )
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Asks that are not already found in purpose, payment, termination, or the non-material part of additional.
 */
function askCoveredByCorpus(ask: string, draft: ParsedDraftShape, additionalWithoutUserBlock: string): boolean {
  const nAsk = normalizeTextForMaterialDedup(ask);
  if (nAsk.length < 4) return true;
  const corpus = normalizeTextForMaterialDedup(
    [draft.purpose, draft.payment_terms, draft.termination_summary, additionalWithoutUserBlock]
      .filter(Boolean)
      .join(" "),
  );
  if (!corpus) return false;
  if (nAsk.length <= 80 && corpus.includes(nAsk)) return true;
  for (let i = 0; i + 20 <= nAsk.length; i += 6) {
    const slice = nAsk.slice(i, i + 32);
    if (slice.length >= 20 && corpus.includes(slice)) return true;
  }
  return false;
}

function parseBulletsFromBlock(full: string): { before: string; existingBullets: string[] } {
  const t = (full || "").replace(/\r\n/g, "\n");
  if (!t.includes(USER_MATERIAL_TERMS_HEADER)) {
    return { before: t, existingBullets: [] };
  }
  const idx = t.indexOf(USER_MATERIAL_TERMS_HEADER);
  const before = t.slice(0, idx).trim();
  const rest = t.slice(idx);
  const existingBullets: string[] = [];
  for (const line of rest.split("\n")) {
    const s = line.trim();
    if (!s || s === USER_MATERIAL_TERMS_HEADER) continue;
    if (s.startsWith("- ")) existingBullets.push(s.slice(2).trim());
  }
  return { before, existingBullets: existingBullets.filter(Boolean) };
}

function buildMaterialBlock(asks: string[]): string {
  const body = asks.map((a) => (a.trim().startsWith("- ") ? a.trim() : `- ${a.trim()}`)).join("\n");
  return `${USER_MATERIAL_TERMS_HEADER}\n\n${body}`;
}

/**
 * Merges `material_asks` into `additional_terms` with dedup; idempotent when the same asks are re-applied.
 */
export function mergeMaterialAsksIntoAdditionalTerms(draft: ParsedDraftShape): ParsedDraftShape {
  const raw = draft.material_asks;
  if (!raw?.length) return draft;

  const originalAdd = (draft.additional_terms || "").replace(/\r\n/g, "\n");
  const restAdd = stripUserMaterialBlock(originalAdd);
  const { before, existingBullets } = parseBulletsFromBlock(originalAdd);

  const byNorm = new Set<string>(existingBullets.map((b) => normalizeTextForMaterialDedup(b)));
  const outList: string[] = [...existingBullets];

  for (const a of raw) {
    const t = a.trim();
    if (!t) continue;
    const n = normalizeTextForMaterialDedup(t);
    if (byNorm.has(n)) continue;
    if (askCoveredByCorpus(t, { ...draft, additional_terms: restAdd }, restAdd)) continue;
    byNorm.add(n);
    outList.push(t);
  }

  if (!outList.length) {
    return { ...draft, material_asks: raw };
  }

  const block = buildMaterialBlock(outList);
  const base = (before && before.length ? before.trim() : restAdd.trim());
  const additional_terms = base ? `${base}\n\n${block}` : block;
  return { ...draft, additional_terms, material_asks: raw };
}

export function ensureMaterialAsksInAdditional(draft: ParsedDraftShape): ParsedDraftShape {
  if (!draft.material_asks?.length) return draft;
  return mergeMaterialAsksIntoAdditionalTerms(draft);
}
