import type { AgreementDraft, AgreementParty } from "../../agreement/agreementTypes";
import {
  agreementParticipantToVs01Counterparty,
  assertSignerMetadataPreserved,
  countParticipantSignerMetadata,
  logAgreementParticipantNormalization,
  participantsFromAgreementDraft,
  type AgreementParticipant,
} from "../../agreement/agreementParticipantModel";
import {
  explicitSignerNameForEntity,
  normalizeSignerMetadataForSave,
} from "../../agreement/signerMetadataNormalize";
import {
  linearPremiumRecipientSlots,
  MAX_PREMIUM_RECIPIENT_PARTY_HANDOFF_ROWS,
  readPremiumRecipientHandoff,
} from "../../components/agreements/premiumPartyNamesHandoff";
import { normalizeAgreementDisplayTitle } from "../../components/agreements/canonicalAgreementTitle";
import { buildAgreementPreviewText } from "../../components/agreements/agreementPreviewFromDraft";
import { clawAgreementHeaders } from "../../agreement/agreementOrgHeaders";
import type { GuidedVs01SigningHandoff } from "../../components/agreements/guidedDealCompletion/guidedVs01SigningHandoff";
import {
  assertGuidedProVs01BridgeCorpusReady,
  logGuidedProVs01BridgeCorpusBlocked,
} from "../../components/agreements/guidedDealCompletion/guidedVs01SigningHandoff";
import {
  mergeAgreementDraftWithGuidedSigningHandoff,
  writeGuidedVs01SigningHandoffSession,
} from "../../components/agreements/guidedDealCompletion/guidedVs01SigningHandoffSession";
import {
  buildPrepareBridgeCorpusGateArgs,
  resolveAgreementCorpusForPrepareHandoff,
} from "../../vs01/vs01PrepareBridgeCorpus";
import {
  resolveFinalVs01CorpusOrBlock,
  VS01_SIGNING_CORPUS_MIN_LEN,
} from "../../vs01/vs01SigningCorpus";
import { readRecipientSetupArraysFromConsumedAuthority } from "../../components/agreements/paidProSignerMetadataAuthority";
import { extractExecutionBlockSignerLines } from "../../components/agreements/paidProSignerMetadataHandoffExtract";
import { stripRecipientEmailNoise } from "../../components/agreements/recipientEmailValidation";
import { isPlausibleEmail } from "../../vs01/detailsStepValidation";
import type { Vs01Counterparty } from "../../vs01/types";
import { resolveApiBase } from "../../lib/clawApi";

const BRIDGE_SESSION_KEY = "claw_agreement_vs01_bridge_handoff_v1";
/** Survives Strict Mode / URL strip so Vs01Wizard still knows to skip details (value = document id). */
const PAID_PRO_AGREEMENT_SKIP_MARKER_KEY = "claw_vs01_paid_pro_agreement_skip_v1";

export type AgreementVs01BridgeSession = {
  vs01DocumentId: string;
  agreementId: string;
  agreementTitle: string;
  /** Legal entity / party name for the owner row (never a human representative name). */
  creatorName: string;
  creatorEmail: string;
  /** Optional human representative for the owner entity (from intake or draft parties). */
  creatorSignerName?: string;
  creatorSignerTitle?: string;
  counterparties: Vs01Counterparty[];
  /** VS01 step index: 2 = Signing (field placement); step 3 requires receipt from step 2. */
  targetStep: 1 | 2;
  /**
   * Paid Pro sender-first: signers were collected on LawDog send — skip VS01 details step
   * and open signing/field placement when {@link lawdogSenderFirstBridgeMetadataReady} passes.
   */
  senderFirstLawdogHandoff?: boolean;
  /** Identifies LawDog paid Pro sender-first → VS01 handoff (for logs and future guards). */
  source?: "paid_pro_sender_first";
  /** Mirrors premium sender-first intent on the LawDog send surface. */
  signerFirst?: boolean;
  /**
   * Paid Pro: sender starts the workflow first — field placement / packet prep, not an executed signature.
   */
  ownerIsPreparingPacket?: boolean;
  /** Explicit VS01 bridge mode for diagnostics and gating. */
  agreementBridgeMode?: "prepare_signing_packet";
  /** Plain-text agreement corpus for signature-block anchor placement in VS01 prepare. */
  agreementCorpusText?: string;
  /**
   * Set when bridging from reviewer-approved “Finalize for signing” (not Simple Send intake).
   * Drives VS01 shell copy (“reviewer already approved”) vs generic agreement bridge.
   */
  reviewerApprovedCleanHandoff?: boolean;
};

export function setPaidProAgreementBridgeSkipMarker(documentId: string): void {
  const id = (documentId || "").trim();
  if (!id) return;
  try {
    sessionStorage.setItem(PAID_PRO_AGREEMENT_SKIP_MARKER_KEY, id);
  } catch {
    /* ignore */
  }
}

export function readPaidProAgreementBridgeSkipMarker(documentId: string | null | undefined): boolean {
  const id = (documentId || "").trim();
  if (!id) return false;
  try {
    return sessionStorage.getItem(PAID_PRO_AGREEMENT_SKIP_MARKER_KEY) === id;
  } catch {
    return false;
  }
}

