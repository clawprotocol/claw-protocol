import { detectAgreementFamily, type AgreementFamily } from "./agreementFamilyRouter";
import { formatPaymentTermsLine, type IntakePaymentField } from "./intakeCurrencyParse";
import { buildLiveDraftPreview } from "./liveDraftHeuristics";
import { parseIntakeToStructuredAgreement } from "./intakeStructuredAgreementModel";
import { tryInferNamedPartiesFromIntake } from "./intakeNamedPartyFallback";
import { extractBetweenPartyNameList, extractBetweenPartyPair } from "./partyBetweenParse";
import { isAuthoritativeLegalEntityName } from "./paidProPartyNamePreserve";
import { repairDraftPartiesFromIntakeAuthority } from "./partySlotIdentityNormalize";
import { stripSignerInstructionClausesFromIntake } from "./intakeSignerInstructionParse";
import { resolveCanonicalAgreementTitle } from "./canonicalAgreementTitle";
import { isPaymentSemanticallySafe } from "./paymentSemanticGuard";
import {
  mergeSignerMetadataIntoDraftParties,
  resolveUniversalSignerMetadataBySlot,
} from "./universalSignerMetadataAuthority";

function roleHintForPartyName(name: string, hints: Record<string, string>): string {
  const key = name.toLowerCase().trim();
  if (hints[key]) return hints[key];
  for (const [hintKey, role] of Object.entries(hints)) {
    const hk = hintKey.toLowerCase().trim();
    if (key.includes(hk) || hk.includes(key)) return role;
  }
  return "party";
}

export type { AgreementFamily } from "./agreementFamilyRouter";

/** Parsed draft shape from /api/agreements/parse (subset used for create). */
export type ParsedDraftShape = {
  title: string;
  jurisdiction: string;
  parties: { id?: string; name: string; role: string; email?: string }[];
  purpose: string;
  payment_terms: string;
  duration: string | null;
  due_date: string | null;
  effective_date: string | null;
  /** Client-side payment hints; omitted from POST /api/agreements/draft body. */
  payment: IntakePaymentField;
  /** Client-side: normalized termination language; omitted from POST /api/agreements/draft body. */
  termination_summary?: string | null;
  /** Client-side: supplemental clauses text; omitted from POST /api/agreements/draft body. */
  additional_terms?: string | null;
  /** Local routing for defaults + preview; omitted from POST /api/agreements/draft body. */
  agreement_family?: AgreementFamily;
  /**
   * One-shot LawDog Pro full document from POST /api/agreements/premium-full-draft.
   * When set and passes quality bar, this is the premium readonly body (not stitched preview only).
   * Omitted from POST /draft.
   */
  premium_full_document_text?: string | null;
  /** First-pass premium full draft (POST /premium-full-draft primary output). */
  premium_server_full_document_text?: string | null;
  /** Which premium body field drives readonly/review render (client-only). */
  premium_render_source?: string | null;
  /** Quality-gate repair pass output when primary failed structural checks (server). */
  premium_server_repair_document_text?: string | null;
  /** Audit labels from the full-draft model. Omitted from POST /draft. */
  premium_full_draft_key_terms?: string[] | null;
  premium_full_draft_missing_info?: string[] | null;
  /** Client-only: review surface mode. */
  review_mode?: "source_comparison" | "generated_agreement_review" | null;
  /** Client-only: uploaded source document plain text for deterministic compare. */
  uploaded_source_document_text?: string | null;
  /** Premium parse extract: grounded bullets; merged into additional_terms for review. Omitted from POST /draft. */
  material_asks?: string[];
  /** Operating-agreement shell: company display name when known. */
  llc_company_name?: string | null;
  management_structure?: string | null;
  members_ownership_summary?: string | null;
  capital_contributions_summary?: string | null;
  distributions_summary?: string | null;
  transfer_restrictions_summary?: string | null;
  dissolution_summary?: string | null;
  /** Creator/admin is coordinating only — not a legal party or signer (client-side). */
  creator_coordinator_only?: boolean;
};

