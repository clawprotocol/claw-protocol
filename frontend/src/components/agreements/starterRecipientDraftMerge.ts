import {
  explicitSignerNameForEntity,
  normalizeSignerMetadataForSave,
} from "../../agreement/signerMetadataNormalize";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import {
  coercePartyNameForRecipientAutoFill,
  isHighConfidencePartyNameForAutoPopulation,
  isProsePollutedPartyName,
} from "./partyNameConfidence";
import { normalizePartyNameFragment, sanitizePartiesInput } from "./partyIntakeNormalize";
import { normalizeJurisdictionDisplay } from "../../agreement/jurisdictionNormalize";
import { isInventedNoFeePayment } from "./paymentSemanticGuard";
import { orderUnnamedClientThenServiceProvider } from "./visitorHirerRoleOrder";

const PROMPT_POLLUTION_HINT =
  /\b(make|include|need|want|please|for\s+\d+\s+(?:day|days|week|weeks|month|months|year|years))\b/i;

type PartyRow = ParsedDraftShape["parties"][number] & {
  email?: string;
  signerName?: string;
  signerTitle?: string;
};

export type StarterRecipientHandoffOpts = {
  recipient1Name: string;
  recipient1Email: string;
  recipient2Name: string;
  recipient2Email: string;
  /**
   * Optional per-party reviewer emails aligned to `parsed.parties` indices (same length as parties).
   * When provided with matching length, merges all indices; slots 0–1 still honor name overrides from the legacy fields.
   */
  recipientPartyEmails?: string[];
  recipientPartySignerNames?: string[];
  recipientPartySignerTitles?: string[];
  stripRecipientEmailNoise: (s: string) => string;
  looksLikeEmail: (s: string) => boolean;
};

function cleanStarterPartyName(raw: string, slot: 0 | 1, agreementFamily?: string | null): string {
  const normalized = normalizePartyNameFragment((raw || "").trim()).slice(0, 280);
  const polluted = PROMPT_POLLUTION_HINT.test(normalized) && normalized.length > 24;
  const groundedRoleOrGivenName = /^(Client|Service Provider)$/i.test(normalized) || /^[A-Z][a-z]{2,}$/.test(normalized);
  if ((groundedRoleOrGivenName || isHighConfidencePartyNameForAutoPopulation(normalized)) && !polluted) {
    return normalized;
  }
  return coercePartyNameForRecipientAutoFill("", slot, agreementFamily);
}

function cleanRole(raw: unknown): string {
  const t = String(raw ?? "").trim().slice(0, 120);
  return t || "party";
}

function cleanStarterJurisdiction(raw: unknown): string {
  const t = String(raw ?? "").replace(/\s+/g, " ").trim();
  if (!t || t.toLowerCase() === "tbd" || t.length <= 1) return "";
  const normalized = normalizeJurisdictionDisplay(t).trim();
  if (!normalized || normalized.length <= 1) return "";
  return normalized.slice(0, 64);
}

function cleanStarterText(raw: unknown, maxLen: number): string {
  return String(raw ?? "").replace(/\s+/g, " ").trim().slice(0, maxLen);
}

export function sanitizeStarterSignerLabelsLine(raw: string): string {
  const cleaned = sanitizePartiesInput((raw || "").replace(/\s+/g, " ").trim()).slice(0, 220);
  if (!cleaned) return "";
  if (isProsePollutedPartyName(cleaned) || (PROMPT_POLLUTION_HINT.test(cleaned) && cleaned.length > 24)) return "";
  const chunks = cleaned.split(/\s*·\s*/).map((x) => x.trim()).filter(Boolean);
  if (
    chunks.length >= 1 &&
    chunks.every((x) => !isProsePollutedPartyName(x) && !(PROMPT_POLLUTION_HINT.test(x) && x.length > 24))
  ) {
    return chunks.join(" · ").slice(0, 220);
  }
  return "";
}

/**
 * Free/starter review canonicalization: normalize party rows to safe, non-prose display names.
 * This is applied before review and before send handoff to keep starter flow deterministic.
 * Preserves all parties (2+), not just first two.
 */
export function canonicalizeStarterDraftForReview(parsed: ParsedDraftShape): ParsedDraftShape {
  const base = Array.isArray(parsed.parties) ? parsed.parties : [];
  const out = base.map((p, idx) => ({
    ...p,
    name: cleanStarterPartyName(String(p?.name || ""), idx <= 1 ? (idx as 0 | 1) : 1, parsed.agreement_family ?? null),
    role: cleanRole(p?.role),
  }));
  const ordered = orderUnnamedClientThenServiceProvider({ ...parsed, parties: out });
  return {
    ...ordered,
    title: cleanStarterText(parsed.title, 180),
    purpose: cleanStarterText(parsed.purpose, 1200),
    payment_terms: isInventedNoFeePayment(parsed.payment_terms) ? "" : cleanStarterText(parsed.payment_terms, 1200),
    jurisdiction: cleanStarterJurisdiction(parsed.jurisdiction),
  };
}

