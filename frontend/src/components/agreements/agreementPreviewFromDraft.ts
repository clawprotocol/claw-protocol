/**
 * Deterministic “full agreement” style preview from structured draft fields.
 * For user review only — not legal advice.
 */
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { FULL_DRAFT_EXPANSION_MARKER } from "./fullDraftUpgradeEnrich";
import { AGREEMENT_PREVIEW_ESIGN_NOTICE } from "./agreementPreviewConstants";
export { AGREEMENT_PREVIEW_ESIGN_NOTICE } from "./agreementPreviewConstants";
import {
  applyPremiumDeliverableWeakPhraseReplacements,
  buildPremiumDynamicCommercialSectionLines,
  stripPreviewEsignNoticeLines,
} from "./premiumDeliverableDynamicSections";
import { selectAgreementPreviewRoute } from "./agreementPreviewRoute";
import type { AgreementFamily } from "./agreementFamilyRouter";
import {
  isGenericOrEmptyTitle,
  normalizeAgreementDisplayTitle,
  resolveCanonicalAgreementTitle,
} from "./canonicalAgreementTitle";
import { PREMIUM_JURISDICTION_PLACEHOLDER } from "./premiumDraftTransform";
import { emitPremiumRenderResolveLog, resolvePremiumRenderSource } from "./premiumRenderSourceResolver";
import {
  partyNameLooksLikeRawPrompt,
  tryExtractPartyPairFromPromptBlob,
} from "./agreementPreviewPartyLine";
import {
  sanitizePartyLegalNameFromIntakeFragment,
  stripSignerInstructionClausesFromIntake,
} from "./intakeSignerInstructionParse";
import { formatLegalPartyPreamble, type PartyEntry } from "./formatLegalPartyList";
import { formatPaymentTermsLine } from "./intakeCurrencyParse";
import { normalizePaymentTermsForDisplay, normalizeStarterPaymentTermsForDisplay } from "./paymentTermsDisplay";
import {
  STARTER_GOVERNING_LAW_DISPLAY_FALLBACK,
  compressProseForStarterScope,
  compressStarterAdditionalTerms,
  compressTerminationSummaryForStarter,
  isJurisdictionDisplayLowConfidence,
  sanitizeJurisdictionForStarterGoverningLaw,
  STARTER_DEFAULT_TERMINATION_SUMMARY,
  terminationSummaryIsUnset,
} from "./starterAgreementPreviewNormalize";
import {
  sanitizeStarterPartyNameForDisplay,
  sanitizeStarterPreviewProse,
} from "./starterPreviewProseSanitize";
import { enrichStarterPreviewPartiesFromIntake } from "./starterOpeningPartyPreserve";
import { starterPreviewHasCorruptedPartyPlaceholderText } from "./starterMultiPartyProGate";
import {
  substitutePartyPlaceholdersInUserFacingText,
  textContainsUnresolvedIdentityPlaceholders,
} from "../../agreement/partyPlaceholderDisplay";
import { hydratePartyIntroductionParagraphs, hydratePartyListAndSignatureOrdinals } from "../../agreement/partyListOrdinalHydrate";
import { finalizePremiumIdentityCorpusInPreview } from "./premiumIdentityCorpusPreviewGuard";
import { finalizePartyDisplayNameForUserFacing } from "../../agreement/partyNameDisplayCasing";
import { stripCanonicalCommitMarker } from "./canonicalAgreementDocument";
import { stripDuplicateSignatureBlocksForPreview } from "./signaturePreviewArchitecture";
import {
  formatStarterPreviewForDisplay,
} from "./starterPreviewFormatting";
import { finalizeAgreementOutput } from "./agreementOutputQuality";
import { logPaidProPostFreezeMutationAttempt } from "./paidProFreezeDiagnostics";
import { applyDocumentQualityFloor } from "./documentQualityFloor";
import { extractTermDurationFromIntake, isAgreementRoleLabel, isInvalidVisibleScheduleValue, isSignerTitleLikeRole } from "./starterRoleLabelGuard";
import {
  resolveCanonicalPartyRoleLabel,
  resolveStarterTwoPartyCommercialAuthority,
} from "./canonicalPartyRoleAuthority";
import {
  formatMilestonePaymentTermsFromIntake,
  formatInstallmentPaymentTermsFromIntake,
  draftPaymentTermsLoseIntakeInstallmentCadence,
  resolveStarterPreviewIntakeText,
  repairStarterPaymentCadenceInPreviewPlain,
} from "./intakeCurrencyParse";
import { shouldApplyAiWorkflowServicesQualityFloor, applyPaidProDomainScopeGuard } from "./paidProDomainScopeGuard";
import { renderClausePrimitive, selectClausePrimitivesForIntake } from "./agreementOutputQuality/canonicalClausePrimitives";
import {
  logPlaceholderScanSkippedTransient,
  shouldSkipPlaceholderScanForTransientPreview,
} from "./agreementPreviewPlaceholderTransientGate";
import {
  finalizeUserVisibleAgreementPlainText,
  PLACEHOLDER_SAFETY_PREVIEW_BLOCKED,
  type PlaceholderSafetyContext,
} from "./agreementTemplatePlaceholderSafety";
import { repairFullAgreementPartyIdentity } from "./canonicalPartyIdentityResolver";
import {
  getAuthoritativeAgreementDocument,
  returnAuthoritativeTextForIllegalPostAcceptanceGeneration,
} from "./authoritativeAgreementDocument";
import {
  resolvePaidProAuthoritativeDisplayPlain,
  shouldUsePaidProSourceOfTruthDisplayOnly,
} from "./paidProAuthoritativeRenderGate";
import { recordPaidProPreviewRecompute } from "./paidProReviewStability";
import { tryReadPaidProFrozenPreviewPlain } from "./paidProPostAcceptancePreviewRead";
import { logLawdogOutputPathMap } from "./lawdogOutputPathMap";

const MISSING = "[Not yet specified]";

function nz(s: string | null | undefined): string {
  const t = (s || "").trim();
  return t ? t : MISSING;
}

/**
 * Display-layer title resolution for starter / generic previews.
 *
 *   1. Substantive parsed title (non-generic per canonical-title rules) → keep as-is.
 *   2. Generic / missing title + known family → `resolveCanonicalAgreementTitle`
 *      (handles explicit-intent overrides like "lease agreement" / "event production
 *      agreement" / "saas implementation agreement" and falls back to the family
 *      canonical heading when no intent phrase is present in the intake text).
 *   3. Otherwise → safe `MISSING` placeholder (preserves deterministic fallback).
 *
 * Pure presentation lookup — no parsing is performed here. The canonical resolver and
 * family routing are already populated upstream by `runIntakeDefaultsAndRoles`; this
 * function only exists to ensure the *display* layer never falls back to a bare
 * "AGREEMENT" / "DOCUMENT" / "[NOT YET SPECIFIED]" heading when a canonical heading
 * is computable from already-available metadata.
 */
