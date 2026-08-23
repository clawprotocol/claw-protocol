/**
 * Draft review policy (frontend only):
 * - **Advisory structural gaps** — title/jurisdiction/dates/etc. from parse (`AgreementBuilderIntake` `missing`):
 *   soft guidance only; never block upgrade/checkout or draft review surfaces.
 * - **Execution-oriented placeholders** — party names / generic title signals / unresolved
 *   identity tokens in the user-visible full document (`getDraftFirstReviewBlocker`):
 *   used for premium send-mode defaults and for recipient-handoff gates; final send validation stays on the server.
 */
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { hydrateIdentityPlaceholdersInAgreementPreviewPlain } from "./agreementPreviewFromDraft";
import {
  getSafeFallbackPartyLabels,
  isHighConfidencePartyNameForAutoPopulation,
  isProsePollutedPartyName,
} from "./partyNameConfidence";
import {
  collapseDraftPartyRows,
  repairDraftPartiesFromIntakeAuthority,
} from "./partySlotIdentityNormalize";
import { readPremiumPartyNamesHandoff } from "./premiumPartyNamesHandoff";
import { resolveSignerSetupPartyIdentity } from "./signerSetupPartyIdentity";
import {
  stripInternalPartyRefFragments,
  textContainsUnresolvedIdentityPlaceholders,
} from "../../agreement/partyPlaceholderDisplay";
import { sanitizePartiesInput, splitTwoPartiesFromJoinedLine, type StructuredTwoParties } from "./partyIntakeNormalize";

const PLACEHOLDER_PARTY_NAME_RE =
  /\bparty\s*a\b|\bparty\s*b\b|edit\s+in\s+review|placeholder|to\s+be\s+(?:listed|finalized|added)|\(name\s+in\s+review\)/i;

/**
 * Trailing prepositions left after stripping identity tokens like [ORG_1].
 * "Jordan Lee of [ORG_1]" → "Jordan Lee of" → "Jordan Lee"
 */
const TRAILING_ORG_PREPOSITION_RE = /\s+(?:of|at|for|from|on\s+behalf\s+of|representing|as\s+representative\s+of)\s*$/i;

/**
 * Extract party names from common agreement opening patterns like:
 * - "This Agreement is entered into by and between [Party 1] and [Party 2]"
 * - "between [Party 1], and [Party 2]"
 * Returns null if no match or if extracted names look like placeholders.
 *
 * When validating party names, strips leftover identity tokens like [ORG_1] so
 * "Jordan Lee of [ORG_1]" is recognized as the real name "Jordan Lee" for
 * confidence checks. The returned names have tokens stripped.
 */
export function extractRealPartyNamesFromPreview(preview: string): { party1: string; party2: string } | null {
  if (!preview || preview.length < 50) return null;
  const firstChunk = preview.slice(0, 800);
  const betweenAndPattern = /\b(?:entered\s+into\s+)?(?:by\s+and\s+)?between\s+([^,\n]+?)\s+and\s+([^.,\n]+)/i;
  const match = firstChunk.match(betweenAndPattern);
  if (!match) return null;
  const p1Raw = sanitizePartiesInput((match[1] || "").trim());
  const p2Raw = sanitizePartiesInput((match[2] || "").trim());
  if (!p1Raw || !p2Raw || p1Raw.length < 2 || p2Raw.length < 2) return null;
  if (PLACEHOLDER_PARTY_NAME_RE.test(p1Raw) || PLACEHOLDER_PARTY_NAME_RE.test(p2Raw)) return null;
  const p1Stripped = stripInternalPartyRefFragments(p1Raw).replace(TRAILING_ORG_PREPOSITION_RE, "").trim();
  const p2Stripped = stripInternalPartyRefFragments(p2Raw).replace(TRAILING_ORG_PREPOSITION_RE, "").trim();
  if (!p1Stripped || !p2Stripped || p1Stripped.length < 2 || p2Stripped.length < 2) return null;
  if (!isHighConfidencePartyNameForAutoPopulation(p1Stripped) || !isHighConfidencePartyNameForAutoPopulation(p2Stripped)) {
    return null;
  }
  return { party1: p1Stripped, party2: p2Stripped };
}