const MAX_PARTY_NAME_LEN = 280;

function splitPartiesFromLiveLine(line: string | null): { name: string; role: string }[] | null {
  if (!line) return null;
  let t = line
    .replace(/^\[You\]\s+and\s+/i, "")
    .replace(/^Party detected:\s*/i, "")
    .replace(/\s*\(\?\)\s*$/i, "")
    .trim();
  // Strip a leading intake-prose prefix ending in "between"/"among" (e.g.
  // "Create a consulting agreement between …") so the first party name is not polluted with the
  // descriptive lead-in. Without this, splitting on " and " promotes
  // "Create a consulting agreement between Red Mesa Logistics LLC" as the legal entity.
  const betweenMatch = t.match(/^.*?\b(?:between|among)\s+(?:the\s+following\s+[^:]*:\s*)?(.+)$/i);
  if (betweenMatch?.[1]?.trim()) {
    t = betweenMatch[1].trim();
  }
  const parts = t.split(/\s*;\s*/).map((s) => s.trim()).filter(Boolean);
  if (parts.length >= 2) {
    return parts.map((name) => ({ name: name.slice(0, MAX_PARTY_NAME_LEN), role: "party" }));
  }
  const comma = t.split(/\s*,\s*/).map((s) => s.trim()).filter(Boolean);
  if (comma.length >= 3) {
    return comma.map((name) => ({ name: name.slice(0, MAX_PARTY_NAME_LEN), role: "party" }));
  }
  const segments = t.split(/\s+and\s+/i).filter(Boolean);
  if (segments.length >= 2) {
    const b = segments[segments.length - 1].trim();
    const a = segments.slice(0, -1).join(" and ").trim();
    if (a.length > 0 && b.length > 0) {
      return [
        { name: a.slice(0, MAX_PARTY_NAME_LEN), role: "party" },
        { name: b.slice(0, MAX_PARTY_NAME_LEN), role: "party" },
      ];
    }
  }
  return null;
}

/**
 * Fills common gaps for the simple product path so users skip multi-step follow-ups
 * when the model is thin but intake text has enough signal.
 */