function resolveStarterDisplayTitle(
  draft: ParsedDraftShape,
  options?: AgreementPreviewBuildOptions,
): string {
  const current = (draft.title || "").trim();
  const family = draft.agreement_family as AgreementFamily | undefined;
  if (current && !isGenericOrEmptyTitle(current, family)) {
    return normalizeAgreementDisplayTitle(current);
  }
  if (family) {
    const resolution = resolveCanonicalAgreementTitle({
      currentTitle: current || null,
      liveDocTitle: null,
      family,
      intakeText: options?.intakeText ?? null,
    });
    if (resolution.title) return resolution.title;
  }
  return MISSING;
}

/** Collapses repeated LawDog e-sign footers to a single trailing notice (all preview modes). */
export function collapseDuplicateEsignNoticesInFullPreview(text: string): string {
  const line = AGREEMENT_PREVIEW_ESIGN_NOTICE;
  if (!text.includes(line)) return text;
  const esc = line.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const without = text
    .replace(new RegExp(`(?:^|\\n)${esc}(?:\\n|$)`, "g"), "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd();
  return `${without}\n\n${line}\n`;
}

function omitStarterEsignFooter(text: string): string {
  return `${stripPreviewEsignNoticeLines(text).replace(/\n{3,}/g, "\n\n").trimEnd()}\n`;
}

function finalizePreviewEsignFooter(text: string, starterPreview: boolean): string {
  return starterPreview ? omitStarterEsignFooter(text) : collapseDuplicateEsignNoticesInFullPreview(text);
}

function stripManualExecutionBlockPreservePreviewNotice(text: string, starterPreview = false): string {
  const raw = (text || "").replace(/\r\n/g, "\n").trimEnd();
  const start = raw.search(/\n\s*IN WITNESS WHEREOF\b/i);
  const body = start < 0 ? raw : raw.slice(0, start).trimEnd();
  if (starterPreview) return omitStarterEsignFooter(body);
  if (start < 0) return raw;
  return collapseDuplicateEsignNoticesInFullPreview(`${body}\n\n${AGREEMENT_PREVIEW_ESIGN_NOTICE}\n`);
}

/** Remove internal expansion marker and duplicate e-sign line from free-text blocks. */
function sanitizeUserAdditionalTerms(raw: string | null | undefined, premiumDeliverable = false): string {
  let s = (raw || "").replace(/\r\n/g, "\n").trim();
  if (!s) return "";
  const markerIdx = s.indexOf(FULL_DRAFT_EXPANSION_MARKER);
  if (markerIdx >= 0) {
    s = `${s.slice(0, markerIdx).trim()}\n${s.slice(markerIdx + FULL_DRAFT_EXPANSION_MARKER.length).trim()}`.trim();
  }
  const lines = s.split("\n").filter((ln) => {
    const t = ln.trim();
    if (!t) return false;
    if (t.includes(FULL_DRAFT_EXPANSION_MARKER)) return false;
    if (t === AGREEMENT_PREVIEW_ESIGN_NOTICE) return false;
    return true;
  });
  let out = lines.join("\n").trim();
  out = stripPreviewEsignNoticeLines(out);
  if (premiumDeliverable) {
    out = applyPremiumDeliverableWeakPhraseReplacements(out);
  }
  return out;
}

/** Format ISO-like dates for display; otherwise return trimmed string. */
function formatScheduleFragment(raw: string): string {
  const t = raw.trim();
  const iso = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    const d = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    if (!Number.isNaN(d.getTime())) {
      return new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric" }).format(d);
    }
  }
  return t;
}

/**
 * Family-aware labels for the Term/Effective-Date section (P3 hardening). Purchase
 * agreements never read "Term: until 2026-08-15" — they read "Closing Date: …". Leases
 * use "Lease Term" + "Commencement Date". NDAs use "Confidentiality Term". Consulting/
 * services agreements use "Services Term". Generic fallback is the legacy "Term".
 */
function timingLabelsForFamily(
  family: string | undefined | null,
  title: string | undefined | null,
): { sectionHeading: string; durationLabel: string; effectiveLabel: string; keyDateLabel: string } {
  const fam = (family || "").toLowerCase();
  const t = (title || "").toLowerCase();
  const isPurchase =
    fam === "generic_business_agreement" &&
    (/\bpurchase\s+agreement\b/.test(t) || /\breal\s+estate\s+purchase\s+agreement\b/.test(t));
  const isLease =
    fam === "generic_business_agreement" &&
    (/\blease\s+agreement\b/.test(t) || /\bsublease\s+agreement\b/.test(t));
  const isPropertyMgmt = fam === "generic_business_agreement" && /\bproperty\s+management\s+agreement\b/.test(t);
  // Event family is detected from title alone — covers "Event Production Agreement",
  // "Commercial Event Production Agreement", "Event Services Agreement", "Event Staffing
  // Agreement", "Conference Services Agreement", "Venue Agreement", "Sponsorship
  // Agreement", "Vendor Coordination Agreement". We never coerce ordinary services /
  // employment-staffing into this branch — the title check is the authoritative signal.
  const isEvent =
    /\bevent\s+production\s+agreement\b/.test(t) ||
    /\bevent\s+services\s+agreement\b/.test(t) ||
    /\bevent\s+staffing\s+agreement\b/.test(t) ||
    /\bconference\s+services\s+agreement\b/.test(t) ||
    /\bvenue\s+agreement\b/.test(t) ||
    /\bsponsorship\s+agreement\b/.test(t) ||
    /\bvendor\s+coordination\s+agreement\b/.test(t);
  if (isPurchase) {
    return {
      sectionHeading: "Closing and Effective Date",
      durationLabel: "Closing window",
      effectiveLabel: "Effective Date",
      keyDateLabel: "Closing Date",
    };
  }
  if (isLease) {
    return {
      sectionHeading: "Lease Term and Commencement",
      durationLabel: "Lease Term",
      effectiveLabel: "Commencement Date",
      keyDateLabel: "Key Date",
    };
  }
  if (isPropertyMgmt) {
    return {
      sectionHeading: "Term and Commencement",
      durationLabel: "Management Term",
      effectiveLabel: "Commencement Date",
      keyDateLabel: "Key Date",
    };
  }
  if (isEvent) {
    return {
      sectionHeading: "Event Term and Effective Date",
      durationLabel: "Event Dates",
      effectiveLabel: "Effective Date",
      keyDateLabel: "Key Date",
    };
  }
  if (fam === "nda" || fam === "confidentiality_commercial_protections_agreement") {
    return {
      sectionHeading: "Confidentiality Term and Effective Date",
      durationLabel: "Confidentiality Term",
      effectiveLabel: "Effective Date",
      keyDateLabel: "Key Date",
    };
  }
  if (fam === "consulting_agreement" || fam === "services_agreement" || fam === "independent_contractor_agreement") {
    return {
      sectionHeading: "Services Term and Effective Date",
      durationLabel: "Services Term",
      effectiveLabel: "Effective Date",
      keyDateLabel: "Key Date",
    };
  }
  return {
    sectionHeading: "Term and Effective Date",
    durationLabel: "Term",
    effectiveLabel: "Effective Date",
    keyDateLabel: "Key date",
  };
}