/**
 * True when party names look like placeholders in draft.parties BUT the rendered preview
 * already contains real, high-confidence party names. This handles the case where names
 * appear in the document body (e.g. "Priya Shah and Diego Alvarez") but draft.parties
 * still has generic placeholders.
 */
export function partyNamesResolvedViaRenderedPreview(
  draft: ParsedDraftShape | null | undefined,
  renderedPreview: string | null | undefined,
): boolean {
  if (!draft || !draftHasPlaceholderParties(draft)) return false;
  const extracted = extractRealPartyNamesFromPreview(renderedPreview || "");
  return extracted !== null;
}

/** After sanitization, the joined parties line parses as two substantive non-placeholder names. */
export function hasRealPartiesJoinedLine(joins: string): boolean {
  const s = sanitizePartiesInput(joins);
  if (s.length <= 3) return false;
  if (PLACEHOLDER_PARTY_NAME_RE.test(s)) return false;
  const comma = s
    .split(/\s*,\s*/)
    .map((x) => x.trim())
    .filter(Boolean);
  if (comma.length >= 2) return comma[0].length > 1 && comma[1].length > 1;
  const and = s
    .split(/\s+and\s+/i)
    .map((x) => x.trim())
    .filter(Boolean);
  return and.length >= 2 && and[0].length > 1 && and[1].length > 1;
}

/** True when party names look like generic placeholders (block Continue to send). */
export function draftHasPlaceholderParties(draft: ParsedDraftShape | null | undefined): boolean {
  const ps = draft?.parties;
  if (!Array.isArray(ps) || ps.length < 2) return true;
  const cleaned = ps.slice(0, 2).map((p) => sanitizePartiesInput((p.name || "").trim()));
  if (cleaned.some((n) => !n || n.length < 2)) return true;
  if (cleaned.some((n) => PLACEHOLDER_PARTY_NAME_RE.test(n))) return true;
  if (
    !isHighConfidencePartyNameForAutoPopulation(cleaned[0]) ||
    !isHighConfidencePartyNameForAutoPopulation(cleaned[1])
  ) {
    return true;
  }
  return !hasRealPartiesJoinedLine(cleaned.join(", "));
}

/**
 * BASIC/simple-create: structured `draft.parties` can lag after the user fixes names on the live preview
 * (inline parties row) until the next parse. When the preview line already splits into two non-placeholder
 * names, treat party placeholders as resolved for progress gating only.
 */
export function draftPartyPlaceholdersOkViaLivePreview(
  draft: ParsedDraftShape | null | undefined,
  partiesLine: string | null | undefined,
  partiesStructured: StructuredTwoParties | null | undefined,
): boolean {
  if (!draft) return false;
  if (!draftHasPlaceholderParties(draft)) return false;
  const s = partiesStructured ?? splitTwoPartiesFromJoinedLine((partiesLine ?? "").trim());
  if (!s) return false;
  const n1 = s.party_1.trim();
  const n2 = s.party_2.trim();
  if (!isHighConfidencePartyNameForAutoPopulation(n1) || !isHighConfidencePartyNameForAutoPopulation(n2)) {
    return false;
  }
  const synthetic: ParsedDraftShape = {
    ...draft,
    parties: [
      { name: n1, role: draft.parties?.[0]?.role || "party" },
      { name: n2, role: draft.parties?.[1]?.role || "party" },
    ],
  };
  return !draftHasPlaceholderParties(synthetic);
}

/**
 * Known fixture / demo legal entities from older LawDog templates. Safe to replace when intake
 * or the accepted corpus carries the user's real party names (Alpha/Beacon/Cedar, etc.).
 */
const DISPOSABLE_DEMO_PARTY_LEGAL_NAME_RE =
  /^(?:abc\s+llc|sample\s+corp(?:oration)?|sample\s+co\.?|acme\s+test\s+co\.?|lawdog\s+demo\s+llc)$/i;