export function applySimpleFlowSmartDefaults(parsed: ParsedDraftShape, intakeText: string): ParsedDraftShape {
  const live = buildLiveDraftPreview(intakeText);
  const structured = parseIntakeToStructuredAgreement(intakeText);
  const payment = live.payment;
  let next: ParsedDraftShape = { ...parsed, payment };

  {
    const family = (next.agreement_family ?? detectAgreementFamily(intakeText)) as AgreementFamily;
    const resolved = resolveCanonicalAgreementTitle({
      currentTitle: next.title,
      liveDocTitle: live.docTitle,
      family,
      intakeText,
    });
    next.title = resolved.title;
  }

  const j = (next.jurisdiction || "").trim().toLowerCase();
  if (!j || j === "tbd") {
    const gl = structured.governing_law.trim();
    next.jurisdiction = gl || "Delaware";
  }

  const betweenLegalEntities = extractBetweenPartyNameList(
    stripSignerInstructionClausesFromIntake(intakeText),
  );
  const authoritativeBetween = betweenLegalEntities.filter(isAuthoritativeLegalEntityName);
  const partySeed =
    authoritativeBetween.length >= 2 ? authoritativeBetween : betweenLegalEntities;
  if (partySeed.length >= 2) {
    next.parties = partySeed.slice(0, 12).map((name) => {
      const roleHint = roleHintForPartyName(name, structured.partyRoleHints);
      return {
        name: name.slice(0, MAX_PARTY_NAME_LEN),
        role: roleHint,
      };
    });
  } else if ((next.parties || []).length < 2) {
    const explicitSigners = tryInferNamedPartiesFromIntake(intakeText);
    if (explicitSigners && explicitSigners.length >= 2) {
      next.parties = explicitSigners;
    } else if (!structured.partiesUncertain && structured.parties.length >= 2) {
      // Honor the multi-party output of the structured extractor (Parties: A, B, C, D).
      // Apply per-name role hints (P2): "Jamie Chen as guarantor" → role "guarantor",
      // canonical name stays "Jamie Chen".
      next.parties = structured.parties.map((name) => {
        const roleHint = roleHintForPartyName(name, structured.partyRoleHints);
        return {
          name: name.slice(0, MAX_PARTY_NAME_LEN),
          role: roleHint,
        };
      });
    } else {
      const fromBetween = extractBetweenPartyPair(intakeText);
      const fromLive =
        fromBetween && fromBetween.left.trim().length > 1 && fromBetween.right.trim().length > 1
          ? [
              { name: fromBetween.left.trim().slice(0, MAX_PARTY_NAME_LEN), role: "party" as const },
              { name: fromBetween.right.trim().slice(0, MAX_PARTY_NAME_LEN), role: "party" as const },
            ]
          : splitPartiesFromLiveLine(live.partiesLine);
      if (fromLive) {
        next.parties = fromLive;
      } else {
        next.parties = [
          { name: "Party A", role: "party" },
          { name: "Party B", role: "party" },
        ];
      }
    }
  }

  if (!(next.purpose || "").trim()) {
    const structuredScope = structured.scope.trim();
    const scopeOnly = (live.scopeLine || "").trim();
    next.purpose = structuredScope || scopeOnly || "Scope and deliverables to be agreed between the parties.";
  }

  if (!(next.payment_terms || "").trim()) {
    const fromStructured = formatPaymentTermsLine(payment, intakeText);
    const structuredPayment = structured.payment.trim();
    /**
     * Semantic suppression: never let confidentiality / NDA tokens leak into Payment Terms
     * via the live compensation heuristic. If structured + live are both empty/contaminated,
     * fall through to a neutral no-payment line (public-facing copy only — no "in review").
     */
    const safeStructuredPayment = isPaymentSemanticallySafe(structuredPayment) ? structuredPayment : "";
    const liveComp = (live.compensationLine || "").trim();
    const safeLiveComp = isPaymentSemanticallySafe(liveComp) ? liveComp : "";
    const fromCurrencyParse =
      (fromStructured && payment.valid) || (fromStructured && payment.amount != null)
        ? fromStructured
        : "";
    next.payment_terms =
      safeStructuredPayment ||
      fromCurrencyParse ||
      safeLiveComp ||
      "No fees unless the parties document compensation in a separate writing or amendment.";
  }

  if (!(next.duration || "").trim() && !(next.due_date || "").trim()) {
    const structuredTerm = structured.term.trim();
    next.duration =
      structuredTerm || live.termLine ||
      live.scheduleLine ||
      "12 months unless terminated earlier as agreed in writing.";
  }

  if (!(next.effective_date || "").trim()) {
    next.effective_date = "Upon full execution by all parties";
  }

  if (!(next.termination_summary || "").trim()) {
    const structuredTermination = structured.termination.trim();
    if (structuredTermination) {
      next.termination_summary = structuredTermination;
    }
  }

  if ((next.parties || []).length >= 2) {
    const repaired = repairDraftPartiesFromIntakeAuthority(next.parties ?? [], intakeText);
    if (repaired.length >= 2) {
      next = {
        ...next,
        parties: repaired.map((p) => ({
          name: p.name.slice(0, MAX_PARTY_NAME_LEN),
          role: p.role || "party",
          ...(p.email ? { email: p.email } : {}),
        })),
      };
    }
    const legalEntities = (next.parties || [])
      .map((p) => String(p.name || "").trim())
      .filter((n) => n.length >= 2);
    const resolved = resolveUniversalSignerMetadataBySlot({ legalEntities, intakeText });
    next = mergeSignerMetadataIntoDraftParties(next, resolved) as ParsedDraftShape;
  }

  return next;
}