function buildTermAndScheduleSection(
  draft: ParsedDraftShape,
  opts?: { starterPreview?: boolean; intakeText?: string | null },
): string {
  const labels = timingLabelsForFamily(draft.agreement_family, draft.title);
  const starter = Boolean(opts?.starterPreview);
  const partyCount = (draft.parties || []).length;
  let durationLabel = labels.durationLabel;
  const parts: string[] = [];
  const durRaw = (draft.duration || "").trim();
  let dur =
    durRaw && !isInvalidVisibleScheduleValue(durRaw)
      ? durRaw
      : starter
        ? extractTermDurationFromIntake(opts?.intakeText)
        : "";
  if (starter && dur) {
    const fromIntake = extractTermDurationFromIntake(opts?.intakeText);
    if (fromIntake && fromIntake.length > dur.length && fromIntake.includes(dur.replace(/\s+/g, " ").trim())) {
      dur = fromIntake;
    }
  }
  let eff = (draft.effective_date || "").trim();
  if (starter && isInvalidVisibleScheduleValue(eff)) eff = "";
  if (starter && partyCount === 2 && /upon full execution by all parties/i.test(eff)) {
    eff = "upon full execution by both parties";
  }
  const dueRaw = (draft.due_date || "").trim();
  const due = dueRaw && !isInvalidVisibleScheduleValue(dueRaw) ? dueRaw : "";
  if (dur) parts.push(`${durationLabel}: ${dur}`);
  if (eff) parts.push(`${labels.effectiveLabel}: ${formatScheduleFragment(eff)}`);
  if (due) parts.push(`${labels.keyDateLabel}: ${formatScheduleFragment(due)}`);
  if (!parts.length) {
    if (!starter) {
      return "The services begin on the effective date and continue until completed or terminated under this Agreement.";
    }
    return MISSING;
  }
  return parts.join("\n");
}

function looksLikePaymentOnlyScope(text: string): boolean {
  const t = (text || "").trim();
  if (!t) return false;
  return /\b(?:pay|pays|paid|payment|fee|fees|\$\s?\d|usd|dollars?)\b/i.test(t) && !/\b(?:service|services|scope|setup|implement|workflow|deliver|provide|perform)\b/i.test(t);
}

function extractServiceDescriptionFromIntake(intakeText: string | null | undefined): string {
  const intake = stripSignerInstructionClausesFromIntake(intakeText || "");
  if (!intake) return "";
  const hiringProvide = intake.match(
    /\b(?:is\s+)?hiring\s+[^.!?;]{0,140}?\s+to\s+provide\s+([^.!?;]{8,200})/i,
  );
  if (hiringProvide?.[1]) {
    const candidate = hiringProvide[1]
      .replace(/\s+for\s+(?:three|four|five|six|\d+)\s+months?\b.*$/i, "")
      .replace(/\s+services?\s*$/i, "")
      .trim();
    if (candidate.length >= 8) return candidate;
  }
  const toProvide = intake.match(/\bto\s+provide\s+([^.!?;]{8,200})/i);
  if (toProvide?.[1]) {
    const candidate = toProvide[1]
      .replace(/\s+for\s+(?:three|four|five|six|\d+)\s+months?\b.*$/i, "")
      .replace(/\s+services?\s*$/i, "")
      .trim();
    if (candidate.length >= 8 && !looksLikePaymentOnlyScope(candidate)) return candidate;
  }
  const betweenMatch = intake.match(/\bbetween\b[\s\S]{0,220}?\bfor\s+([^.!?;]+)(?:[.!?;]|$)/i);
  const candidate = (betweenMatch?.[1] || "").trim();
  if (!candidate || looksLikePaymentOnlyScope(candidate)) return "";
  return candidate.replace(/\bservices?\s*$/i, "").trim();
}

function isServicesAgreementLikeDraft(
  draft: ParsedDraftShape,
  intakeText: string | null | undefined,
): boolean {
  const family = String(draft.agreement_family || "").toLowerCase();
  if (["services_agreement", "consulting_agreement", "independent_contractor_agreement"].includes(family)) {
    return true;
  }
  const blob = [draft.title, draft.purpose, intakeText].filter(Boolean).join(" ");
  return /\b(?:services?\s+agreement|consulting|contractor|provider|will\s+provide|perform|setup|implementation|workflow)\b/i.test(blob);
}

function buildStarterServicesScopeFromIntake(
  draft: ParsedDraftShape,
  intakeText: string | null | undefined,
): string {
  if (!isServicesAgreementLikeDraft(draft, intakeText)) return "";
  const parties = draft.parties ?? [];
  const authority = resolveStarterTwoPartyCommercialAuthority(
    intakeText,
    parties.map((p) => String(p?.name ?? "")),
  );
  const client = sanitizePartyLegalNameFromIntakeFragment(
    (authority?.clientName || parties[0]?.name || "").trim(),
  );
  const provider = sanitizePartyLegalNameFromIntakeFragment(
    (authority?.providerName || parties[1]?.name || "").trim(),
  );
  const serviceDescription = extractServiceDescriptionFromIntake(intakeText);
  if (!client || !provider || !serviceDescription) return "";
  return `${provider} will provide ${serviceDescription} services for ${client}.`;
}

function isAiWorkflowServicesAgreement(
  draft: ParsedDraftShape,
  intakeText: string | null | undefined,
): boolean {
  if (!isServicesAgreementLikeDraft(draft, intakeText)) return false;
  const blob = [draft.title, draft.purpose, draft.additional_terms, intakeText].filter(Boolean).join(" ");
  return shouldApplyAiWorkflowServicesQualityFloor(blob);
}

function buildProServicesQualityFloorSections(args: {
  draft: ParsedDraftShape;
  intakeText: string | null | undefined;
  sectionNum: number;
  premiumDeliverable: boolean;
}): { lines: string[]; nextSectionNum: number } {
  if (!isAiWorkflowServicesAgreement(args.draft, args.intakeText)) {
    return { lines: [], nextSectionNum: args.sectionNum };
  }
  const parties = args.draft.parties ?? [];
  const client = finalizePartyDisplayNameForUserFacing((parties[0]?.name || "").trim(), args.intakeText ?? null) || "Client";
  const provider =
    finalizePartyDisplayNameForUserFacing((parties[1]?.name || "").trim(), args.intakeText ?? null) ||
    "Service Provider";
  const scope =
    extractServiceDescriptionFromIntake(args.intakeText) ||
    compressProseForStarterScope(args.draft.purpose) ||
    "AI workflow setup";
  let n = args.sectionNum;
  const lines = [
    premiumSectionHeading(n++, "Acceptance and Demonstration Review", args.premiumDeliverable),
    `${provider} will provide a practical demonstration or review of the configured ${scope} services. ${client} will review the delivered setup in good faith and identify any material nonconformity with the agreed scope within a reasonable review period.`,
    "",
    premiumSectionHeading(n++, "Ownership and Work Product", args.premiumDeliverable),
    `${client} owns final work product and deliverables specifically created for ${client} after payment of amounts due, except that ${provider} retains pre-existing tools, templates, know-how, background materials, and reusable processes. ${client} receives a license to use those retained materials as needed to use the delivered workflow setup.`,
    "",
    premiumSectionHeading(n++, "Confidentiality", args.premiumDeliverable),
    renderClausePrimitive("confidentiality_basic", {}),
    "",
  ];
  if (/\b(?:third[- ]party|crm|api|integration|software|platform|system|automation)\b/i.test([scope, args.intakeText].join(" "))) {
    lines.push(
      premiumSectionHeading(n++, "Support and Third-Party Dependencies", args.premiumDeliverable),
      `${provider} is responsible for commercially reasonable setup support for the agreed workflow, but is not responsible for outages, permission limits, pricing changes, or feature changes in third-party systems outside ${provider}'s control. Material integrations require access, credentials, and approvals supplied by ${client}.`,
      "",
    );
  }
  return { lines, nextSectionNum: n };
}