/** True when stored recipient name is an auto/template seed (safe to replace from reviewed draft). */
export function isRecipientHandoffSeedDisposable(name: string): boolean {
  const t = sanitizePartiesInput((name || "").trim());
  if (!t) return true;
  if (PLACEHOLDER_PARTY_NAME_RE.test(t)) return true;
  if (/^party\s*[ab]$/i.test(t.replace(/\s+/g, " "))) return true;
  if (DISPOSABLE_DEMO_PARTY_LEGAL_NAME_RE.test(t)) return true;
  return false;
}

export function pickRecipientNameForHandoff(prev: string, derived: string): string {
  const p = (prev || "").trim();
  if (p && !isRecipientHandoffSeedDisposable(p)) return p;
  const d = (derived || "").trim();
  return d || p;
}

const GENERIC_SIGNER_ROLE = /^(party|party_a|party_b|signer|recipient)$/i;

function roleIsMeaningfulForSignerLine(role: string | null | undefined): boolean {
  const t = sanitizePartiesInput(String(role ?? "").trim());
  if (!t || t.length > 80) return false;
  if (GENERIC_SIGNER_ROLE.test(t)) return false;
  return true;
}

/** Single-line signer summary for recipients (names + optional non-generic roles). */
export function formatRecipientSignerLabelsLine(
  name1: string,
  name2: string,
  role1?: string | null,
  role2?: string | null,
): string {
  const n1 = (name1 || "").trim();
  const n2 = (name2 || "").trim();
  const r1 = roleIsMeaningfulForSignerLine(role1) ? String(role1).trim() : "";
  const r2 = roleIsMeaningfulForSignerLine(role2) ? String(role2).trim() : "";
  if (r1 && r2) {
    const sameAsRolesOnly =
      n1.toLowerCase() === r1.toLowerCase() && n2.toLowerCase() === r2.toLowerCase();
    if (sameAsRolesOnly) return [n1, n2].join(" · ");
    return `${n1} (${r1}) · ${n2} (${r2})`;
  }
  if (r1 && !r2) return `${n1} (${r1}) · ${n2}`;
  if (!r1 && r2) return `${n1} · ${n2} (${r2})`;
  return [n1, n2].filter(Boolean).join(" · ");
}

/** True when the whole line (or each · segment) is an auto placeholder seed. */
export function joinedSignerLabelsAreDisposableSeed(raw: string): boolean {
  const t = sanitizePartiesInput((raw || "").trim());
  if (!t) return true;
  if (isRecipientHandoffSeedDisposable(t)) return true;
  const chunks = t.split(/\s*·\s*/).map((x) => x.trim()).filter(Boolean);
  if (chunks.length >= 2 && chunks.every((c) => isRecipientHandoffSeedDisposable(c))) return true;
  return false;
}

export type RecipientSignerLabelsMeta = {
  role1?: string | null;
  role2?: string | null;
};

export function pickRecipientSignerLabelsForHandoff(
  prev: string,
  name1: string,
  name2: string,
  meta?: RecipientSignerLabelsMeta,
): string {
  const built = formatRecipientSignerLabelsLine(name1, name2, meta?.role1, meta?.role2);
  const p = (prev || "").trim();
  const stalePlaceholderLine = /\bedit\s+in\s+review\b/i.test(p);
  if (p && !joinedSignerLabelsAreDisposableSeed(p) && !stalePlaceholderLine) return p;
  return built || p;
}

/**
 * Premium checkout / completion: pick the best visible party name without clobbering user-entered names.
 * Priority: (0) session handoff from pre-checkout modal save (1) party modal (2) recipient fields
 * (3) structured prior draft (4) premium rewrite draft (5) snapshot candidate (6) safe role labels.
 */
export type MergePremiumRecipientDisplayNameOptions = {
  partySlot?: 0 | 1;
  agreementFamily?: string | null;
};

