/**
 * Pre-freeze executive-grade drafting polish — governing law, notice headings, transaction titles.
 * Does not mutate frozen SoT after acceptance; runs only during acceptance prep / pre-freeze normalization.
 */

import type { ParsedDraftShape } from "./intakeSmartDefaults";
import {
  intakeDescribesBrandLicensingDistributionManufacturingStack,
  resolveAgreementTitleFromIntakeScope,
} from "./paidProAgreementTitleScope";
import { resolveAuthoritativeWitnessIndex } from "./paidProExecutionBlockNormalization";
import {
  findNoticesSectionStart,
  removeRedundantNoticesSubheading,
  resolveOperativeNoticesFamilyEnd,
} from "./paidProPartyNoticeDetails";
import {
  buildQuadPartyNoticeStanzas,
  resolveBrandLicensingPartyOrderFromProseIntake,
} from "./deterministicQuadPartyProFallback";
import {
  PREMIUM_JURISDICTION_PLACEHOLDER,
  isCorruptGoverningLawClauseText,
  resolveFinalGoverningLaw,
} from "./premiumDraftTransform";

const WEAK_GOVERNING_LAW_PRIMARY_RE =
  /This Agreement shall be governed by the laws of the jurisdiction mutually agreed by the parties in writing/i;

const WEAK_VENUE_RE =
  /shall be brought exclusively in a court of competent jurisdiction mutually agreed by the parties in writing or, if not agreed, in a court of competent jurisdiction where the defendant party is located/i;

const PAID_PRO_STANDALONE_TITLE_LINE_RE =
  /^(?:MUTUAL\s+)?[A-Z][A-Z\s&]{4,120}AGREEMENT\s*$/i;

const GENERIC_DOCUMENT_TITLES = new Set(["SERVICES AGREEMENT", "MUTUAL SERVICES AGREEMENT"]);

function formatGoverningLawClause(jurisdiction: string): string {
  const j = jurisdiction.trim();
  if (/^state of\s+/i.test(j)) {
    const state = j.replace(/^state of\s+/i, "").trim();
    return `This Agreement shall be governed by the laws of the State of ${state}, without regard to conflict-of-law principles.`;
  }
  return `This Agreement shall be governed by the laws of ${j}, without regard to conflict-of-law principles.`;
}

function formatVenueClause(jurisdiction: string, roleFallback = "Brand Owner"): string {
  const loc = jurisdiction.replace(/^state of\s+/i, "").trim();
  return `Any legal action or proceeding arising out of or relating to this Agreement shall be brought exclusively in a court of competent jurisdiction located in ${loc} (or the principal place of business of ${roleFallback} if no exclusive forum is designated in the operative notice addresses).`;
}

function resolveBrandOwnerRoleLabel(
  intakeText: string,
  draft?: ParsedDraftShape | null,
): string {
  const fromDraft = (draft?.parties ?? []).find((p) =>
    /\bbrand\s+owner\b/i.test(String(p?.role ?? "")),
  );
  if (fromDraft?.role?.trim()) return fromDraft.role.trim();
  if (/\bbrand\s+owner\b/i.test(intakeText)) return "Brand Owner";
  return "Brand Owner";
}

function extractCanonicalTitleUpper(opening: string): string | null {
  const match = opening.match(
    /\b((?:MUTUAL\s+)?(?:MANUFACTURING,\s+DISTRIBUTION,\s+LICENSING\s+AND\s+MARKETING\s+SERVICES|CONSULTING\s+(?:AND\s+IMPLEMENTATION\s+|SERVICES\s+)?|SERVICES\s+)?(?:CONSULTING\s+AND\s+IMPLEMENTATION\s+|CONSULTING\s+SERVICES\s+|BUSINESS\s+CONSULTING\s+|SOFTWARE\s+DEVELOPMENT\s+SERVICES\s+)?AGREEMENT)\b/i,
  );
  return match?.[1]?.replace(/\s+/g, " ").trim().toUpperCase() ?? null;
}

