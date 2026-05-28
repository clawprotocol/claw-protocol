/**
 * Final display-layer polish for paid Pro agreement text (review, copy, signing handoff).
 * Runs after canonicalization so numbering, openings, and boilerplate stay professional.
 */

import type { ParsedDraftShape } from "./intakeSmartDefaults";
import {
  repairCanonicalPartyIdentityInCorpus,
  repairDuplicateAgreementOpening,
  resolveCanonicalPartyIdentitiesFromIntake,
  stripIrrelevantFixedFeeBoilerplate,
  intakeSpecifiesSimpleFixedFee,
} from "./canonicalPartyIdentityResolver";
import { normalizeProAgreementSectionContinuity } from "./normalizeProAgreementSectionContinuity";
import { appendProExecutionBlockIfMissing } from "./proExecutionBlockAppend";
import {
  getAcceptedPremiumDisplayText,
  isAcceptedPremiumCanonicalEstablished,
} from "./acceptedPremiumCanonicalCorpus";
import {
  coalesceAuthoritativePremiumBody,
  wouldMateriallyShrinkAuthoritativeBody,
} from "./premiumAuthoritativeBodyPreservation";

export type PolishProAgreementDisplayLayerOpts = {
  draft?: ParsedDraftShape | null;
  intakeText?: string | null;
};

export type PolishProAgreementDisplayLayerResult = {
  text: string;
  repairs: string[];
};

function trim(s: string | null | undefined): string {
  return (s || "").trim();
}