export function mergePremiumRecipientDisplayName(
  persistedHandoffName: string | null | undefined,
  modalPartyName: string | null | undefined,
  savedRecipientName: string | null | undefined,
  priorDraftPartyName: string | null | undefined,
  premiumDraftPartyName: string | null | undefined,
  snapshotCandidateName: string | null | undefined,
  options?: MergePremiumRecipientDisplayNameOptions,
): string {
  const partySlot: 0 | 1 = options?.partySlot ?? 0;
  const agreementFamily = options?.agreementFamily;
  const [fb0, fb1] = getSafeFallbackPartyLabels(agreementFamily);
  const slotFallback = partySlot === 0 ? fb0 : fb1;

  const pickExplicit = (raw: string | null | undefined): string | null => {
    const t = String(raw ?? "").trim();
    if (!t) return null;
    if (isRecipientHandoffSeedDisposable(t)) return null;
    if (t.length > 36) {
      if (!isHighConfidencePartyNameForAutoPopulation(t)) return null;
    } else if (isProsePollutedPartyName(t)) {
      return null;
    }
    return t.slice(0, 280);
  };

  const pickAuto = (raw: string | null | undefined): string | null => {
    const t = String(raw ?? "").trim();
    if (!t) return null;
    if (isRecipientHandoffSeedDisposable(t)) return null;
    if (!isHighConfidencePartyNameForAutoPopulation(t)) return null;
    return t.slice(0, 280);
  };

  const resolved =
    pickExplicit(persistedHandoffName) ||
    pickExplicit(modalPartyName) ||
    pickAuto(savedRecipientName) ||
    pickAuto(priorDraftPartyName) ||
    pickAuto(premiumDraftPartyName) ||
    pickAuto(snapshotCandidateName);
  if (resolved) return resolved;
  return slotFallback;
}

/** Align `draft.parties` and display names with merge priority (survives stale snapshot candidates). */
export function mergePremiumDraftPartiesWithRecipientPriority(
  premiumDraft: ParsedDraftShape,
  priorDraft: ParsedDraftShape | null | undefined,
  savedRecipient1: string,
  savedRecipient2: string,
  snapName1: string | null | undefined,
  snapName2: string | null | undefined,
  modalParty1?: string | null,
  modalParty2?: string | null,
  intakeText?: string | null,
): { draft: ParsedDraftShape; displayName1: string; displayName2: string } {
  const ho = readPremiumPartyNamesHandoff();
  const ho1 = ho?.party1?.trim() ? ho.party1 : undefined;
  const ho2 = ho?.party2?.trim() ? ho.party2 : undefined;
  const p0 = premiumDraft.parties?.[0]?.name;
  const p1 = premiumDraft.parties?.[1]?.name;
  const p0prior = priorDraft?.parties?.[0]?.name;
  const p1prior = priorDraft?.parties?.[1]?.name;
  const fam = premiumDraft.agreement_family ?? null;
  const partyNames = (premiumDraft.parties ?? []).map((party) => party?.name);
  const legacyDisplayName1 = mergePremiumRecipientDisplayName(
    ho1,
    modalParty1,
    savedRecipient1,
    p0prior,
    p0,
    snapName1 ?? undefined,
    { partySlot: 0, agreementFamily: fam },
  );
  const legacyDisplayName2 = mergePremiumRecipientDisplayName(
    ho2,
    modalParty2,
    savedRecipient2,
    p1prior,
    p1,
    snapName2 ?? undefined,
    { partySlot: 1, agreementFamily: fam },
  );
  const displayName1 =
    resolveSignerSetupPartyIdentity({
      partyIndex: 0,
      draftPartyName: p0 ?? p0prior,
      recipientDisplayName: savedRecipient1,
      handoffName: ho1,
      draftPartyNames: partyNames,
      log: false,
    }).legalEntityName || legacyDisplayName1;
  const displayName2 =
    resolveSignerSetupPartyIdentity({
      partyIndex: 1,
      draftPartyName: p1 ?? p1prior,
      recipientDisplayName: savedRecipient2,
      handoffName: ho2,
      draftPartyNames: partyNames,
      log: false,
    }).legalEntityName || legacyDisplayName2;
  let parties = [...(premiumDraft.parties || [])];
  if (parties[0]) parties[0] = { ...parties[0], name: displayName1 };
  else if (displayName1) parties[0] = { name: displayName1, role: "party" };
  if (parties[1]) parties[1] = { ...parties[1], name: displayName2 };
  else if (displayName2) parties.push({ name: displayName2, role: "party" });
  const collapsedParties = collapseDraftPartyRows(parties, intakeText ?? undefined);
  const repairedParties = repairDraftPartiesFromIntakeAuthority(collapsedParties, intakeText ?? undefined);
  parties = repairedParties.map((row) => ({
    name: row.name,
    role: row.role || "party",
    ...(row.email ? { email: row.email } : {}),
  }));
  return { draft: { ...premiumDraft, parties }, displayName1, displayName2 };
}