export function clearPaidProAgreementBridgeSkipMarker(): void {
  try {
    sessionStorage.removeItem(PAID_PRO_AGREEMENT_SKIP_MARKER_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Paid Pro `/app/esign/:doc?agreement_bridge=1` — skip VS01 “Who needs to sign?” (LawDog already collected signers).
 * Uses persisted marker and/or live URL + bridge session (document ids must match).
 */
export function computePaidProAgreementBridgeSkip(
  seedDocumentId: string | null | undefined,
  hideStepper: boolean,
): boolean {
  if (!hideStepper || !(seedDocumentId || "").trim()) return false;
  const sid = (seedDocumentId || "").trim();
  if (readPaidProAgreementBridgeSkipMarker(sid)) return true;
  if (typeof window === "undefined") return false;
  const b = readAgreementVs01BridgeSession();
  if (b && b.vs01DocumentId.trim() === sid) return true;
  const q = new URLSearchParams(window.location.search);
  if (q.get("agreement_bridge") !== "1") return false;
  return Boolean(b && b.vs01DocumentId.trim() === sid);
}

/** Whether LawDog Pro already supplied enough signer metadata to skip VS01 “Who needs to sign?”. */
export function lawdogSenderFirstBridgeMetadataReady(
  bridge: Pick<AgreementVs01BridgeSession, "senderFirstLawdogHandoff" | "creatorName" | "creatorEmail">,
  counterparties: Vs01Counterparty[],
): boolean {
  if (!bridge.senderFirstLawdogHandoff) return false;
  if (!bridge.creatorName?.trim()) return false;
  const em = bridge.creatorEmail?.trim();
  if (!em || !isPlausibleEmail(em)) return false;
  return counterparties.some((c) => c.name.trim().length > 0 || c.email.trim().length > 0);
}

function newCpId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `cp_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function emailDomainForBridgeLog(addr: string): string | null {
  const t = addr.trim();
  const at = t.indexOf("@");
  if (at < 1 || at >= t.length - 1) return null;
  return t.slice(at + 1).toLowerCase();
}

/**
 * Privacy-safe diagnostics before writing the VS01 bridge session (no full addresses).
 */
export function logAgreementVs01BridgePreflight(bridge: AgreementVs01BridgeSession): void {
  const ce = (bridge.creatorEmail || "").trim();
  const cps = bridge.counterparties ?? [];
  const counterpartiesWithEmailCount = cps.filter((c) => isPlausibleEmail((c.email || "").trim())).length;
  // eslint-disable-next-line no-console
  console.info("[agreement-vs01-bridge-preflight]", {
    hasCreatorEmail: isPlausibleEmail(ce),
    creatorEmailDomain: emailDomainForBridgeLog(ce),
    counterpartyCount: cps.length,
    counterpartiesWithEmailCount,
  });
}

export type RecipientSetupEmailInput = {
  recipient1Email?: string | null | undefined;
  recipient2Email?: string | null | undefined;
  /** When set, merges plausible emails onto `draft.parties[i]` for every index (preferred for multi-party). */
  recipientPartyEmails?: readonly (string | null | undefined)[] | undefined;
  /** Optional per-party representative names (by party index). */
  recipientPartySignerNames?: readonly (string | null | undefined)[] | undefined;
  /** Optional per-party representative titles (by party index). */
  recipientPartySignerTitles?: readonly (string | null | undefined)[] | undefined;
};

function normalizeRecipientSetupSlot(raw: string | null | undefined): string | undefined {
  const s = stripRecipientEmailNoise(String(raw ?? ""));
  if (!s || !isPlausibleEmail(s)) return undefined;
  return s;
}

export function recipientSetupPlausibleInputFlags(
  setup: RecipientSetupEmailInput | null | undefined,
): { hasRecipient1Email: boolean; hasRecipient2Email: boolean; hasAnyPartyEmail: boolean } {
  const arr = setup?.recipientPartyEmails;
  const fromArray =
    Array.isArray(arr) &&
    arr.some((x) => {
      const n = normalizeRecipientSetupSlot(x ?? undefined);
      return Boolean(n);
    });
  return {
    hasRecipient1Email: Boolean(normalizeRecipientSetupSlot(setup?.recipient1Email)),
    hasRecipient2Email: Boolean(normalizeRecipientSetupSlot(setup?.recipient2Email)),
    hasAnyPartyEmail: fromArray,
  };
}

/**
 * Privacy-safe: logs only booleans, party email counts, and domains (no local-parts).
 */
export function logAgreementVs01RecipientEmailMergeDiagnostics(
  mergedDraft: AgreementDraft | null,
  inputFlags: ReturnType<typeof recipientSetupPlausibleInputFlags>,
): void {
  if (!mergedDraft) return;
  const preview = buildAgreementVs01BridgeSession({
    agreementId: "__merge_diag__",
    vs01DocumentId: "__merge_diag__",
    draft: mergedDraft,
  });
  const mergedPartiesWithEmailCount = (mergedDraft.parties ?? []).filter((p) =>
    isPlausibleEmail(stripRecipientEmailNoise(String((p as { email?: string }).email ?? ""))),
  ).length;
  const mergedCounterpartiesWithEmailCount = preview.counterparties.filter((c) =>
    isPlausibleEmail(stripRecipientEmailNoise(String(c.email ?? ""))),
  ).length;
  // eslint-disable-next-line no-console
  console.info("[agreement-vs01-recipient-email-merge]", {
    ...inputFlags,
    mergedPartiesWithEmailCount,
    mergedCreatorEmailDomain: emailDomainForBridgeLog(preview.creatorEmail),
    mergedCounterpartiesWithEmailCount,
  });
}

/**
 * Merges optional representative name/title from recipient setup onto `draft.parties[i]` by index.
 */
export function mergePaidProRecipientSetupSignerMetadataIntoDraft(
  draft: AgreementDraft | null,
  setup: Pick<RecipientSetupEmailInput, "recipientPartySignerNames" | "recipientPartySignerTitles"> | null | undefined,
): AgreementDraft | null {
  if (!draft || !setup) return draft;
  const arrN = setup.recipientPartySignerNames;
  const arrT = setup.recipientPartySignerTitles;
  if (!Array.isArray(arrN) && !Array.isArray(arrT)) return draft;
  const len = Math.max(Array.isArray(arrN) ? arrN.length : 0, Array.isArray(arrT) ? arrT.length : 0);
  if (len === 0) return draft;
  const names = Array.from({ length: len }, (_, i) =>
    normalizeSignerMetadataForSave(Array.isArray(arrN) ? arrN[i] : undefined),
  );
  const titleSlots = Array.from({ length: len }, (_, i) =>
    normalizeSignerMetadataForSave(Array.isArray(arrT) ? arrT[i] : undefined),
  );
  if (!names.some(Boolean) && !titleSlots.some(Boolean)) return draft;

  const parties = [...(draft.parties ?? [])] as AgreementParty[];
  let changed = false;
  const max = Math.max(names.length, titleSlots.length, parties.length);
  for (let i = 0; i < max && i < parties.length; i++) {
    const entityName = (parties[i].name || "").trim();
    const nextSignerName = explicitSignerNameForEntity(names[i], entityName);
    const nextSignerTitle = titleSlots[i];
    const prevSignerName = normalizeSignerMetadataForSave(parties[i].signerName);
    const prevSignerTitle = normalizeSignerMetadataForSave(parties[i].signerTitle);
    if (prevSignerName === nextSignerName && prevSignerTitle === nextSignerTitle) continue;
    parties[i] = {
      ...parties[i],
      signerName: nextSignerName,
      signerTitle: nextSignerTitle,
    };
    changed = true;
  }
  return changed ? { ...draft, parties } : draft;
}

function pickSignerSlotValue(
  index: number,
  entityName: string,
  explicitArr: readonly (string | null | undefined)[] | undefined,
  handoffValue: string | undefined,
  draftValue: string | undefined,
  field: "signerName" | "signerTitle",
): string {
  const fromExplicit = field === "signerName"
    ? explicitSignerNameForEntity(
        Array.isArray(explicitArr) ? explicitArr[index] : undefined,
        entityName,
      )
    : normalizeSignerMetadataForSave(Array.isArray(explicitArr) ? explicitArr[index] : undefined);
  const fromHandoff =
    field === "signerName"
      ? explicitSignerNameForEntity(handoffValue, entityName)
      : normalizeSignerMetadataForSave(handoffValue);
  const fromDraft =
    field === "signerName"
      ? explicitSignerNameForEntity(draftValue, entityName)
      : normalizeSignerMetadataForSave(draftValue);
  return fromExplicit || fromHandoff || fromDraft || "";
}

let lastVs01BridgeRecipientSetupSource = "unknown";

/** Diagnostic: where {@link resolveRecipientSetupForVs01Bridge} last sourced signer slots. */
export function getLastVs01BridgeRecipientSetupSource(): string {
  return lastVs01BridgeRecipientSetupSource;
}

function setVs01BridgeRecipientSetupSource(source: string): void {
  lastVs01BridgeRecipientSetupSource = source;
}

function applyExecutionBlockCorpusFallbackToRecipientSetup(
  draft: AgreementDraft | null,
  partyCount: number,
  recipientPartySignerNames: string[],
  recipientPartySignerTitles: string[],
): boolean {
  const missingSigner =
    recipientPartySignerNames.slice(0, partyCount).every((name) => !name.trim()) &&
    recipientPartySignerTitles.slice(0, partyCount).every((title) => !title.trim());
  if (!missingSigner) return false;

  const corpus = resolveBridgeAgreementCorpusFromDraft(draft);
  if (!corpus.trim()) return false;

  const parties = (draft?.parties ?? []) as AgreementParty[];
  let applied = false;
  for (let i = 0; i < partyCount; i++) {
    const entity = (parties[i]?.name || "").trim();
    const extracted = extractExecutionBlockSignerLines(corpus, i);
    if (!recipientPartySignerNames[i]?.trim()) {
      const name = explicitSignerNameForEntity(extracted.nameLine, entity) ?? "";
      if (name) {
        recipientPartySignerNames[i] = name;
        applied = true;
      }
    }
    if (!recipientPartySignerTitles[i]?.trim()) {
      const title = normalizeSignerMetadataForSave(extracted.titleLine) ?? "";
      if (title) {
        recipientPartySignerTitles[i] = title;
        applied = true;
      }
    }
  }
  return applied;
}

/**
 * Resolve recipient-setup signer/email arrays from explicit UI input, session handoff, and draft parties.
 * Handoff is authoritative when the live draft was hydrated without representative fields (common after review links).
 */
export function resolveRecipientSetupForVs01Bridge(
  draft: AgreementDraft | null,
  explicit?: RecipientSetupEmailInput | null,
): RecipientSetupEmailInput | null {
  const fromAuthority = readRecipientSetupArraysFromConsumedAuthority();
  if (fromAuthority) {
    setVs01BridgeRecipientSetupSource("consumed_authority");
    return {
      recipientPartySignerNames: fromAuthority.recipientPartySignerNames,
      recipientPartySignerTitles: fromAuthority.recipientPartySignerTitles,
      recipientPartyEmails: fromAuthority.recipientPartyEmails,
    };
  }
  if (!draft) return explicit ?? null;
  const parties = (draft.parties ?? []) as AgreementParty[];
  const partyCount = Math.min(parties.length, MAX_PREMIUM_RECIPIENT_PARTY_HANDOFF_ROWS);
  if (partyCount === 0) return explicit ?? null;

  const handoff = readPremiumRecipientHandoff();
  const handoffSlots = handoff ? linearPremiumRecipientSlots(handoff, partyCount) : [];

  const recipientPartySignerNames: string[] = [];
  const recipientPartySignerTitles: string[] = [];
  const recipientPartyEmails: string[] = [];
  for (let i = 0; i < partyCount; i++) {
    const p = parties[i]!;
    const entity = (p.name || "").trim();
    const ho = handoffSlots[i];
    recipientPartySignerNames.push(
      pickSignerSlotValue(
        i,
        entity,
        explicit?.recipientPartySignerNames,
        ho?.signerName,
        p.signerName,
        "signerName",
      ),
    );
    recipientPartySignerTitles.push(
      pickSignerSlotValue(
        i,
        entity,
        explicit?.recipientPartySignerTitles,
        ho?.signerTitle,
        p.signerTitle,
        "signerTitle",
      ),
    );
    const draftEm = stripRecipientEmailNoise(String(p.email ?? ""));
    const hoEm = stripRecipientEmailNoise(String(ho?.email ?? ""));
    const exArr = explicit?.recipientPartyEmails;
    const fromEx = Array.isArray(exArr) ? normalizeRecipientSetupSlot(exArr[i]) : undefined;
    const fromLegacy =
      i === 0
        ? normalizeRecipientSetupSlot(explicit?.recipient1Email)
        : i === 1
          ? normalizeRecipientSetupSlot(explicit?.recipient2Email)
          : undefined;
    recipientPartyEmails.push(fromEx || fromLegacy || (isPlausibleEmail(hoEm) ? hoEm : "") || draftEm || "");
  }

  let hasSigner =
    recipientPartySignerNames.some(Boolean) || recipientPartySignerTitles.some(Boolean);
  const hasEmail = recipientPartyEmails.some((e) => isPlausibleEmail(e));
  if (!hasSigner) {
    const corpusApplied = applyExecutionBlockCorpusFallbackToRecipientSetup(
      draft,
      partyCount,
      recipientPartySignerNames,
      recipientPartySignerTitles,
    );
    if (corpusApplied) {
      hasSigner = true;
      setVs01BridgeRecipientSetupSource("execution_block_corpus");
    }
  }
  if (!hasSigner && !hasEmail && !explicit) {
    setVs01BridgeRecipientSetupSource("none");
    return null;
  }
  if (lastVs01BridgeRecipientSetupSource === "unknown") {
    setVs01BridgeRecipientSetupSource(hasSigner ? "handoff_draft" : "draft_emails");
  }

  return {
    recipient1Email: recipientPartyEmails[0] || explicit?.recipient1Email,
    recipient2Email: recipientPartyEmails[1] || explicit?.recipient2Email,
    recipientPartyEmails,
    recipientPartySignerNames,
    recipientPartySignerTitles,
  };
}

export function countRecipientSetupSignerMetadata(
  setup: RecipientSetupEmailInput | null | undefined,
): { slotsWithSignerName: number; slotsWithSignerTitle: number; partyCount: number } {
  const names = setup?.recipientPartySignerNames ?? [];
  const titles = setup?.recipientPartySignerTitles ?? [];
  const partyCount = Math.max(names.length, titles.length);
  return {
    partyCount,
    slotsWithSignerName: names.filter((n) => Boolean((n || "").trim())).length,
    slotsWithSignerTitle: titles.filter((t) => Boolean((t || "").trim())).length,
  };
}

export function logSignerMetadataBeforeVs01Bridge(
  draft: AgreementDraft | null,
  recipientSetup: RecipientSetupEmailInput | null | undefined,
): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  const counts = countRecipientSetupSignerMetadata(recipientSetup);
  const draftParties = (draft?.parties ?? []) as AgreementParty[];
  const draftWithSignerName = draftParties.filter((p) =>
    Boolean(explicitSignerNameForEntity(p.signerName, (p.name || "").trim())),
  ).length;
  const draftWithSignerTitle = draftParties.filter((p) => Boolean((p.signerTitle || "").trim())).length;
  // eslint-disable-next-line no-console
  console.info("[signer-metadata-before-vs01-bridge]", {
    partyCount: counts.partyCount,
    slotsWithSignerName: counts.slotsWithSignerName,
    slotsWithSignerTitle: counts.slotsWithSignerTitle,
    draftPartiesWithSignerName: draftWithSignerName,
    draftPartiesWithSignerTitle: draftWithSignerTitle,
    usedHandoff: Boolean(readPremiumRecipientHandoff()),
  });
}

/** Last-mile merge for Paid Pro VS01 bridge: live draft + optional recipient-setup slots (by party index). */
export function mergeLiveDraftWithRecipientSetupForVs01Bridge(
  liveDraft: AgreementDraft | null,
  recipientSetup?: RecipientSetupEmailInput | null,
): AgreementDraft | null {
  if (!liveDraft) return null;
  const resolved = resolveRecipientSetupForVs01Bridge(liveDraft, recipientSetup);
  if (!resolved) return liveDraft;
  const withEmails = mergePaidProRecipientSetupEmailsIntoDraft(liveDraft, resolved) ?? liveDraft;
  const withSigner = mergePaidProRecipientSetupSignerMetadataIntoDraft(withEmails, resolved) ?? withEmails;
  return withSigner;
}

/**
 * Merges recipient-setup / inline UI emails into `draft.parties[i].email` by index before VS01 bridge build.
 * Only sets plausible addresses; leaves parties unchanged when nothing to apply.
 * Pass either slot array (legacy) or `{ recipient1Email, recipient2Email }` for party indices 0 and 1.
 */
export function mergePaidProRecipientSetupEmailsIntoDraft(
  draft: AgreementDraft | null,
  slotEmails: readonly (string | null | undefined)[] | RecipientSetupEmailInput,
): AgreementDraft | null {
  if (!draft) return null;

  let normalizedSlots: (string | undefined)[];
  if (Array.isArray(slotEmails)) {
    if (!slotEmails.length) return draft;
    normalizedSlots = slotEmails.map((x) => normalizeRecipientSetupSlot(x ?? undefined));
    if (!normalizedSlots.some(Boolean)) return draft;
  } else {
    const setup = slotEmails as RecipientSetupEmailInput;
    const arr = setup.recipientPartyEmails;
    if (Array.isArray(arr) && arr.length > 0) {
      normalizedSlots = arr.map((x) => normalizeRecipientSetupSlot(x ?? undefined));
      if (!normalizedSlots.some(Boolean)) return draft;
    } else {
      normalizedSlots = [
        normalizeRecipientSetupSlot(setup.recipient1Email),
        normalizeRecipientSetupSlot(setup.recipient2Email),
      ];
      if (!normalizedSlots[0] && !normalizedSlots[1]) return draft;
    }
  }

  const parties = [...(draft.parties ?? [])] as AgreementParty[];
  let changed = false;
  for (let i = 0; i < normalizedSlots.length && i < parties.length; i++) {
    const raw = normalizedSlots[i];
    if (!raw) continue;
    const prev = (parties[i].email ?? "").trim();
    if (prev === raw) continue;
    parties[i] = { ...parties[i], email: raw };
    changed = true;
  }
  return changed ? { ...draft, parties } : draft;
}

/**
 * LawDog drafts sometimes omit `email` on the owner row even when another party row carries the same
 * display name with a plausible address. Never pull another party’s email unless it matches the creator name.
 */
function inferBridgeCreatorEmail(
  draft: AgreementDraft | null,
  owner: AgreementParty | null,
  creatorName: string
): string {
  const direct = (owner?.email || "").trim();
  if (isPlausibleEmail(direct)) return direct;

  const key = creatorName.trim().toLowerCase();
  if (!key) return "";

  const parties = (draft?.parties ?? []) as AgreementParty[];
  for (const p of parties) {
    const pn = (p.name || "").trim().toLowerCase();
    if (pn !== key) continue;
    const em = (p.email || "").trim();
    if (isPlausibleEmail(em)) return em;
  }

  return "";
}

export function logVs01BridgeBuild(
  participants: readonly AgreementParticipant[],
  meta?: { source?: string },
): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  const counts = countParticipantSignerMetadata(participants);
  // eslint-disable-next-line no-console
  console.info("[vs01-bridge-build]", {
    participantCount: participants.length,
    ...counts,
    source: meta?.source ?? getLastVs01BridgeRecipientSetupSource(),
  });
}

function bridgeParticipantsFromDraft(draft: AgreementDraft | null): AgreementParticipant[] {
  const parties = (draft?.parties ?? []) as AgreementParty[];
  const canonical = participantsFromAgreementDraft(parties);
  logVs01BridgeBuild(canonical);
  logAgreementParticipantNormalization("vs01-bridge-build", canonical);
  return canonical;
}

export function resolveBridgeAgreementCorpusFromDraft(draft: AgreementDraft | null): string {
  const d = draft as {
    server_full_document_text?: string | null;
    premium_server_full_document_text?: string | null;
    premium_full_document_text?: string | null;
    document_text?: string | null;
  } | null;
  return (
    String(d?.server_full_document_text ?? "").trim() ||
    String(d?.premium_server_full_document_text ?? "").trim() ||
    String(d?.premium_full_document_text ?? "").trim() ||
    String(d?.document_text ?? "").trim()
  );
}

/** Map agreement parties → VS01 creator + counterparties (non-owner signers/recipients). */
export function buildAgreementVs01BridgeSession(params: {
  agreementId: string;
  vs01DocumentId: string;
  draft: AgreementDraft | null;
  /** Override corpus used for VS01 signature-block anchor placement. */
  agreementCorpusText?: string | null;
  /** Set when bridging from paid Pro sender-first `/app/send` → VS01 e-sign. */
  senderFirstLawdogHandoff?: boolean;
  /** Reviewer approved without edits — finalize-for-signing handoff (not send-page intake). */
  reviewerApprovedCleanHandoff?: boolean;
}): AgreementVs01BridgeSession {
  const parties = (params.draft?.parties ?? []) as AgreementParty[];
  const participants = bridgeParticipantsFromDraft(params.draft);
  const ownerParticipant = participants.find((p) => p.role === "owner");
  const counterParticipants = participants.filter((p) => p.role === "counterparty");
  const owner =
    parties.find((p) => (p.role || "").toLowerCase() === "owner") ?? parties[0] ?? null;
  const creatorName = ownerParticipant?.partyName || (owner?.name || "").trim() || "Sender";
  const creatorSignerName = ownerParticipant?.signerName || explicitSignerNameForEntity(owner?.signerName, creatorName);
  const creatorSignerTitle =
    ownerParticipant?.signerTitle || normalizeSignerMetadataForSave(owner?.signerTitle);
  const creatorEmail =
    ownerParticipant?.signerEmail || inferBridgeCreatorEmail(params.draft, owner, creatorName);
  const counterparties: Vs01Counterparty[] =
    counterParticipants.length > 0
      ? counterParticipants.map((p) => {
          const partyRow = parties.find((x) => (x.name || "").trim() === p.partyName);
          const stableId =
            partyRow?.id && String(partyRow.id).trim() ? String(partyRow.id).trim() : newCpId();
          return { ...agreementParticipantToVs01Counterparty(p), id: stableId };
        })
      : [{ id: newCpId(), name: "", email: "", phone: "" }];
  assertSignerMetadataPreserved(participants, participants, "vs01-bridge-build");
  const senderFirst = Boolean(params.senderFirstLawdogHandoff);
  const reviewerApproved = Boolean(params.reviewerApprovedCleanHandoff);
  const draftCorpus = resolveBridgeAgreementCorpusFromDraft(params.draft);
  const agreementCorpusText = (params.agreementCorpusText ?? "").trim() || draftCorpus;
  return {
    vs01DocumentId: params.vs01DocumentId.trim(),
    agreementId: params.agreementId.trim(),
    agreementTitle:
      normalizeAgreementDisplayTitle((params.draft?.title || "").trim()) ||
      (params.draft?.title || "").trim() ||
      "Agreement",
    creatorName,
    creatorEmail,
    ...(creatorSignerName ? { creatorSignerName } : {}),
    ...(creatorSignerTitle ? { creatorSignerTitle } : {}),
    counterparties,
    targetStep: 2,
    senderFirstLawdogHandoff: senderFirst,
    ...(senderFirst
      ? ({
          source: "paid_pro_sender_first" as const,
          signerFirst: true,
          ownerIsPreparingPacket: true,
          agreementBridgeMode: "prepare_signing_packet" as const,
        } as const)
      : {}),
    ...(reviewerApproved ? { reviewerApprovedCleanHandoff: true as const } : {}),
    ...(agreementCorpusText.length >= VS01_SIGNING_CORPUS_MIN_LEN ? { agreementCorpusText } : {}),
  };
}

export function logVs01BridgeSignerMetadata(bridge: AgreementVs01BridgeSession): void {
  const rolesWithSignerName = 1 + (bridge.counterparties ?? []).filter((c) => c.signerName?.trim()).length;
  const rolesWithSignerTitle =
    (bridge.creatorSignerTitle ? 1 : 0) +
    (bridge.counterparties ?? []).filter((c) => c.signerTitle?.trim()).length;
  // eslint-disable-next-line no-console
  console.info("[vs01-bridge-signer-metadata]", {
    hasCreatorSignerName: Boolean(bridge.creatorSignerName?.trim()),
    hasCreatorSignerTitle: Boolean(bridge.creatorSignerTitle?.trim()),
    counterpartyCount: bridge.counterparties?.length ?? 0,
    counterpartiesWithSignerName: (bridge.counterparties ?? []).filter((c) => c.signerName?.trim()).length,
    counterpartiesWithSignerTitle: (bridge.counterparties ?? []).filter((c) => c.signerTitle?.trim()).length,
    rolesWithSignerName,
    rolesWithSignerTitle,
  });
}

export function writeAgreementVs01BridgeSession(payload: AgreementVs01BridgeSession): void {
  try {
    sessionStorage.setItem(BRIDGE_SESSION_KEY, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}

export function readAgreementVs01BridgeSession(): AgreementVs01BridgeSession | null {
  try {
    const raw = sessionStorage.getItem(BRIDGE_SESSION_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as AgreementVs01BridgeSession;
    if (!o?.vs01DocumentId?.trim() || !o.agreementId?.trim()) return null;
    if (!Array.isArray(o.counterparties)) return null;
    return o;
  } catch {
    return null;
  }
}

export function clearAgreementVs01BridgeSession(): void {
  try {
    sessionStorage.removeItem(BRIDGE_SESSION_KEY);
  } catch {
    /* ignore */
  }
}

export type AgreementVs01SigningSeedResult =
  | { ok: true; documentId: string; contentSha256: string | null }
  | { ok: false; reason: string; httpStatus?: number; detail?: unknown };

/**
 * POST /api/agreements/:id/vs01-signing-seed — returns VS01 document_id for `/app/esign/:documentId`.
 */
export function logAgreementToVs01EsignRoute(payload: Record<string, unknown>): void {
  // eslint-disable-next-line no-console
  console.info("[agreement-to-vs01-esign-route]", {
    source: "paid_pro_sender_first",
    signerFirst: true,
    ...payload,
  });
}

/** Paid Pro sender-first: VS01 seed failed; user stays on SimpleSend (no alternate route). */
export function logAgreementVs01SeedBlocked(payload: {
  agreementId: string;
  status: number | null;
  detail: unknown;
  source: "paid_pro_sender_first";
}): void {
  // eslint-disable-next-line no-console
  console.warn("[agreement-vs01-seed-blocked]", payload);
}

function vs01SeedFailureReason(detail: unknown, httpStatus: number): string {
  if (typeof detail === "string" && detail.trim()) return detail.trim();
  if (detail && typeof detail === "object") {
    const o = detail as Record<string, unknown>;
    const code = o.code;
    const message = o.message;
    if (typeof code === "string" && code.trim() === "vs01_signing_seed_placeholder_blocked") {
      if (typeof message === "string" && message.trim()) return message.trim();
    }
    if (typeof code === "string" && code.trim()) return code.trim();
    if (typeof message === "string" && message.trim()) return message.trim();
  }
  return `http_${httpStatus}`;
}

function logVs01SigningSeedPreflight(
  agreementId: string,
  draft: AgreementDraft | null,
  signingCorpusPlain?: string | null,
  signingCorpusSource?: string | null,
): void {
  if (import.meta.env.MODE === "test") return;
  const parties = (draft?.parties ?? []) as AgreementParty[];
  const signingLen = (signingCorpusPlain ?? "").trim().length;
  const draftLen = Math.max(
    String((draft as { document_text?: string })?.document_text ?? "").length,
    String((draft as { premium_full_document_text?: string })?.premium_full_document_text ?? "").length,
    String((draft as { server_full_document_text?: string })?.server_full_document_text ?? "").length,
  );
  const docLen = signingLen > 0 ? signingLen : draftLen;
  const id = agreementId.trim();
  // eslint-disable-next-line no-console
  console.info("[vs01-signing-seed-preflight]", {
    agreementIdShort: id.length <= 12 ? id : `${id.slice(0, 8)}…`,
    recipientCount: parties.filter((p) => (p.email || "").trim()).length,
    signerCount: parties.filter((p) =>
      Boolean(explicitSignerNameForEntity(p.signerName, (p.name || "").trim())),
    ).length,
    hasDocumentText: docLen > 0,
    documentTextLen: docLen > 0 ? docLen : null,
    documentTextSource:
      signingLen > 0 ? signingCorpusSource ?? "signing_corpus_plain" : draftLen > 0 ? "draft_fields" : "none",
    hasTitle: Boolean((draft?.title || "").trim()),
    hasPartyLabels: parties.filter((p) => (p.name || "").trim()).length,
    payloadKeys: [],
  });
}

function logVs01SigningSeed422(detail: unknown, status: number): void {
  if (import.meta.env.MODE === "test") return;
  let code: string | undefined;
  let message: string | undefined;
  let stage: string | undefined;
  if (detail && typeof detail === "object") {
    const o = detail as Record<string, unknown>;
    if (typeof o.code === "string") code = o.code;
    if (typeof o.message === "string") message = o.message.slice(0, 400);
    if (typeof o.stage === "string") stage = o.stage;
  }
  // eslint-disable-next-line no-console
  console.warn("[vs01-signing-seed-422]", { status, code: code ?? null, message: message ?? null, stage: stage ?? null });
}

export async function fetchAgreementVs01SigningSeed(
  agreementId: string,
  draft?: AgreementDraft | null,
  signingCorpusPlain?: string | null,
  signingCorpusSource?: string | null,
): Promise<AgreementVs01SigningSeedResult> {
  const id = agreementId.trim();
  if (!id) return { ok: false, reason: "missing_agreement_id" };
  logVs01SigningSeedPreflight(id, draft ?? null, signingCorpusPlain, signingCorpusSource);
  const corpusPayload = (signingCorpusPlain ?? "").trim();
  try {
    const res = await fetch(
      `${resolveApiBase().replace(/\/$/, "")}/api/agreements/${encodeURIComponent(id)}/vs01-signing-seed`,
      {
        method: "POST",
        headers: clawAgreementHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          ...(corpusPayload.length >= VS01_SIGNING_CORPUS_MIN_LEN
            ? { signing_corpus_plain: corpusPayload }
            : {}),
        }),
      },
    );
    const j = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      const d = j.detail;
      if (res.status === 422) logVs01SigningSeed422(d, res.status);
      const reason = vs01SeedFailureReason(d, res.status);
      // eslint-disable-next-line no-console
      console.warn("[agreement-vs01-seed-failed]", {
        agreementId: id,
        status: res.status,
        detail: d,
        code: d && typeof d === "object" ? (d as Record<string, unknown>).code : null,
        stage: d && typeof d === "object" ? (d as Record<string, unknown>).stage : null,
      });
      return { ok: false, reason, httpStatus: res.status, detail: d };
    }
    const docId = typeof j.document_id === "string" ? j.document_id.trim() : "";
    if (!docId) return { ok: false, reason: "missing_document_id" };
    const hash = typeof j.content_sha256 === "string" ? j.content_sha256.trim() : null;
    // eslint-disable-next-line no-console
    console.info("[agreement-vs01-seed-success]", {
      agreementId: id,
      documentId: docId,
      content_sha256: hash,
    });
    return { ok: true, documentId: docId, contentSha256: hash };
  } catch {
    // eslint-disable-next-line no-console
    console.warn("[agreement-vs01-seed-failed]", {
      agreementId: id,
      status: 0,
      detail: "network",
    });
    return { ok: false, reason: "network", httpStatus: 0, detail: "network" };
  }
}

/**
 * Paid Pro create-flow: seed VS01 and navigate to `/app/esign/:documentId?agreement_bridge=1`.
 * Does not change server seed behavior — same POST as SimpleSend sender-first.
 */
export async function tryNavigatePaidProAgreementSenderFirstVs01Esign(options: {
  navigate: (to: string) => void | Promise<void>;
  agreementId: string;
  draft: AgreementDraft | null;
  logReason: string;
  /** Live recipient-setup emails (LawDog intake); merged onto draft before bridge build. */
  recipientSetup?: RecipientSetupEmailInput | null;
  /** Reviewer-approved clean path (Simple done finalize) — VS01 shell shows reviewer-aware copy. */
  reviewerApprovedCleanHandoff?: boolean;
  /** Final agreement plain text for VS01 signature-block anchor placement. */
  agreementCorpusText?: string | null;
  guidedSigningHandoff?: GuidedVs01SigningHandoff | null;
}): Promise<boolean> {
  const id = String(options.agreementId || "").trim();
  if (!id) return false;
  const resolvedSetup = resolveRecipientSetupForVs01Bridge(
    options.draft,
    options.recipientSetup ?? null,
  );
  const merged = mergeLiveDraftWithRecipientSetupForVs01Bridge(options.draft, resolvedSetup);
  const handoff = options.guidedSigningHandoff ?? null;
  const mergedWithCorpus = mergeAgreementDraftWithGuidedSigningHandoff(merged ?? ({} as AgreementDraft), handoff);
  const freeBaselinePlain = mergedWithCorpus
    ? buildAgreementPreviewText(merged as unknown as Parameters<typeof buildAgreementPreviewText>[0], {
        starterPreview: true,
      })
    : "";
  const handoffText = resolveAgreementCorpusForPrepareHandoff({
    agreementId: id,
    draft: mergedWithCorpus,
    bridgeCorpusText: (handoff?.corpusText ?? options.agreementCorpusText ?? "").trim() || null,
  });
  const bridgeDraft = buildAgreementVs01BridgeSession({
    agreementId: id,
    vs01DocumentId: "pending",
    draft: mergedWithCorpus,
    senderFirstLawdogHandoff: true,
    reviewerApprovedCleanHandoff: Boolean(options.reviewerApprovedCleanHandoff),
    agreementCorpusText: handoffText,
  });
  const corpusResolution = resolveFinalVs01CorpusOrBlock({
    agreementCorpusText: handoffText,
    guidedPro: true,
    freeBaselinePlain,
    ...buildPrepareBridgeCorpusGateArgs({
      agreementCorpusText: handoffText,
      bridge: bridgeDraft,
      draft: mergedWithCorpus,
    }),
    guidedSigningHandoff: handoff,
    signatureRebuilt: handoff?.signatureRebuilt,
  });
  if (!corpusResolution.allowed) return false;

  const vs01Seed = await fetchAgreementVs01SigningSeed(
    id,
    mergedWithCorpus,
    corpusResolution.corpus,
    handoff?.source ?? corpusResolution.source,
  );
  if (!vs01Seed.ok) return false;
  logSignerMetadataBeforeVs01Bridge(merged, resolvedSetup);
  logAgreementVs01RecipientEmailMergeDiagnostics(merged, recipientSetupPlausibleInputFlags(resolvedSetup));
  const bridge = buildAgreementVs01BridgeSession({
    agreementId: id,
    vs01DocumentId: vs01Seed.documentId,
    draft: mergedWithCorpus,
    senderFirstLawdogHandoff: true,
    reviewerApprovedCleanHandoff: Boolean(options.reviewerApprovedCleanHandoff),
    agreementCorpusText: corpusResolution.corpus,
  });
  logAgreementVs01BridgePreflight(bridge);
  logVs01BridgeSignerMetadata(bridge);
  writeAgreementVs01BridgeSession(bridge);
  setPaidProAgreementBridgeSkipMarker(vs01Seed.documentId);
  const route = `/app/esign/${encodeURIComponent(vs01Seed.documentId)}?agreement_bridge=1`;
  logAgreementToVs01EsignRoute({
    agreementId: id,
    seedDocumentId: vs01Seed.documentId,
    route,
    reason: options.logReason,
    agreementBridgeMode: bridge.agreementBridgeMode ?? null,
    ownerIsPreparingPacket: bridge.ownerIsPreparingPacket ?? null,
  });
  void options.navigate(route);
  if (typeof import.meta === "undefined" || import.meta.env?.MODE !== "test") {
    const parties = (mergedWithCorpus?.parties ?? []) as AgreementParty[];
    const participants = participantsFromAgreementDraft(parties);
    const counts = countParticipantSignerMetadata(participants);
    // eslint-disable-next-line no-console
    console.info("[vs01-bridge-navigation-success]", {
      agreementId: id,
      route,
      reason: options.logReason,
      source: getLastVs01BridgeRecipientSetupSource(),
      participantCount: participants.length,
      ...counts,
    });
  }
  return true;
}

export type GuidedSignatureTrackLocalVs01BridgeResult =
  | { ok: true; route: string; documentId: string; agreementId: string }
  | { ok: false; reason: string };

/**
 * Direct signature track: open VS01 prepare from local bridge when draft POST is blocked (e.g. 403).
 * Does not call server draft or vs01-signing-seed — corpus + signer metadata come from the guided handoff.
 */
export function tryNavigateGuidedSignatureTrackLocalVs01Esign(options: {
  navigate: (to: string) => void | Promise<void>;
  localAgreementId: string;
  draft: AgreementDraft | null;
  logReason: string;
  recipientSetup?: RecipientSetupEmailInput | null;
  agreementCorpusText?: string | null;
  guidedSigningHandoff?: GuidedVs01SigningHandoff | null;
}): GuidedSignatureTrackLocalVs01BridgeResult {
  const id = String(options.localAgreementId || "").trim();
  if (!id) return { ok: false, reason: "missing_local_agreement_id" };

  const handoff = options.guidedSigningHandoff ?? null;
  if (!handoff) return { ok: false, reason: "missing_handoff" };

  const corpusAssert = assertGuidedProVs01BridgeCorpusReady(handoff);
  if (!corpusAssert.ok) {
    logGuidedProVs01BridgeCorpusBlocked({
      agreementId: id,
      source: options.logReason,
      reason: corpusAssert.reason,
      ...corpusAssert.diagnostics,
    });
    return { ok: false, reason: corpusAssert.reason ?? "corpus_not_ready" };
  }

  const resolvedSetup = resolveRecipientSetupForVs01Bridge(options.draft, options.recipientSetup ?? null);
  const merged = mergeLiveDraftWithRecipientSetupForVs01Bridge(options.draft, resolvedSetup);
  const mergedWithCorpus = mergeAgreementDraftWithGuidedSigningHandoff(merged ?? ({} as AgreementDraft), handoff);
  const handoffText = (handoff.corpusText ?? options.agreementCorpusText ?? "").trim();
  const corpusResolution = resolveFinalVs01CorpusOrBlock({
    agreementCorpusText: handoffText,
    guidedSigningHandoff: handoff,
    draft: mergedWithCorpus,
    guidedPro: true,
    premiumComplete: handoffText.length >= VS01_SIGNING_CORPUS_MIN_LEN,
    signatureRebuilt: handoff.signatureRebuilt,
  });
  if (!corpusResolution.allowed) return { ok: false, reason: "corpus_gate_blocked" };

  writeGuidedVs01SigningHandoffSession(handoff);

  const documentId =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? `local_doc_${crypto.randomUUID()}`
      : `local_doc_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

  const bridge = buildAgreementVs01BridgeSession({
    agreementId: id,
    vs01DocumentId: documentId,
    draft: mergedWithCorpus,
    senderFirstLawdogHandoff: true,
    agreementCorpusText: corpusResolution.corpus,
  });
  logAgreementVs01BridgePreflight(bridge);
  logVs01BridgeSignerMetadata(bridge);
  writeAgreementVs01BridgeSession(bridge);
  setPaidProAgreementBridgeSkipMarker(documentId);

  const route = `/app/esign/${encodeURIComponent(documentId)}?agreement_bridge=1`;
  logAgreementToVs01EsignRoute({
    agreementId: id,
    seedDocumentId: documentId,
    route,
    reason: options.logReason,
    agreementBridgeMode: bridge.agreementBridgeMode ?? null,
    ownerIsPreparingPacket: bridge.ownerIsPreparingPacket ?? null,
  });
  void options.navigate(route);
  return { ok: true, route, documentId, agreementId: id };
}