/** Replace open-ended "mutually agreed later" governing law and venue when intake supplies jurisdiction. */
export function repairWeakGoverningLawAndVenueClauses(
  text: string,
  intakeText: string,
  draft?: ParsedDraftShape | null,
): { text: string; repairs: string[] } {
  const body = (text || "").replace(/\r\n/g, "\n");
  if (!WEAK_GOVERNING_LAW_PRIMARY_RE.test(body) && !WEAK_VENUE_RE.test(body)) {
    return { text: body, repairs: [] };
  }

  const jurisdiction = resolveFinalGoverningLaw(
    intakeText,
    draft ?? {
      title: "",
      jurisdiction: "",
      purpose: "",
      payment_terms: "",
      parties: [],
      duration: "",
      due_date: null,
      effective_date: null,
      payment: { amount: 0, cadence: "", valid: false },
    },
    "",
  );
  if (!jurisdiction || jurisdiction === PREMIUM_JURISDICTION_PLACEHOLDER) {
    return { text: body, repairs: [] };
  }

  const repairs: string[] = [];
  let out = body;
  const govClause = formatGoverningLawClause(jurisdiction);
  const venueClause = formatVenueClause(jurisdiction, resolveBrandOwnerRoleLabel(intakeText, draft));

  const weakGovBlockRe =
    /This Agreement shall be governed by the laws of the jurisdiction mutually agreed by the parties in writing\.?\s*(?:If the parties do not separately agree[^.\n]*\.)?/gi;
  if (weakGovBlockRe.test(out)) {
    out = out.replace(weakGovBlockRe, govClause);
    repairs.push("governing_law:repair_weak_mutual_agreement_primary");
  }

  out = out.replace(
    /(^\s*\d+\.\d+\s+Governing Law[^\n]*\n+)([\s\S]*?)(?=^\s*\d+\.\d+\s+|\nIN WITNESS)/im,
    (match, heading, bodyPart) => {
      if (!WEAK_GOVERNING_LAW_PRIMARY_RE.test(bodyPart)) return match;
      repairs.push("governing_law:repair_weak_subsection");
      return `${heading}${govClause}\n`;
    },
  );

  if (WEAK_VENUE_RE.test(out)) {
    out = out.replace(WEAK_VENUE_RE, venueClause);
    repairs.push("venue:repair_weak_mutual_agreement");
  }

  return { text: out, repairs: [...new Set(repairs)] };
}

/** Replace generic SERVICES AGREEMENT title when intake scope is transaction-specific. */
export function reconcilePaidProDocumentTitleWithIntakeScope(
  text: string,
  intakeText: string,
): { text: string; repairs: string[] } {
  const scoped = resolveAgreementTitleFromIntakeScope(intakeText);
  if (scoped.source === "generic-services") return { text, repairs: [] };

  const body = (text || "").replace(/\r\n/g, "\n");
  const witnessIdx = resolveAuthoritativeWitnessIndex(body);
  const opening = witnessIdx >= 0 ? body.slice(0, witnessIdx) : body;
  const tail = witnessIdx >= 0 ? body.slice(witnessIdx) : "";
  const sec1Idx = opening.search(/^\s*1\.\s+(?!\d)/m);
  const head = sec1Idx >= 0 ? opening.slice(0, sec1Idx) : opening.slice(0, 2_500);
  const remainder = sec1Idx >= 0 ? opening.slice(sec1Idx) : "";

  const currentTitle = extractCanonicalTitleUpper(head) ?? "";
  if (currentTitle === scoped.titleUpper) return { text, repairs: [] };
  const replaceableWeakTitle =
    GENERIC_DOCUMENT_TITLES.has(currentTitle) ||
    currentTitle === "DISTRIBUTION AGREEMENT" ||
    currentTitle === "LICENSE AGREEMENT";
  if (currentTitle && !replaceableWeakTitle) return { text, repairs: [] };

  const targetTitle = scoped.titleUpper;
  const recitalPhrase = scoped.recitalPhrase;
  const lines = head.split("\n");
  let titleLineIdx = lines.findIndex((l) => PAID_PRO_STANDALONE_TITLE_LINE_RE.test(l.trim()));

  if (titleLineIdx < 0) {
    const glued = head.match(/^(SERVICES AGREEMENT|MUTUAL SERVICES AGREEMENT)\s+(This\b)/i);
    if (!glued) return { text, repairs: [] };
    const newHead = head.replace(
      /^(?:MUTUAL\s+)?SERVICES\s+AGREEMENT/i,
      targetTitle,
    );
    const rebuilt = `${newHead.trimEnd()}\n\n${remainder.trimStart()}`.replace(/\n{3,}/g, "\n\n").trimEnd();
    return {
      text: `${rebuilt}${tail ? `\n\n${tail.trimStart()}` : ""}`.replace(/\n{3,}/g, "\n\n").trimEnd(),
      repairs: ["title:reconcile_intake_scope"],
    };
  }

  lines[titleLineIdx] = targetTitle;
  for (let i = titleLineIdx + 1; i < lines.length; i += 1) {
    const trimmed = lines[i]?.trim() ?? "";
    if (/^This\s+/i.test(trimmed)) {
      lines[i] = trimmed.replace(
        /This\s+(?:Mutual\s+)?[A-Za-z][\s\S]{0,220}?Agreement/i,
        `This ${recitalPhrase}`,
      );
      break;
    }
  }

  const newHead = lines.join("\n");
  const rebuilt = `${newHead.trimEnd()}\n\n${remainder.trimStart()}`.replace(/\n{3,}/g, "\n\n").trimEnd();
  return {
    text: `${rebuilt}${tail ? `\n\n${tail.trimStart()}` : ""}`.replace(/\n{3,}/g, "\n\n").trimEnd(),
    repairs: ["title:reconcile_intake_scope"],
  };
}

