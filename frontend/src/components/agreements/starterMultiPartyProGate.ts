/**
 * Free Starter supports simple 1–2 party drafts only.
 * Multi-party labeled intakes, coordinator-only roles, or multi-entity revenue share
 * must not produce a corrupted free agreement — gate to Pro instead.
 */
import { runIntakeDefaultsAndRoles } from "./intakeFamilyShell";
import { defaultIntakePartyRoleLabels } from "./partyRoleIntake";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { labeledPartyLegalEntities } from "./labeledPartyBlockParse";

const COORDINATOR_BLOCK_HEADER_RE = /^\s*coordinator\s*[:\-]?\s*$/i;
const PARTY_BLOCK_HEADER_RE = /^\s*party\s*(\d+)\s*[:\-]?\s*$/i;

export type StarterMultiPartyProGateReason =
  | "labeled_parties_exceed_two"
  | "coordinator_with_multiple_parties"
  | "revenue_share_across_three_plus_entities";

export type StarterMultiPartyProGateAssessment = {
  required: boolean;
  reasons: StarterMultiPartyProGateReason[];
  parties: string[];
  coordinatorName: string | null;
  keyTerms: string[];
};

const EMPTY_PAYMENT = { amount: null as number | null, cadence: null as string | null, valid: false };

/** Parse coordinator name from a labeled Coordinator block (not a signing party). */
export function parseCoordinatorNameFromIntake(raw: string): string | null {
  const text = String(raw || "").replace(/\r\n/g, "\n");
  const lines = text.split("\n");
  let inCoordinator = false;
  let name = "";
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (COORDINATOR_BLOCK_HEADER_RE.test(line)) {
      inCoordinator = true;
      continue;
    }
    if (PARTY_BLOCK_HEADER_RE.test(line)) {
      if (inCoordinator) break;
      inCoordinator = false;
      continue;
    }
    if (inCoordinator) {
      const nameMatch = line.match(/^\s*name\s*[:\-]\s*(.+)$/i);
      if (nameMatch?.[1]) {
        name = nameMatch[1].replace(/\s+/g, " ").trim();
      }
    }
  }
  return name.length >= 2 ? name : null;
}

export function intakeHasCoordinatorBlock(raw: string): boolean {
  const lines = String(raw || "").replace(/\r\n/g, "\n").split("\n");
  return lines.some((line) => COORDINATOR_BLOCK_HEADER_RE.test(line.trim()));
}

/** True when revenue-share language assigns percentages across 3+ named entities. */
export function hasRevenueShareAcrossThreePlusNamedEntities(raw: string, partyNames: string[]): boolean {
  if (!/\brevenue\s*(?:share|sharing|split)\b/i.test(raw)) return false;
  const revenueSlice =
    raw.match(/\brevenue\s*(?:share|sharing|split)\b[\s\S]{0,800}/i)?.[0] ?? raw;
  const pctHits = revenueSlice.match(/\d+(?:\.\d+)?\s*%/g) ?? [];
  if (pctHits.length >= 3) return true;

  const low = raw.toLowerCase();
  let namedWithShare = 0;
  for (const party of partyNames) {
    const tokens = party
      .replace(/\s+(?:LLC|L\.L\.C\.|Inc\.?|Corp\.?|LP|Ltd\.?)\.?$/i, "")
      .trim()
      .toLowerCase();
    if (tokens.length < 4) continue;
    if (low.includes(party.toLowerCase()) || low.includes(tokens)) {
      namedWithShare += 1;
    }
  }
  return namedWithShare >= 3 && pctHits.length >= 1;
}

function extractKeyTermsSummary(raw: string): string[] {
  const terms: string[] = [];
  const text = String(raw || "");

  const termLine =
    text.match(/\bterm\s*[:\-]\s*([^\n.]{4,80})/i)?.[1] ??
    text.match(/\b(?:twenty|thirty|forty|fifty|\d+)[^\n.]{0,40}months?\b/i)?.[0];
  if (termLine) {
    const cleaned = termLine.replace(/\s+/g, " ").trim().replace(/\.$/, "");
    if (cleaned) terms.push(cleaned.toLowerCase().includes("month") ? cleaned : `${cleaned} term`);
  }

  const law =
    text.match(/\b(?:governing law|jurisdiction)\s*[:\-]\s*([^\n.]{3,40})/i)?.[1] ??
    text.match(/\b([A-Za-z][A-Za-z\s]{2,24})\s+law\s+governs\b/i)?.[1];
  if (law) {
    const lawLabel = law.replace(/\s+/g, " ").trim().replace(/\.$/, "");
    terms.push(lawLabel.toLowerCase().includes("law") ? lawLabel : `${lawLabel} law`);
  }

  if (
    /\$[\d,]+/i.test(text) &&
    /\b(?:payment|fee|milestone|monthly|implementation|analytics)\b/i.test(text)
  ) {
    terms.push("provider fees");
  }

  if (/\brevenue\s*(?:share|sharing|split)\b/i.test(text)) {
    terms.push("third-party licensing revenue share");
  }

  return [...new Set(terms.map((t) => t.trim()).filter(Boolean))].slice(0, 6);
}

export function assessStarterMultiPartyProRequirement(raw: string): StarterMultiPartyProGateAssessment {
  const intake = String(raw || "").trim();
  const parties = labeledPartyLegalEntities(intake);
  const reasons: StarterMultiPartyProGateReason[] = [];

  if (parties.length > 2) {
    reasons.push("labeled_parties_exceed_two");
  }
  if (intakeHasCoordinatorBlock(intake) && parties.length >= 2) {
    reasons.push("coordinator_with_multiple_parties");
  }
  if (hasRevenueShareAcrossThreePlusNamedEntities(intake, parties)) {
    reasons.push("revenue_share_across_three_plus_entities");
  }

  return {
    required: reasons.length > 0,
    reasons,
    parties,
    coordinatorName: parseCoordinatorNameFromIntake(intake),
    keyTerms: extractKeyTermsSummary(intake),
  };
}

/** Minimal labeled-party draft for Pro checkout — never run free parseDraft on gated intakes. */
export function buildStarterProCheckoutPendingDraft(rawIntake: string): ParsedDraftShape {
  return runIntakeDefaultsAndRoles(
    {
      title: "",
      jurisdiction: "",
      parties: [],
      purpose: "",
      payment_terms: "",
      duration: null,
      due_date: null,
      effective_date: null,
      payment: EMPTY_PAYMENT,
    },
    rawIntake.trim(),
    true,
    defaultIntakePartyRoleLabels(),
  );
}

/** Party lines for the gate summary UI. */
export function formatStarterMultiPartyGatePartyLines(parties: string[]): string[] {
  return parties.map((name, i) => `${i + 1}. ${name}`);
}