/**
 * Family-aware section heading for the Term/Effective-Date block. Used by the
 * starter / generic / premium routes to pick "Closing and Effective Date" vs
 * "Lease Term and Commencement" vs the legacy "Term and Effective Date" heading.
 */
function termAndScheduleSectionHeading(draft: ParsedDraftShape): string {
  return timingLabelsForFamily(draft.agreement_family, draft.title).sectionHeading;
}

/**
 * Roles are only included in the rendered preamble when role confidence is high.
 * Confidence model: a role is "high" if it's a substantive non-generic value AND
 * was either explicitly applied via party-role overlay, carried through from
 * canonical entity types ("company"/"members"), or captured directly from the
 * intake as a structural party-role (guarantor, escrow agent, trustee, etc.).
 *
 * Starter preview (P2 hardening): when a party has a high-confidence intake-captured
 * role token like "guarantor", we render it parenthetically — `Jamie Chen (Guarantor)` —
 * but never invent speculative roles. Generic / "party" roles continue to render via
 * the neutral collective Parties phrasing.
 */
const HIGH_CONFIDENCE_ROLES = new Set(["company", "members"]);
const GENERIC_ROLE = new Set(["", "party", "parties", "signer", "signatory"]);

/**
 * Roles captured directly from intake phrasing that are safe to display in starter preview
 * preambles. These are concrete, structurally meaningful roles (not generic placeholder
 * words). When set, the preamble renders e.g. `First County Escrow (Escrow Agent)`.
 */
const STARTER_DISPLAY_ROLE_TOKENS = new Set([
  "guarantor",
  "escrow agent",
  "escrow",
  "title agent",
  "trustee",
  "landlord",
  "lessor",
  "tenant",
  "lessee",
  "seller",
  "buyer",
  "purchaser",
  "co-tenant",
  "co-signer",
  "advisor",
  "investor",
  "owner",
  "manager",
  "licensor",
  "licensee",
  "witness",
  "notary",
  "notary public",
  "broker",
  "client",
  "customer",
  "service provider",
  "provider",
  "consultant",
  "contractor",
  "vendor",
]);

function partyEntryWithRoleConfidence(
  p: { name: string; role?: string },
  starterPreview: boolean,
  draft?: ParsedDraftShape,
): PartyEntry {
  const role = (p.role || "").trim().toLowerCase();
  if (starterPreview && draft && (draft.parties || []).length === 2) {
    if (isAgreementRoleLabel(p.role)) {
      return { name: p.name, role: String(p.role).trim() };
    }
    const partyIndex = (draft.parties || []).findIndex(
      (row) => String(row?.name || "").trim() === String(p.name || "").trim(),
    );
    const idx = partyIndex >= 0 ? partyIndex : 0;
    const canonical = resolveCanonicalPartyRoleLabel({
      partyIndex: idx,
      partyCount: 2,
      explicitRole: p.role,
      agreementFamily: draft.agreement_family,
      preserveIntakeRole: Boolean(role && !GENERIC_ROLE.has(role)),
    });
    return { name: p.name, role: canonical };
  }
  if (starterPreview) {
    if (role && STARTER_DISPLAY_ROLE_TOKENS.has(role)) {
      return { name: p.name, role: p.role };
    }
    if (isSignerTitleLikeRole(role)) {
      return { name: p.name, role: "party" };
    }
    return { name: p.name, role: "party" };
  }
  if (!role || GENERIC_ROLE.has(role)) {
    return { name: p.name, role: "party" };
  }
  if (HIGH_CONFIDENCE_ROLES.has(role)) {
    return { name: p.name, role: p.role };
  }
  // Non-generic, non-canonical role: keep (user-supplied via overlay or intake-captured).
  return { name: p.name, role: p.role };
}

function partiesPreambleBlock(
  draft: ParsedDraftShape,
  starterPreview: boolean = false,
  intakeText: string | null | undefined = null,
): string {
  const ps = draft.parties || [];
  const n0 = (ps[0]?.name || "").trim();
  const n1 = (ps[1]?.name || "").trim();

  const blobForExtract = [n0, n1].filter(Boolean).join(" ");
  const extracted =
    partyNameLooksLikeRawPrompt(n0) || (n1 && partyNameLooksLikeRawPrompt(n1))
      ? tryExtractPartyPairFromPromptBlob(blobForExtract || n0)
      : null;

  if (extracted) {
    return formatLegalPartyPreamble([
      { name: finalizePartyDisplayNameForUserFacing(extracted.a, intakeText), role: "party" },
      { name: finalizePartyDisplayNameForUserFacing(extracted.b, intakeText), role: "party" },
    ]);
  }

  const validParties = ps
    .filter((p) => (p.name || "").trim() && !partyNameLooksLikeRawPrompt(p.name))
    .map((p) => ({
      ...p,
      name: starterPreview ? sanitizeStarterPartyNameForDisplay(p.name) : p.name,
    }))
    .map((p) => ({
      ...p,
      name: finalizePartyDisplayNameForUserFacing(p.name, intakeText),
    }))
    .map((p) => partyEntryWithRoleConfidence(p, starterPreview, draft));
  if (validParties.length >= 2) {
    return formatLegalPartyPreamble(validParties);
  }

  return `This Agreement (\u201cAgreement\u201d) is entered into by the parties identified above (the \u201cParties\u201d).`;
}

function operatingCompanyLabel(draft: ParsedDraftShape): string {
  const c = (draft.llc_company_name || "").trim();
  if (c) return c;
  const p0 = draft.parties?.[0]?.name?.trim();
  if (p0 && /\bLLC\b/i.test(p0)) return p0;
  return nz(draft.title).replace(/^Operating Agreement\s*[—-]\s*/i, "").trim() || MISSING;
}

function premiumSectionHeading(n: number, title: string, premiumDeliverable: boolean): string {
  if (!premiumDeliverable) return `${n}. ${title}`;
  const label = title.replace(/\s*\/\s*/, " · ").toUpperCase();
  return `${n}. ${label}`;
}

/** Premium deliverable: section labels read as strong headings without markdown asterisks in the editor. */
function premiumOaBlockLabel(label: string, premiumDeliverable: boolean): string {
  return premiumDeliverable ? label.toUpperCase() : label;
}