function basicNormalize(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function canonicalPartyNamesFromDraft(draft: ParsedDraftShape | null | undefined): string[] {
  return (draft?.parties ?? [])
    .map((p) => String(p?.name ?? "").trim())
    .filter((name) => name.length >= 2)
    .slice(0, 2);
}

/** Remove duplicate confidentiality paragraphs (normalized content match). */
export function dedupeConfidentialityParagraphs(text: string): { text: string; repairs: string[] } {
  const repairs: string[] = [];
  const witnessIdx = text.search(/\bIN WITNESS WHEREOF\b/i);
  const head = witnessIdx >= 0 ? text.slice(0, witnessIdx) : text;
  const tail = witnessIdx >= 0 ? text.slice(witnessIdx) : "";
  const parts = head.split(/\n\n+/);
  const seen = new Set<string>();
  const kept: string[] = [];
  for (const part of parts) {
    const t = part.trim();
    if (!t) continue;
    const isConf = /\bconfidential/i.test(t) && t.length >= 80;
    if (!isConf) {
      kept.push(t);
      continue;
    }
    const key = t
      .toLowerCase()
      .replace(/^\d+(?:\.\d+)?\s+/, "")
      .replace(/\s+/g, " ")
      .replace(/[^\w\s$.,]/g, "")
      .slice(0, 220);
    if (seen.has(key)) {
      repairs.push("display:dedupe_confidentiality_paragraph");
      continue;
    }
    seen.add(key);
    kept.push(t);
  }
  const merged = kept.join("\n\n").trim();
  return { text: tail ? `${merged}\n\n${tail.trim()}` : merged, repairs };
}

/** Strip monthly-arrears / contractor invoice lines that survive section passes. */
export function stripFixedFeeDisplayBoilerplateLines(
  text: string,
  intakeRaw: string | null | undefined,
): { text: string; repairs: string[] } {
  if (!intakeSpecifiesSimpleFixedFee(intakeRaw, text)) return { text, repairs: [] };
  const repairs: string[] = [];
  const lineRes = [
    /\bContractor\s+will\s+invoice\s+Company\s+monthly\s+in\s+arrears\b/i,
    /\b(?:will\s+)?invoice\s+Company\s+monthly\s+in\s+arrears\b/i,
    /\binvoice\s+.*\bmonthly\s+in\s+arrears\b/i,
    /\bmonthly\s+in\s+arrears\b/i,
    /\bfees?\s+(?:and\s+)?rates?\s+(?:are|is)\s+to\s+be\s+documented\b/i,
  ];
  const kept = text.split("\n").filter((line) => {
    const t = line.trim();
    if (!t) return true;
    for (const re of lineRes) {
      if (re.test(t)) {
        repairs.push("display:strip_fixed_fee_boilerplate_line");
        return false;
      }
    }
    return true;
  });
  return { text: kept.join("\n").replace(/\n{3,}/g, "\n\n").trim(), repairs };
}

/** Remove generic party/address placeholders that were not supplied by the intake. */
export function stripUnsuppliedPartyAddressPlaceholders(
  text: string,
  intakeRaw: string | null | undefined,
): { text: string; repairs: string[] } {
  const intake = String(intakeRaw || "");
  const allowAddress = /\b(address|notice\s+address|mailing\s+address|principal\s+office)\b/i.test(intake);
  const repairs: string[] = [];
  const lineRes = [
    /\b(?:corporation|limited liability company|company)\s+organized\s+under\s+the\s+laws\s+of\s+\[?[A-Za-z\s]*\]?/i,
    /\b(?:principal\s+office|mailing\s+address|notice\s+address)\s*(?:is|:)?\s*(?:\[.*?\]|to\s+be\s+provided|not\s+supplied|________________)/i,
    /\b(?:at|located\s+at)\s+\[?(?:address|principal office|mailing address)\]?/i,
    /\b\[?(?:corporation|entity type|address|principal office|mailing address)\]?\b/i,
  ];
  const kept = text.split("\n").filter((line) => {
    const t = line.trim();
    if (!t) return true;
    if (allowAddress && !/\[.*?\]|to\s+be\s+provided|________________/i.test(t)) return true;
    for (const re of lineRes) {
      if (re.test(t)) {
        repairs.push("display:strip_unsupplied_party_placeholder");
        return false;
      }
    }
    return true;
  });
  return { text: kept.join("\n").replace(/\n{3,}/g, "\n\n").trim(), repairs };
}

/**
 * Polish authoritative Pro text for display, copy, and signing without material shrink.
 */
export function polishProAgreementDisplayLayer(
  raw: string,
  opts?: PolishProAgreementDisplayLayerOpts,
): PolishProAgreementDisplayLayerResult {
  const input = trim(raw);
  if (!input) return { text: "", repairs: [] };
  const repairs: string[] = [];
  let out = basicNormalize(input);

  const partyNames = canonicalPartyNamesFromDraft(opts?.draft);
  const records = resolveCanonicalPartyIdentitiesFromIntake(opts?.intakeText ?? null, partyNames);

  const opening = repairDuplicateAgreementOpening(out, records);
  out = opening.text;
  repairs.push(...opening.repairs);

  if (records.length >= 2) {
    const party = repairCanonicalPartyIdentityInCorpus(out, records, {
      intakeRaw: opts?.intakeText ?? null,
      partyNames,
    });
    out = party.text;
    repairs.push(...party.repairs);
  }

  const opening2 = repairDuplicateAgreementOpening(out, records);
  out = opening2.text;
  repairs.push(...opening2.repairs);

  const placeholders = stripUnsuppliedPartyAddressPlaceholders(out, opts?.intakeText ?? null);
  out = placeholders.text;
  repairs.push(...placeholders.repairs);

  if (intakeSpecifiesSimpleFixedFee(opts?.intakeText, out)) {
    out = stripIrrelevantFixedFeeBoilerplate(out, opts?.intakeText ?? null).text;
    const lines = stripFixedFeeDisplayBoilerplateLines(out, opts?.intakeText ?? null);
    out = lines.text;
    repairs.push(...lines.repairs);
  }

  const conf = dedupeConfidentialityParagraphs(out);
  out = conf.text;
  repairs.push(...conf.repairs);

  const sections = normalizeProAgreementSectionContinuity(out);
  out = sections.text;
  repairs.push(...sections.repairs);

  if (records.length >= 2) {
    out = appendProExecutionBlockIfMissing(out, records).text;
  }

  if (wouldMateriallyShrinkAuthoritativeBody(input.length, out.length)) {
    const coalesced = coalesceAuthoritativePremiumBody({
      preservedBody: input,
      candidateBody: out,
      preservedSource: "accepted_server_full_draft",
      candidateSource: "display_layer_polish",
    });
    return { text: coalesced.text, repairs: [...repairs, ...(coalesced.downgradePrevented ? ["display:shrink_blocked"] : [])] };
  }

  return { text: out, repairs: [...new Set(repairs)] };
}

/** Plain text for copy/export — must match accepted canonical display when established. */
export function polishedAuthoritativeProPlainForCopy(
  candidates: readonly (string | null | undefined)[],
  opts?: PolishProAgreementDisplayLayerOpts & {
    acceptedAuthoritativeBody?: string | null;
    minLen?: number;
  },
): string {
  if (isAcceptedPremiumCanonicalEstablished()) {
    return getAcceptedPremiumDisplayText();
  }
  const minLen = opts?.minLen ?? 1_500;
  const accepted = trim(opts?.acceptedAuthoritativeBody);
  if (accepted.length >= 500) return accepted;
  let best = "";
  for (const c of candidates) {
    const t = trim(c);
    if (t.length > best.length) best = t;
  }
  const polished = polishProAgreementDisplayLayer(best, opts);
  return polished.text.length >= minLen ? polished.text : polished.text.length > best.length ? polished.text : best;
}
