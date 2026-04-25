/**
 * Front-end-only hints for when the optional Full Draft upgrade is a better fit.
 * Not authoritative — server parse remains source of truth.
 */
import { matchesAdvancedInstrumentPhrases } from "./agreementLaunchFamilies";

const US_STATE_ABBR_RE = new RegExp(
  "\\b(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY)\\b",
  "gi",
);

function partiesLineSuggestsThreePlus(partiesLine: string | null | undefined): boolean {
  const pl = (partiesLine || "").trim();
  if (!pl) return false;
  const andSplit = pl.split(/\s+and\s+/i).filter(Boolean);
  if (andSplit.length >= 3) return true;
  const commaCount = (pl.match(/,/g) || []).length;
  return commaCount >= 2 && /\band\b/i.test(pl);
}

export function detectFullDraftUpgradeSignals(
  intakeText: string,
  draft: { parties?: unknown[] } | null | undefined,
  partiesLine?: string | null,
): boolean {
  const raw = (intakeText || "").replace(/\s+/g, " ").trim();
  if (!raw) return false;
  const low = raw.toLowerCase();

  if (matchesAdvancedInstrumentPhrases(raw)) return true;

  const partyCount = draft?.parties?.length ?? 0;
  if (partyCount >= 3) return true;

  if (partiesLineSuggestsThreePlus(partiesLine)) return true;

  if (
    /\b(three parties|triparty|tri-party|tripartite|between three parties|three-way|3-party|three party|3 party)\b/i.test(
      raw,
    )
  ) {
    return true;
  }

  if (/\b(third party|party\s*c\b|party\s*iii\b|party\s*3\b)\b/i.test(low)) return true;

  if (/\b(statutory maximum)\b/i.test(low)) return true;
  if (/\b(best practices|tailored(?:\s+to|\s+for|\s+clause)?)\b/i.test(low)) return true;

  if (
    /\b(multiple states?|multi-state|dual governing|two governing laws|multiple jurisdictions|choice of laws?)\b/i.test(
      low,
    )
  ) {
    return true;
  }

  const governingLawHits = raw.match(/\bgoverning law\b/gi);
  if (governingLawHits && governingLawHits.length >= 2) return true;

  const stateMatches = raw.match(US_STATE_ABBR_RE);
  if (stateMatches) {
    const distinct = new Set(stateMatches.map((s) => s.toUpperCase()));
    if (distinct.size >= 2) return true;
  }

  return false;
}

export function getFullDraftUpgradeDetectedLine(
  intakeText: string,
  draft: { parties?: unknown[] } | null | undefined,
  partiesLine?: string | null,
): string | null {
  if (!detectFullDraftUpgradeSignals(intakeText, draft, partiesLine)) return null;
  return "Detected: multi-party or tailored agreement request";
}

export type UpgradeComparisonRow = { basic: string; full: string };

/** First row on every full-draft comparison — never omitted by intake heuristics. */
export const PREMIUM_COLLABORATION_AND_SIGN_ROW: UpgradeComparisonRow = {
  basic: "Review with the other party",
  full: "Easier revisions & negotiation before signing — plus tracked e-signing & proof when terms are final",
};

function intakeTripartyPhrases(raw: string): boolean {
  return /\b(three parties|triparty|tri-party|tripartite|between three parties|three-way|3-party|three party|3 party)\b/i.test(
    raw,
  );
}

function intakeMultiStateSignals(raw: string): boolean {
  const low = raw.toLowerCase();
  if (
    /\b(multiple states?|multi-state|dual governing|two governing laws|multiple jurisdictions|choice of laws?)\b/i.test(
      low,
    )
  ) {
    return true;
  }
  const governingLawHits = raw.match(/\bgoverning law\b/gi);
  if (governingLawHits && governingLawHits.length >= 2) return true;
  const stateMatches = raw.match(US_STATE_ABBR_RE);
  if (stateMatches) {
    const distinct = new Set(stateMatches.map((s) => s.toUpperCase()));
    if (distinct.size >= 2) return true;
  }
  return false;
}

function documentClauseCoverageSparse(agreementDocumentText: string): boolean {
  const d = (agreementDocumentText || "").trim();
  if (d.length < 120) return false;
  const low = d.toLowerCase();
  const hasTerm = /\bterminat/i.test(low);
  const hasLiab = /\bliabil|indemnif/i.test(low);
  const hasDispute = /\bdispute|arbitrat|mediat|\bvenue\b/i.test(low);
  return [hasTerm, hasLiab, hasDispute].filter(Boolean).length < 2;
}

/**
 * Deterministic, UI-only comparison rows for the Full Draft upgrade preview (no AI / backend).
 */
export function getFullDraftUpgradeComparisonRows(
  draft: { parties?: unknown[] } | null | undefined,
  intakeText: string,
  partiesLine: string | null | undefined,
  agreementDocumentText: string,
): UpgradeComparisonRow[] {
  const rows: UpgradeComparisonRow[] = [];
  const raw = (intakeText || "").replace(/\s+/g, " ").trim();
  const low = raw.toLowerCase();
  const partyCount = draft?.parties?.length ?? 0;

  const multiParty =
    partyCount >= 3 ||
    partiesLineSuggestsThreePlus(partiesLine) ||
    intakeTripartyPhrases(raw) ||
    /\b(third party|party\s*c\b|party\s*iii\b|party\s*3\b)\b/i.test(low);
  if (multiParty) {
    rows.push({
      basic: "Simple party list",
      full: "Multi-party roles & structure",
    });
  }

  if (intakeMultiStateSignals(raw)) {
    rows.push({
      basic: "Single governing-law line",
      full: "Law + venue (conflict-aware)",
    });
  }

  const tailoredSignals =
    /\b(best practices|tailored(?:\s+to|\s+for|\s+clause)?)\b/i.test(low) ||
    /\b(statutory maximum)\b/i.test(low) ||
    matchesAdvancedInstrumentPhrases(raw);
  if (tailoredSignals) {
    rows.push({
      basic: "Generic protections",
      full: "Tailored clauses for your setup",
    });
  }

  if (documentClauseCoverageSparse(agreementDocumentText) && raw.length >= 40) {
    rows.push({
      basic: "Light exit / dispute detail",
      full: "Notice, exit, disputes covered",
    });
  }

  const fallbacks: UpgradeComparisonRow[] = [
    { basic: "Core terms", full: "Fuller structure" },
    { basic: "Basic protections", full: "Stronger coverage" },
    { basic: "Simple deals", full: "Tailored / higher-risk" },
  ];

  const rowKey = (r: UpgradeComparisonRow) => `${r.basic}|${r.full}`;
  const merged: UpgradeComparisonRow[] = [];
  const seen = new Set<string>();
  const pushUnique = (r: UpgradeComparisonRow) => {
    const k = rowKey(r);
    if (seen.has(k)) return;
    seen.add(k);
    merged.push(r);
  };

  pushUnique(PREMIUM_COLLABORATION_AND_SIGN_ROW);
  for (const r of rows) pushUnique(r);

  let fi = 0;
  while (merged.length < 3 && fi < fallbacks.length) {
    pushUnique(fallbacks[fi]!);
    fi++;
  }

  return merged.slice(0, 5);
}