/** Broader signal for logging / future expansion (e.g. empty critical fields). */
export function draftHasPlaceholderFieldsForRecipients(draft: ParsedDraftShape | null | undefined): boolean {
  if (!draft) return true;
  if (draftHasPlaceholderParties(draft)) return true;
  const t = (draft.title || "").trim();
  if (!t || /^agreement$/i.test(t)) return true;
  return false;
}

/** True when the plain document still contains internal identity tokens after deterministic hydration. */
export function hydratedFullDocumentStillContainsUnresolvedIdentityPlaceholders(
  rawPlain: string | null | undefined,
  draft: ParsedDraftShape | null | undefined,
  intakeText?: string | null,
): boolean {
  const raw = (rawPlain || "").trim();
  if (!draft || !raw) return false;
  const hydrated = hydrateIdentityPlaceholdersInAgreementPreviewPlain(raw, draft, intakeText);
  return textContainsUnresolvedIdentityPlaceholders(hydrated);
}

/**
 * Execution-oriented gaps that may affect review UX (party/title placeholders).
 * Structured parse gaps (`computeMissing` / parent `missing`) are **draft advisory only** during
 * free or Pro draft review — they never block upgrade/checkout and are not returned here.
 */
export type DraftReviewFirstBlocker =
  | "party_placeholder"
  | "other_placeholder"
  | "identity_placeholder_in_corpus";

export function getDraftFirstReviewBlocker(
  draft: ParsedDraftShape | null | undefined,
  opts?: {
    /** Same string shown as the full agreement preview (e.g. `renderedAgreementPreview`). */
    userVisibleFullDocumentPlain?: string | null;
    intakeText?: string | null;
  },
): DraftReviewFirstBlocker | null {
  if (!draft) return null;
  const plain = (opts?.userVisibleFullDocumentPlain || "").trim();
  const partyNamesResolvedViaPreview = plain.length >= 50 && partyNamesResolvedViaRenderedPreview(draft, plain);
  if (draftHasPlaceholderParties(draft)) {
    if (partyNamesResolvedViaPreview) {
      // Party names exist in the rendered preview but draft.parties has placeholders.
      // Don't block on party_placeholder — the user-visible names are real.
    } else {
      return "party_placeholder";
    }
  }
  if (
    plain.length >= 400 &&
    !partyNamesResolvedViaPreview &&
    hydratedFullDocumentStillContainsUnresolvedIdentityPlaceholders(plain, draft, opts?.intakeText ?? null)
  ) {
    return "identity_placeholder_in_corpus";
  }
  if (draftHasPlaceholderFieldsForRecipients(draft)) return "other_placeholder";
  return null;
}

/** First structured row to open for “Fix review details” (parties handled separately). */
export type StructuredReviewEditField = "title" | "purpose" | "payment_terms" | "duration";

export function getPrimaryStructuredFixReviewField(
  draft: ParsedDraftShape | null | undefined,
): StructuredReviewEditField | null {
  if (!draft) return null;
  if (draftHasPlaceholderParties(draft)) return null;
  const t = (draft.title || "").trim();
  if (!t || /^agreement$/i.test(t)) return "title";
  if (!(draft.purpose || "").trim()) return "purpose";
  if (!(draft.payment_terms || "").trim()) return "payment_terms";
  const hasTerm = [draft.duration, draft.effective_date, draft.due_date].some((x) => String(x || "").trim());
  if (!hasTerm) return "duration";
  return null;
}