/**
 * Single canonical structured snapshot for simple-product create → `/app/send/:id`:
 * merges recipient UI into `parties` (names, emails) and normalizes `parties` to a concrete array
 * before server PATCH/POST and the primed client snapshot.
 */
export function buildCanonicalSimpleProductHandoffDraft(
  parsed: ParsedDraftShape,
  opts: StarterRecipientHandoffOpts,
): ParsedDraftShape {
  const next = applyStarterRecipientUiToDraftParties(canonicalizeStarterDraftForReview(parsed), opts);
  return { ...next, parties: next.parties ?? [] };
}

/**
 * Starter/free send: merge the recipient UI fields into `draft.parties` before PATCH/POST
 * so the server and `/app/send` primed snapshot match what the user typed (names, emails).
 */
export function applyStarterRecipientUiToDraftParties(
  parsed: ParsedDraftShape,
  opts: StarterRecipientHandoffOpts,
): ParsedDraftShape {
  const {
    recipient1Name,
    recipient1Email,
    recipient2Name,
    recipient2Email,
    recipientPartyEmails,
    recipientPartySignerNames,
    recipientPartySignerTitles,
    stripRecipientEmailNoise,
    looksLikeEmail,
  } = opts;
  const n1 = (recipient1Name || "").trim();
  const n2 = (recipient2Name || "").trim();
  const e1 = looksLikeEmail(recipient1Email) ? stripRecipientEmailNoise(recipient1Email) : "";
  const e2 = looksLikeEmail(recipient2Email) ? stripRecipientEmailNoise(recipient2Email) : "";

  const base = Array.isArray(parsed.parties) ? ([...parsed.parties] as PartyRow[]) : [];
  const out: PartyRow[] = [...base];

  const fullPartyEmails =
    Array.isArray(recipientPartyEmails) && recipientPartyEmails.length === out.length ? recipientPartyEmails : null;
  const fullPartySignerNames =
    Array.isArray(recipientPartySignerNames) && recipientPartySignerNames.length === out.length
      ? recipientPartySignerNames
      : null;
  const fullPartySignerTitles =
    Array.isArray(recipientPartySignerTitles) && recipientPartySignerTitles.length === out.length
      ? recipientPartySignerTitles
      : null;

  const mergeSlot = (idx: number, name: string, email: string, signerName?: string, signerTitle?: string) => {
    const prev = out[idx];
    const cleanName = name ? cleanStarterPartyName(name, idx === 0 ? 0 : 1, parsed.agreement_family ?? null) : "";
    const entityForSigner = (cleanName || prev?.name || "").trim();
    const nextSignerName = explicitSignerNameForEntity(signerName, entityForSigner);
    const nextSignerTitle = normalizeSignerMetadataForSave(signerTitle);
    if (prev) {
      out[idx] = {
        ...prev,
        ...(cleanName ? { name: cleanName } : {}),
        ...(email ? { email, signerEmail: email } : {}),
        ...(nextSignerName ? { signerName: nextSignerName } : { signerName: undefined }),
        ...(nextSignerTitle ? { signerTitle: nextSignerTitle } : { signerTitle: undefined }),
        role: cleanRole(prev.role),
      };
      return;
    }
    if (!cleanName && !email && !nextSignerName && !nextSignerTitle) return;
    out[idx] = {
      name: cleanName || coercePartyNameForRecipientAutoFill("", idx === 0 ? 0 : 1, parsed.agreement_family ?? null),
      role: "party",
      ...(email ? { email, signerEmail: email } : {}),
      ...(nextSignerName ? { signerName: nextSignerName } : {}),
      ...(nextSignerTitle ? { signerTitle: nextSignerTitle } : {}),
    };
  };

  if (fullPartyEmails) {
    for (let i = 0; i < out.length; i++) {
      const raw = fullPartyEmails[i] ?? "";
      const email = looksLikeEmail(raw) ? stripRecipientEmailNoise(raw) : "";
      const nameOv = i === 0 ? n1 : i === 1 ? n2 : "";
      const sn = fullPartySignerNames?.[i] ?? "";
      const st = fullPartySignerTitles?.[i] ?? "";
      mergeSlot(i, nameOv, email, sn, st);
    }
  } else {
    const sn0 = fullPartySignerNames?.[0] ?? "";
    const sn1 = fullPartySignerNames?.[1] ?? "";
    const st0 = fullPartySignerTitles?.[0] ?? "";
    const st1 = fullPartySignerTitles?.[1] ?? "";
    mergeSlot(0, n1, e1, sn0, st0);
    mergeSlot(1, n2, e2, sn1, st1);
  }

  return { ...parsed, parties: out };
}