/** Break long payment blocks into shorter paragraphs for paid review (plain-text friendly). */
function airLongPaymentTerms(pay: string, premiumDeliverable: boolean): string {
  if (!premiumDeliverable || pay.length < 160) return pay;
  return pay.replace(/(?<=\.)\s+(?=[A-Z[(])/g, "\n\n");
}

export type AgreementPreviewBuildOptions = {
  /** When true, compress scope text and soften weak inferred fields for the free/basic review shell. */
  starterPreview?: boolean;
  /** Free streamline review: build starter preview even when authoritative Pro exists. */
  freeStarterReviewPreview?: boolean;
  /**
   * Paid / full-draft path: stronger intro, extra air between major blocks, upgraded tone
   * (not used when `starterPreview` is true).
   */
  premiumDeliverablePreview?: boolean;
  /** User intake for premium structural validation (scenario keywords). */
  intakeText?: string;
  /** Tier D: persisted snapshot / emergency plain body when passed into resolver. */
  legacyPremiumSnapshotText?: string;
  /** Tier A fallback when draft lacks split server fields (e.g. completion winner). */
  premiumWinningCorpusFallback?: string;
  /** When the paid pipeline already accepted the Pro body; trust over live preview. */
  paidAuthoritativeProBody?: string | null;
  /** Transient starter review: skip fatal placeholder block until draft payload / min length. */
  placeholderGate?: Pick<
    PlaceholderSafetyContext,
    "isGenerating" | "hasDraftPayload" | "authoritativeSource" | "createFlowPhase" | "displayPhase"
  >;
};

function buildOperatingAgreementPreviewText(draft: ParsedDraftShape, options?: AgreementPreviewBuildOptions): string {
  const starterPreview = Boolean(options?.starterPreview);
  const premiumDeliverable = Boolean(options?.premiumDeliverablePreview) && !starterPreview;
  const company = operatingCompanyLabel(draft);
  const law = starterPreview ? sanitizeJurisdictionForStarterGoverningLaw(draft.jurisdiction) : nz(draft.jurisdiction);
  const purposeRaw = (draft.purpose || "").trim();
  const starterServicesScope = starterPreview ? buildStarterServicesScopeFromIntake(draft, options?.intakeText) : "";
  const purpose = starterPreview
    ? starterServicesScope || (looksLikePaymentOnlyScope(purposeRaw) ? "" : compressProseForStarterScope(purposeRaw)) || MISSING
    : nz(draft.purpose);
  const management = nz(draft.management_structure);
  const members = nz(draft.members_ownership_summary);
  const contributions = nz(draft.capital_contributions_summary);
  const distributions = nz(draft.distributions_summary);
  const transfers = nz(draft.transfer_restrictions_summary);
  const dissolution = nz(draft.dissolution_summary);
  const more = sanitizeUserAdditionalTerms(draft.additional_terms, premiumDeliverable);
  const title = resolveStarterDisplayTitle(draft, options);

  const lawLine =
    starterPreview && isJurisdictionDisplayLowConfidence((draft.jurisdiction || "").trim())
      ? `State of formation and governing law: ${STARTER_GOVERNING_LAW_DISPLAY_FALLBACK}.`
      : starterPreview
        ? `State of formation and governing law: ${law} (confirm formation and choice-of-law details with counsel).`
        : `The LLC is treated as formed or governed under ${law} for this review shell (confirm with counsel).`;

  const introOa = starterPreview
    ? "This simplified LLC starter preview highlights key fields only. It is not legal advice — confirm details with counsel before adoption."
    : premiumDeliverable
      ? "This LawDog Pro LLC operating agreement reflects your paid upgrade — structured for serious review (not the starter shell). It is not legal advice; confirm material terms with counsel before adoption."
      : "This draft LLC operating agreement preview is generated from your structured fields for review only. It is not legal advice and must be tailored before adoption.";

  const lines: string[] = [title.toUpperCase(), "", introOa, ""];
  if (premiumDeliverable) lines.push("");
  lines.push(
    premiumOaBlockLabel("ENTITY", premiumDeliverable),
    `Company: ${company}`,
    "",
    premiumOaBlockLabel("STATE OF FORMATION / GOVERNING LAW", premiumDeliverable),
    lawLine,
    "",
    premiumOaBlockLabel("PURPOSE", premiumDeliverable),
    purpose,
    "",
    premiumOaBlockLabel("MANAGEMENT", premiumDeliverable),
    management,
    "",
    premiumOaBlockLabel("MEMBERS / OWNERSHIP", premiumDeliverable),
    members,
    "",
    premiumOaBlockLabel("CAPITAL CONTRIBUTIONS", premiumDeliverable),
    contributions,
    "",
    premiumOaBlockLabel("DISTRIBUTIONS", premiumDeliverable),
    distributions,
    "",
    premiumOaBlockLabel("TRANSFER RESTRICTIONS", premiumDeliverable),
    transfers,
    "",
    premiumOaBlockLabel("DISSOLUTION", premiumDeliverable),
    dissolution,
    "",
  );
  if (more) {
    if (premiumDeliverable) lines.push("");
    lines.push(
      premiumOaBlockLabel("ADDITIONAL TERMS", premiumDeliverable),
      starterPreview ? compressStarterAdditionalTerms(more) : more,
      "",
    );
  }
  if (!starterPreview) {
    lines.push(AGREEMENT_PREVIEW_ESIGN_NOTICE, "");
  }
  const collapsed = finalizePreviewEsignFooter(lines.join("\n"), starterPreview);
  // Starter preview path also runs through the operating-agreement builder.
  return starterPreview ? sanitizeStarterPreviewProse(collapsed) : collapsed
}

/**
 * Core preview builder (no premium server/repair resolution). Used by the universal resolver for tier C.
 */
export function buildAgreementPreviewTextCore(
  draft: ParsedDraftShape,
  options?: AgreementPreviewBuildOptions,
): string {
  if (!options?.freeStarterReviewPreview && !options?.starterPreview) {
    const frozenCore = tryReadPaidProFrozenPreviewPlain({
      surface: options?.starterPreview ? "preview_starter" : "preview_structured",
      builder: "buildAgreementPreviewTextCore",
      createFlowPhase: options?.placeholderGate?.createFlowPhase ?? null,
      displayPhase: options?.placeholderGate?.displayPhase ?? null,
    });
    if (frozenCore !== null) return frozenCore;
  }
  recordPaidProPreviewRecompute("buildAgreementPreviewTextCore");
  const starterPreview = Boolean(options?.starterPreview);
  const resolvedIntakeText = starterPreview
    ? resolveStarterPreviewIntakeText(options?.intakeText)
    : String(options?.intakeText || "").trim();
  const buildOptions: AgreementPreviewBuildOptions = {
    ...options,
    intakeText: resolvedIntakeText || options?.intakeText,
  };
  const premiumDeliverable = Boolean(options?.premiumDeliverablePreview) && !starterPreview;
  const route = selectAgreementPreviewRoute(draft, options);
  if (route === "operating") {
    return finalizePreviewEsignFooter(buildOperatingAgreementPreviewText(draft, options), starterPreview);
  }

  const draftForBuild =
    starterPreview && resolvedIntakeText.length > 0
      ? enrichStarterPreviewPartiesFromIntake(draft, resolvedIntakeText)
      : draft;

  const title = resolveStarterDisplayTitle(draftForBuild, buildOptions);
  const partiesBlock = partiesPreambleBlock(draftForBuild, starterPreview, buildOptions?.intakeText);
  const purposeRaw = (draftForBuild.purpose || "").trim();
  const starterServicesScope = starterPreview
    ? buildStarterServicesScopeFromIntake(draftForBuild, buildOptions?.intakeText)
    : "";
  const purposePrepared = premiumDeliverable
    ? applyPremiumDeliverableWeakPhraseReplacements(stripPreviewEsignNoticeLines(purposeRaw))
    : purposeRaw;
  const purpose = starterPreview
    ? starterServicesScope || (looksLikePaymentOnlyScope(purposeRaw) ? "" : compressProseForStarterScope(purposeRaw)) || MISSING
    : premiumDeliverable
      ? purposePrepared || MISSING
      : nz(draftForBuild.purpose);
  const payRaw = (draftForBuild.payment_terms || "").trim();
  const payPrepared = premiumDeliverable
    ? applyPremiumDeliverableWeakPhraseReplacements(stripPreviewEsignNoticeLines(payRaw))
    : payRaw;
  const payStructuredLine = premiumDeliverable
    ? formatPaymentTermsLine(draft.payment ?? { amount: null, cadence: null, valid: true }).trim()
    : "";
  const milestonePay =
    starterPreview && buildOptions?.intakeText
      ? formatMilestonePaymentTermsFromIntake(buildOptions.intakeText)
      : null;
  const installmentPay =
    starterPreview && buildOptions?.intakeText
      ? formatInstallmentPaymentTermsFromIntake(buildOptions.intakeText)
      : null;
  const draftPaySkewedByApi =
    Boolean(installmentPay) &&
    draftPaymentTermsLoseIntakeInstallmentCadence(draftForBuild.payment_terms, buildOptions?.intakeText);
  const draftPayGrounded = (draftForBuild.payment_terms || "").trim();
  const pay = starterPreview
    ? milestonePay ||
      installmentPay ||
      (!draftPaySkewedByApi && draftPayGrounded ? normalizeStarterPaymentTermsForDisplay(draftPayGrounded) : null) ||
      (!draftPaySkewedByApi && draftPayGrounded ? draftPayGrounded : null) ||
      ""
    : premiumDeliverable
      ? payPrepared.trim() ||
        payStructuredLine ||
        normalizePaymentTermsForDisplay(draft.payment_terms).trim() ||
        MISSING
      : nz(draft.payment_terms);
  const termSection = buildTermAndScheduleSection(draftForBuild, {
    starterPreview,
    intakeText: buildOptions?.intakeText,
  });
  const lawRaw = (draftForBuild.jurisdiction || "").trim();
  const termNoticeRaw = (draft.termination_summary || "").trim();
  const termNoticePrepared = premiumDeliverable
    ? applyPremiumDeliverableWeakPhraseReplacements(stripPreviewEsignNoticeLines(termNoticeRaw))
    : termNoticeRaw;
  const termNotice = terminationSummaryIsUnset(termNoticeRaw)
    ? STARTER_DEFAULT_TERMINATION_SUMMARY
    : starterPreview
      ? compressTerminationSummaryForStarter(termNoticePrepared) || STARTER_DEFAULT_TERMINATION_SUMMARY
      : nz(termNoticePrepared);
  const more = sanitizeUserAdditionalTerms(draftForBuild.additional_terms, premiumDeliverable);

  const introGeneral = starterPreview
    ? ""
    : premiumDeliverable
      ? "This LawDog Pro agreement is organized for your review. It is not legal advice; confirm material terms before you share or sign."
      : "This draft agreement preview is generated from your structured fields for review only. It is not legal advice and may require edits before signing.";

  const introPremiumDynamic =
    "The following sections organize your terms for review. It is not legal advice; confirm material terms before you share or sign.";

  const lawBlockPremium =
    lawRaw === PREMIUM_JURISDICTION_PLACEHOLDER
      ? `${PREMIUM_JURISDICTION_PLACEHOLDER} (Governing law was not taken from category labels or vague text — pick the correct state or country before send.)`
      : `This Agreement shall be governed by the laws of ${nz(draftForBuild.jurisdiction)}, without regard to conflict-of-law principles.`;

  if (route === "premium_dynamic") {
    const sectionLines = buildPremiumDynamicCommercialSectionLines(draft, {
      buildTermSection: () => buildTermAndScheduleSection(draft, { starterPreview }),
      buildLawBlock: () => lawBlockPremium,
      premiumSectionHeading: (n, h) => premiumSectionHeading(n, h, true),
    });
    const lines: string[] = [
      title.toUpperCase(),
      "",
      introPremiumDynamic,
      "",
      "",
      partiesBlock,
      "",
      "",
      ...sectionLines,
      AGREEMENT_PREVIEW_ESIGN_NOTICE,
      "",
    ];
    return collapseDuplicateEsignNoticesInFullPreview(lines.join("\n"));
  }

  const lines: string[] = [title.toUpperCase(), ""];
  if (introGeneral.trim()) {
    lines.push(introGeneral, "");
  }
  if (premiumDeliverable) lines.push("");
  const partyCount = (draft.parties || []).length;
  const starterMultiParty =
    starterPreview && partyCount >= 4 && Boolean((options?.intakeText || "").trim());
  lines.push(
    partiesBlock,
    "",
    premiumSectionHeading(1, "Scope of Services / Purpose", premiumDeliverable),
    premiumDeliverable ? purpose.split(/\n\n+/).join("\n\n") : purpose,
    "",
    premiumSectionHeading(2, "Payment Terms", premiumDeliverable),
    airLongPaymentTerms(pay, premiumDeliverable),
    "",
    premiumSectionHeading(3, termAndScheduleSectionHeading(draft), premiumDeliverable),
    termSection,
    "",
  );
  let sectionNum = 4;
  const proServicesQualityFloor = premiumDeliverable
    ? buildProServicesQualityFloorSections({
        draft,
        intakeText: options?.intakeText,
        sectionNum,
        premiumDeliverable,
      })
    : { lines: [], nextSectionNum: sectionNum };
  if (proServicesQualityFloor.lines.length > 0) {
    lines.push(...proServicesQualityFloor.lines);
    sectionNum = proServicesQualityFloor.nextSectionNum;
  }
  if (starterMultiParty) {
    const primitiveIds = selectClausePrimitivesForIntake(options!.intakeText!, partyCount);
    if (primitiveIds.includes("confidentiality_basic")) {
      lines.push(
        premiumSectionHeading(sectionNum++, "Confidentiality", false),
        renderClausePrimitive("confidentiality_basic", { project_summary: "this project" }),
        "",
      );
    }
    if (primitiveIds.includes("data_security_basic")) {
      lines.push(
        premiumSectionHeading(sectionNum++, "Data Protection", false),
        renderClausePrimitive("data_security_basic", { project_summary: "this project" }),
        "",
      );
    }
  }
  const lawLineStarter =
    starterPreview && !lawRaw
      ? ""
      : starterPreview && isJurisdictionDisplayLowConfidence(lawRaw)
      ? `Governing law: ${STARTER_GOVERNING_LAW_DISPLAY_FALLBACK}.`
      : starterPreview
        ? `This Agreement shall be governed by the laws of ${sanitizeJurisdictionForStarterGoverningLaw(draft.jurisdiction)}, without regard to conflict-of-law principles.`
        : premiumDeliverable
          ? lawBlockPremium
          : `This Agreement shall be governed by the laws of ${nz(draft.jurisdiction)}, without regard to conflict-of-law principles.`;
  lines.push(
    premiumSectionHeading(sectionNum++, "Governing Law", premiumDeliverable),
    lawLineStarter,
    "",
    premiumSectionHeading(sectionNum++, "Termination", premiumDeliverable),
    termNotice,
    "",
  );
  if (premiumDeliverable && proServicesQualityFloor.lines.length > 0) {
    lines.push(
      premiumSectionHeading(sectionNum++, "Electronic Signatures", true),
      renderClausePrimitive("electronic_signatures", {}),
      "",
    );
  } else if (starterMultiParty) {
    lines.push(
      premiumSectionHeading(sectionNum++, "Electronic Signatures", false),
      renderClausePrimitive("electronic_signatures", {}),
      "",
    );
  }
  if (more) {
    if (premiumDeliverable) lines.push("");
    lines.push(
      premiumSectionHeading(sectionNum++, "Additional Terms", premiumDeliverable),
      starterPreview ? compressStarterAdditionalTerms(more) : more,
      "",
    );
  }
  if (!starterPreview) {
    lines.push(AGREEMENT_PREVIEW_ESIGN_NOTICE, "");
  }
  let collapsed = finalizePreviewEsignFooter(lines.join("\n"), starterPreview);
  if (starterPreview) {
    collapsed = sanitizeStarterPreviewProse(collapsed);
    collapsed = formatStarterPreviewForDisplay(collapsed);
    collapsed = omitStarterEsignFooter(collapsed);
  }
  return collapsed;
}

/**
 * Deterministic hydration for the final user-visible full-document preview (Pro resolver output,
 * snapshot handoff, read-only corpus). Uses ordered `draft.parties` names when present.
 */
export function hydrateIdentityPlaceholdersInAgreementPreviewPlain(
  text: string,
  draft: ParsedDraftShape,
  intakeText?: string | null,
): string {
  const t = (text || "").trim();
  if (!t) return t;
  const auth = (draft.parties || [])
    .map((p) =>
      finalizePartyDisplayNameForUserFacing(
        String(p.name || "").replace(/\s+/g, " ").trim(),
        intakeText ?? null,
      ),
    )
    .filter((n) => n.length > 0);
  const ctx = [
    String(intakeText ?? "").trim(),
    draft.title || "",
    draft.purpose || "",
    draft.payment_terms || "",
    ...auth,
  ].join("\n");
  let out = hydratePartyListAndSignatureOrdinals(t, auth);
  out = hydratePartyIntroductionParagraphs(out, auth);
  out = substitutePartyPlaceholdersInUserFacingText(out, ctx, auth.length ? auth : null);
  out = hydratePartyIntroductionParagraphs(out, auth);
  out = hydratePartyListAndSignatureOrdinals(out, auth);
  if (textContainsUnresolvedIdentityPlaceholders(out)) {
    out = substitutePartyPlaceholdersInUserFacingText(out, ctx, auth.length ? auth : null);
    out = hydratePartyIntroductionParagraphs(out, auth);
    out = hydratePartyListAndSignatureOrdinals(out, auth);
  }
  return finalizePremiumIdentityCorpusInPreview(out, auth, ctx);
}

function applyAgreementPreviewPlaceholderGate(
  text: string,
  draft: ParsedDraftShape,
  options: AgreementPreviewBuildOptions | undefined,
  surface: string,
): string {
  const freeStarterReviewPreview = Boolean(options?.freeStarterReviewPreview);
  if (shouldUsePaidProSourceOfTruthDisplayOnly() && !freeStarterReviewPreview) {
    logPaidProPostFreezeMutationAttempt({
      caller: "applyAgreementPreviewPlaceholderGate",
      blocked: true,
      surface,
    });
    return text;
  }
  const tier = surface.includes("starter") ? "starter" : "premium";
  let working = text;
  if (tier === "starter") {
    working = formatStarterPreviewForDisplay(working);
  }
  const quality = finalizeAgreementOutput(working, {
    intakeRaw: options?.intakeText ?? null,
    partyNames: (draft.parties || []).map((p) => p.name),
    agreementFamily: draft.agreement_family ?? null,
    surface,
    tier,
  });
  let display = tier === "starter" ? formatStarterPreviewForDisplay(quality.text) : quality.text;
  const placeholderCtx: PlaceholderSafetyContext = {
    intakeRaw: options?.intakeText ?? null,
    partyNames: (draft.parties || []).map((p) => p.name),
    agreementFamily: draft.agreement_family ?? null,
    surface,
    isGenerating: options?.placeholderGate?.isGenerating,
    hasDraftPayload: options?.placeholderGate?.hasDraftPayload,
    authoritativeSource: options?.placeholderGate?.authoritativeSource ?? null,
    createFlowPhase: options?.placeholderGate?.createFlowPhase,
    displayPhase: options?.placeholderGate?.displayPhase,
  };
  const transientSkip = shouldSkipPlaceholderScanForTransientPreview({
    text: display,
    surface,
    len: display.trim().length,
    isGenerating: placeholderCtx.isGenerating,
    hasDraftPayload: placeholderCtx.hasDraftPayload,
    authoritativeSource: placeholderCtx.authoritativeSource,
    createFlowPhase: placeholderCtx.createFlowPhase,
    displayPhase: placeholderCtx.displayPhase,
  });
  if (transientSkip) {
    logPlaceholderScanSkippedTransient({
      surface,
      len: display.trim().length,
      isGenerating: placeholderCtx.isGenerating,
      hasDraftPayload: placeholderCtx.hasDraftPayload,
      authoritativeSource: placeholderCtx.authoritativeSource ?? null,
    });
    if (tier === "starter") {
      const formatted = formatStarterPreviewForDisplay(display);
      return applyDocumentQualityFloor(formatted).text;
    }
    return display;
  }
  const repairedIdentity = repairFullAgreementPartyIdentity({
    text: display,
    intakeRaw: options?.intakeText ?? null,
    partyNames: (draft.parties || []).map((p) => p.name),
    roleLabels: (draft.parties || []).map((p) => p.role || ""),
  });
  display = repairedIdentity.text;
  const gate = finalizeUserVisibleAgreementPlainText(display, placeholderCtx);
  if (!gate.ok) return PLACEHOLDER_SAFETY_PREVIEW_BLOCKED;
  const signatureStripped =
    surface === "preview_structured" || surface === "preview_starter"
      ? stripManualExecutionBlockPreservePreviewNotice(gate.text, surface === "preview_starter")
      : gate.text;
  if (tier === "starter") {
    const formatted = formatStarterPreviewForDisplay(omitStarterEsignFooter(signatureStripped));
    return applyDocumentQualityFloor(formatted).text;
  }
  return signatureStripped;
}

/** Production review UI entry for free/starter tier — always paragraph-preserving. */
export function buildStarterAgreementPreviewForReview(
  draft: ParsedDraftShape,
  options?: AgreementPreviewBuildOptions,
): string {
  // Free/starter review entry — never return paid frozen SoT corpus.
  // intake through (e.g. restore=starterReview after refresh, where draft.parties may carry the
  // short parse form "Red Mesa"), fall back to the persisted creator intake so short party names
  // are expanded back to "Red Mesa Logistics LLC" instead of rendering a truncated preamble.
  const intakeText = resolveStarterPreviewIntakeText(options?.intakeText);
  const draftForBuild =
    intakeText.length > 0 ? enrichStarterPreviewPartiesFromIntake(draft, intakeText) : draft;
  return buildAgreementPreviewText(
    { ...draftForBuild },
    {
      ...options,
      intakeText,
      starterPreview: true,
      premiumDeliverablePreview: false,
      freeStarterReviewPreview: true,
    },
  );
}

function repairStarterCommercialReadinessDisplay(
  text: string,
  draft: ParsedDraftShape,
  options?: AgreementPreviewBuildOptions,
): string {
  let out = (text || "").trim();
  const intake = resolveStarterPreviewIntakeText(options?.intakeText);
  out = repairStarterPaymentCadenceInPreviewPlain(out, intake);
  out = out.replace(
    /This Agreement\s*\((["“])Agreement(["”])\)\s+is\s+This Agreement is between/gi,
    "This Agreement ($1Agreement$2) is between",
  );
  if (isServicesAgreementLikeDraft(draft, options?.intakeText)) {
    out = out.replace(
      /\[Not yet specified\]/gi,
      "The services begin on the effective date and continue until completed or terminated under this Agreement.",
    );
  }
  return out;
}

/**
 * Human-readable draft agreement text (fixed section order, stable formatting).
 * Premium path uses {@link resolvePremiumRenderSource} (single source of truth).
 */
export function buildAgreementPreviewText(
  draft: ParsedDraftShape,
  options?: AgreementPreviewBuildOptions,
): string {
  const starterPreview = Boolean(options?.starterPreview);
  const freeStarterReviewPreview = Boolean(options?.freeStarterReviewPreview);
  if (!freeStarterReviewPreview) {
    const frozenRead = tryReadPaidProFrozenPreviewPlain({
      surface: starterPreview ? "preview_starter" : "preview_paid_authoritative",
      builder: "buildAgreementPreviewText",
      createFlowPhase: options?.placeholderGate?.createFlowPhase ?? null,
      displayPhase: options?.placeholderGate?.displayPhase ?? null,
    });
    if (frozenRead !== null) return frozenRead;
  }
  if (shouldUsePaidProSourceOfTruthDisplayOnly() && !freeStarterReviewPreview) {
    return resolvePaidProAuthoritativeDisplayPlain();
  }
  const authoritative = getAuthoritativeAgreementDocument();
  if (authoritative?.fullCorpusText && !starterPreview) {
    return authoritative.fullCorpusText;
  }
  // Free starter review must never short-circuit to paid authoritative corpus — only paid Pro display paths may.
  if (
    authoritative?.fullCorpusText &&
    starterPreview &&
    !freeStarterReviewPreview &&
    shouldUsePaidProSourceOfTruthDisplayOnly()
  ) {
    return authoritative.fullCorpusText;
  }
  const premiumDeliverable = Boolean(options?.premiumDeliverablePreview) && !starterPreview;
  const draftForBuild =
    starterPreview && (options?.intakeText || "").trim().length > 0
      ? enrichStarterPreviewPartiesFromIntake(draft, options?.intakeText)
      : draft;
  if (premiumDeliverable) {
    const res = resolvePremiumRenderSource({
      draft: draftForBuild,
      intakeText: options?.intakeText,
      legacySnapshotText: options?.legacyPremiumSnapshotText,
      premiumWinningCorpusFallback: options?.premiumWinningCorpusFallback,
      paidAuthoritativeProBody: options?.paidAuthoritativeProBody,
      buildLivePreview: () =>
        buildAgreementPreviewTextCore(draft, { ...options, starterPreview: false, premiumDeliverablePreview: true }),
    });
    if (import.meta.env.DEV) emitPremiumRenderResolveLog(res);
    let collapsed = collapseDuplicateEsignNoticesInFullPreview(stripCanonicalCommitMarker(res.text));
    collapsed = stripDuplicateSignatureBlocksForPreview(collapsed).text;
    collapsed = collapseDuplicateEsignNoticesInFullPreview(`${collapsed}\n\n${AGREEMENT_PREVIEW_ESIGN_NOTICE}\n`);
    const hydrated = hydrateIdentityPlaceholdersInAgreementPreviewPlain(collapsed, draftForBuild, options?.intakeText ?? null);
    let display = applyAgreementPreviewPlaceholderGate(hydrated, draftForBuild, options, "preview_premium_deliverable");
    if (!display.includes(AGREEMENT_PREVIEW_ESIGN_NOTICE)) {
      display = collapseDuplicateEsignNoticesInFullPreview(`${display}\n\n${AGREEMENT_PREVIEW_ESIGN_NOTICE}\n`);
    }
    display = applyPaidProDomainScopeGuard(display, options?.intakeText, {
      logSurface: "preview_premium_deliverable",
    });
    return returnAuthoritativeTextForIllegalPostAcceptanceGeneration({
      surface: "preview_premium_deliverable",
      builder: "buildAgreementPreviewText",
      generatedText: display,
    });
  }
  const core = buildAgreementPreviewTextCore(draftForBuild, options);
  if (starterPreview) {
    const gated = applyAgreementPreviewPlaceholderGate(core, draftForBuild, options, "preview_starter");
    let display = repairStarterCommercialReadinessDisplay(gated, draftForBuild, options);
    if (starterPreviewHasCorruptedPartyPlaceholderText(display)) {
      if (import.meta.env.MODE !== "test") {
        // eslint-disable-next-line no-console
        console.warn("[starter-preview-corruption-blocked]", {
          surface: "preview_starter",
          sample: display.slice(0, 240),
        });
      }
      display =
        "This agreement needs LawDog Pro for multi-party structure. Use Build Pro to continue with the full agreement workflow.";
    }
    logLawdogOutputPathMap({
      stage: "free_preview",
      source: "starter_preview",
      text: display,
      canMutateBody: true,
      canRejectBody: true,
      canFallback: false,
      reason: "free_starter_review_display",
    });
    return returnAuthoritativeTextForIllegalPostAcceptanceGeneration({
      surface: "preview_starter",
      builder: "buildAgreementPreviewText",
      generatedText: display,
      allowBeforeAcceptance: freeStarterReviewPreview,
    });
  }
  if (textContainsUnresolvedIdentityPlaceholders(core)) {
    const hydrated = hydrateIdentityPlaceholdersInAgreementPreviewPlain(core, draftForBuild, options?.intakeText ?? null);
    const display = applyAgreementPreviewPlaceholderGate(hydrated, draftForBuild, options, "preview_structured_hydrated");
    return returnAuthoritativeTextForIllegalPostAcceptanceGeneration({
      surface: "preview_structured_hydrated",
      builder: "buildAgreementPreviewText",
      generatedText: display,
    });
  }
  const display = applyAgreementPreviewPlaceholderGate(core, draftForBuild, options, "preview_structured");
  return returnAuthoritativeTextForIllegalPostAcceptanceGeneration({
    surface: "preview_structured",
    builder: "buildAgreementPreviewText",
    generatedText: display,
  });
}