/** Detect notice/governing-law boundary defects that must block brand-licensing recovery freeze. */
export function hasBrandLicensingNoticeOrGoverningLawCorruption(text: string): boolean {
  const body = (text || "").replace(/\r\n/g, "\n");
  if (!body.trim()) return false;
  return (
    /:zon\s+Wholesale/i.test(body) ||
    /\bLLC\s+Group\s+Attention/i.test(body) ||
    /Address:[^\n]*\bGOVERNING LAW\b/i.test(body) ||
    /the\s+the\s*["']Parties["']\)\.\s*GOVERNING LAW/i.test(body) ||
    /If to[^\n:]+:[a-z]{1,4}\s+[A-Za-z][^\n:]{4,80}?\s*:[a-z]{1,4}/i.test(body)
  );
}

function resolveBrandLicensingRecoveryParties(
  intakeText: string,
  draft?: ParsedDraftShape | null,
): string[] {
  const fromProse = resolveBrandLicensingPartyOrderFromProseIntake(intakeText);
  if (fromProse.length >= 4) return fromProse.slice(0, 4);
  const fromDraft = (draft?.parties ?? [])
    .map((p) => String(p?.name ?? "").trim())
    .filter((n) => n.length >= 4);
  if (fromDraft.length >= 4) return fromDraft.slice(0, 4);
  return [];
}

function rebuildBrandLicensingNoticesAndGoverningLawSection(
  text: string,
  parties: readonly string[],
  intakeText: string,
  draft?: ParsedDraftShape | null,
): { text: string; repairs: string[] } {
  if (parties.length < 4) return { text, repairs: [] };
  const body = (text || "").replace(/\r\n/g, "\n");
  const noticesIdx = findNoticesSectionStart(body);
  if (noticesIdx < 0) return { text: body, repairs: [] };

  const witnessIdx = resolveAuthoritativeWitnessIndex(body);
  const noticesEnd = witnessIdx >= 0 ? witnessIdx : body.length;
  const noticesFamilyEnd = resolveOperativeNoticesFamilyEnd(body, noticesIdx);
  const before = body.slice(0, noticesIdx);
  const afterNoticesFamily = body.slice(noticesFamilyEnd, noticesEnd);
  const tail = body.slice(noticesEnd);

  const jurisdiction = resolveFinalGoverningLaw(
    intakeText,
    draft ?? {
      title: "",
      jurisdiction: "",
      purpose: "",
      payment_terms: "",
      parties: [],
      duration: "",
      due_date: null,
      effective_date: null,
      payment: { amount: 0, cadence: "", valid: false },
    },
    (draft?.jurisdiction || "").trim() || "Oklahoma",
  );
  const governingClause = /\boklahoma\b/i.test(jurisdiction)
    ? "This Agreement is governed by the laws of the State of Oklahoma, without regard to conflict-of-law principles."
    : `This Agreement is governed by the laws of ${jurisdiction}, without regard to conflict-of-law principles.`;

  const noticeStanzas = buildQuadPartyNoticeStanzas(parties);
  const rebuilt = [
    "11. NOTICES",
    "Notices under this Agreement must be in writing and delivered by email, nationally recognized courier, personal delivery, or certified or registered mail to the applicable notice address below.",
    "",
    ...noticeStanzas.flatMap((stanza) => ["", stanza]),
    "",
    "12. GOVERNING LAW",
    governingClause,
  ].join("\n");

  const miscMatch = afterNoticesFamily.match(/^\s*(\d+)\.\s+MISCELLANEOUS/i);
  const miscBlock = miscMatch
    ? afterNoticesFamily.replace(/^\s*\d+\.\s+MISCELLANEOUS/i, "13. MISCELLANEOUS")
    : afterNoticesFamily.trim()
      ? `13. MISCELLANEOUS AND ELECTRONIC SIGNATURES\n\n${afterNoticesFamily.trim()}`
      : "13. MISCELLANEOUS AND ELECTRONIC SIGNATURES\nThis Agreement may be executed in counterparts using electronic signatures permitted by applicable law.";

  const merged = `${before.trimEnd()}\n\n${rebuilt}\n\n${miscBlock.trim()}\n\n${tail.trimStart()}`
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd();

  return { text: merged, repairs: ["notice:rebuild_brand_licensing_operative_region"] };
}

/** Strip notice/governing-law fusion defects that must never freeze. */
export function repairCorruptedNoticeAndGoverningLawText(text: string): { text: string; repairs: string[] } {
  const repairs: string[] = [];
  let out = (text || "").replace(/\r\n/g, "\n");
  const entityGroup = out.replace(/\b(LLC|L\.L\.C\.|Inc\.?|Corp\.?|Ltd\.?)\s+Group\b/gi, "$1");
  if (entityGroup !== out) {
    out = entityGroup;
    repairs.push("notice:remove_duplicated_entity_group_suffix");
  }
  const fusedAddress = out.replace(/(Address:[^\n]*?)\s*K\.\s+GOVERNING LAW/gi, "$1");
  if (fusedAddress !== out) {
    out = fusedAddress;
    repairs.push("notice:defuse_governing_law_heading_fusion");
  }
  const fusedPartiesAddress = out.replace(
    /Address:\s*primary business address on file with the\s+the\s*["']Parties["']\)\.\s*GOVERNING LAW/gi,
    "Address: primary business address on file with the Party",
  );
  if (fusedPartiesAddress !== out) {
    out = fusedPartiesAddress;
    repairs.push("notice:defuse_parties_governing_law_fusion");
  }
  const truncatedHorizon = out.replace(
    /If to Horizon Wholesale Group LLC:[a-z]{1,4}\s+Wholesale Group\s*:[a-z]{1,4}\s+Wholesale Group\s*:/gi,
    "If to Horizon Wholesale Group LLC:\nHorizon Wholesale Group LLC",
  );
  if (truncatedHorizon !== out) {
    out = truncatedHorizon;
    repairs.push("notice:repair_truncated_horizon_header");
  }
  if (isCorruptGoverningLawClauseText(out)) {
    const corruptRe =
      /This Agreement is governed by the laws of[^.\n]*(?:assignment|independent contractors|amendment|severability|counterparts|electronic signatures|entire agreem)[^.\n]*\.?/gi;
    if (corruptRe.test(out)) {
      out = out.replace(
        corruptRe,
        "This Agreement shall be governed by the laws of the State of Oklahoma, without regard to conflict-of-law principles.",
      );
      repairs.push("governing_law:repair_corrupt_bullet_fragment");
    }
  }
  return { text: out, repairs };
}

export function applyPaidProExecutiveDraftPolish(
  text: string,
  intakeText: string,
  draft?: ParsedDraftShape | null,
): { text: string; repairs: string[] } {
  const repairs: string[] = [];
  let out = (text || "").replace(/\r\n/g, "\n");

  const titleRepair = reconcilePaidProDocumentTitleWithIntakeScope(out, intakeText);
  if (titleRepair.repairs.length > 0) {
    out = titleRepair.text;
    repairs.push(...titleRepair.repairs);
  }

  const noticesHeading = removeRedundantNoticesSubheading(out);
  if (noticesHeading.repairs.length > 0) {
    out = noticesHeading.text;
    repairs.push(...noticesHeading.repairs);
  }

  const governingLaw = repairWeakGoverningLawAndVenueClauses(out, intakeText, draft);
  if (governingLaw.repairs.length > 0) {
    out = governingLaw.text;
    repairs.push(...governingLaw.repairs);
  }

  const corruption = repairCorruptedNoticeAndGoverningLawText(out);
  if (corruption.repairs.length > 0) {
    out = corruption.text;
    repairs.push(...corruption.repairs);
  }

  if (
    intakeDescribesBrandLicensingDistributionManufacturingStack(intakeText) &&
    hasBrandLicensingNoticeOrGoverningLawCorruption(out)
  ) {
    const parties = resolveBrandLicensingRecoveryParties(intakeText, draft);
    if (parties.length >= 4) {
      const rebuilt = rebuildBrandLicensingNoticesAndGoverningLawSection(out, parties, intakeText, draft);
      out = rebuilt.text;
      repairs.push(...rebuilt.repairs);
    }
  }

  return { text: out.trimEnd(), repairs: [...new Set(repairs)] };
}
