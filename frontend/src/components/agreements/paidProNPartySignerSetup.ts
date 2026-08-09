import {
  PAID_PRO_AUTHORITY_MAX_PARTIES,
  PAID_PRO_GTM_MAX_SIGNING_PARTIES,
} from "./paidProAuthorityLimits";

export { PAID_PRO_GTM_MAX_SIGNING_PARTIES } from "./paidProAuthorityLimits";
import { countRealParties } from "./starterPartyLimits";
import {
  consumeAuthoritativeSignerCount,
  resolveAuthoritativeSignerCount,
} from "./signerCountAuthority";
import { readFrozenCanonicalManifestPartyCount } from "./frozenCanonicalManifestAuthority";
import { readConsumedPaidProSignerMetadataAuthority } from "./paidProSignerMetadataAuthority";
import { resolveAuthoritativePartySlotCount } from "./partySlotIdentityNormalize";
import { looksLikeEmail, stripRecipientEmailNoise } from "./recipientEmailValidation";
import {
  resolveSignerPartyLegalEntityDisplayValue,
  type SignerSetupPartyIdentity,
} from "./signerSetupPartyIdentity";
import type { RecipientSetupEmailInput } from "../../launch/simpleProduct/agreementToVs01SigningBridge";
import type { AgreementVs01BridgeSession } from "../../launch/simpleProduct/agreementToVs01SigningBridge";
import {
  buildVs01PrepareSigningRoles,
  type Vs01PrepareSigningRole,
} from "../../vs01/vs01SignerFieldAssignment";
import type { AgreementDraft, AgreementParty } from "../../agreement/agreementTypes";
import type { Vs01Counterparty } from "../../vs01/types";
import {
  frozenSnapshotToLegalPartyRows,
  type FrozenSigningAuthoritySnapshotV1,
} from "./frozenSigningAuthoritySnapshot";
import {
  isPostFreezeLifecycle,
  type SigningAuthorityLifecycleMode,
} from "./signingAuthorityLifecycle";

/** UI cap for explicit multi-party signer setup (handoff supports more). */
export const PAID_PRO_SIGNER_SETUP_MAX_UI_PARTIES = PAID_PRO_AUTHORITY_MAX_PARTIES;

export const PAID_PRO_COORDINATOR_TOGGLE_LABEL =
  "I'm coordinating this agreement, not signing as a party";

export const PAID_PRO_COORDINATOR_TOGGLE_HELPER =
  "You can prepare and send this agreement without being listed as a legal party or required signer.";

export const PAID_PRO_ADD_ANOTHER_PARTY_LABEL = "Add another party";

export const PAID_PRO_REMOVE_PARTY_LABEL = "Remove party";

export function formatSignerSetupBeyondGeneratedWarningTitle(generatedPartyCount: number): string {
  const n = Math.max(2, Math.min(generatedPartyCount, PAID_PRO_SIGNER_SETUP_MAX_UI_PARTIES));
  return `This agreement was drafted for ${n} legal parties.`;
}

export function formatSignerSetupBeyondGeneratedWarningBody(): string {
  return "To add another legal party, regenerate the agreement so the agreement text, review flow, signature blocks, signer roles, and signing invitations stay synchronized.";
}

export function formatSignerSetupBeyondGeneratedWarning(generatedPartyCount: number): string {
  return `${formatSignerSetupBeyondGeneratedWarningTitle(generatedPartyCount)} ${formatSignerSetupBeyondGeneratedWarningBody()}`;
}

export type ResolveGeneratedAgreementPartyCountArgs = {
  draftParties?: readonly { name?: string | null }[];
  corpusPlain?: string | null;
  intakeText?: string | null;
};

/**
 * Stable generated agreement party count — excludes user-added placeholder rows
 * (e.g. "Party 3") and prefers corpus signature blocks when present.
 */
export function resolveGeneratedAgreementPartyCount(args: ResolveGeneratedAgreementPartyCountArgs): number {
  return resolveAuthoritativeSignerCount({
    intakeText: args.intakeText,
    draftParties: args.draftParties,
    corpusPlain: args.corpusPlain,
    rawPartyCount: countRealParties(args.draftParties),
  }).count;
}

export function isSignerSetupBeyondGeneratedPartyCount(args: {
  signerSetupUiPartyCount: number;
  generatedPartyCount: number;
}): boolean {
  const generated = Math.max(
    2,
    Math.min(args.generatedPartyCount, PAID_PRO_SIGNER_SETUP_MAX_UI_PARTIES),
  );
  return args.signerSetupUiPartyCount > generated;
}

export function evaluateSignerSetupGeneratedPartyGuard(args: {
  signerSetupUiPartyCount: number;
  generatedPartyCount: number;
}): { beyondGenerated: boolean; warningMessage: string | null } {
  const beyondGenerated = isSignerSetupBeyondGeneratedPartyCount(args);
  return {
    beyondGenerated,
    warningMessage: beyondGenerated
      ? formatSignerSetupBeyondGeneratedWarning(args.generatedPartyCount)
      : null,
  };
}

/** User-added parties only — removable from the end (Party 3/4), never Party 1 or 2. */
export function canRemoveSignerSetupParty(partyIndex: number, uiPartyCount: number): boolean {
  return partyIndex >= 2 && partyIndex === uiPartyCount - 1;
}

export type RemoveAddedSignerPartyStateInput = {
  signerSetupUiPartyCount: number;
  extraPartyLegalNames: readonly string[];
  extraPartyReviewEmails: readonly string[];
  partySignerNames: readonly string[];
  partySignerTitles: readonly string[];
  partyAddresses: readonly string[];
};

export type RemoveAddedSignerPartyStateResult = {
  signerSetupUiPartyCount: number;
  extraPartyLegalNames: string[];
  extraPartyReviewEmails: string[];
  partySignerNames: string[];
  partySignerTitles: string[];
  partyAddresses: string[];
};

/** Clears the removed party's signer fields and decrements UI party count. */
export function removeAddedSignerPartyState(
  partyIndex: number,
  state: RemoveAddedSignerPartyStateInput,
): RemoveAddedSignerPartyStateResult | null {
  if (!canRemoveSignerSetupParty(partyIndex, state.signerSetupUiPartyCount)) return null;
  const extraLegalNames = [...state.extraPartyLegalNames];
  const extraReviewEmails = [...state.extraPartyReviewEmails];
  const partySignerNames = [...state.partySignerNames];
  const partySignerTitles = [...state.partySignerTitles];
  const partyAddresses = [...state.partyAddresses];
  if (partyIndex >= 2) {
    const extraIdx = partyIndex - 2;
    if (extraIdx < extraLegalNames.length) extraLegalNames.splice(extraIdx, 1);
    if (extraIdx < extraReviewEmails.length) extraReviewEmails.splice(extraIdx, 1);
  }
  if (partyIndex < partySignerNames.length) partySignerNames.splice(partyIndex, 1);
  if (partyIndex < partySignerTitles.length) partySignerTitles.splice(partyIndex, 1);
  if (partyIndex < partyAddresses.length) partyAddresses.splice(partyIndex, 1);
  return {
    signerSetupUiPartyCount: state.signerSetupUiPartyCount - 1,
    extraPartyLegalNames: extraLegalNames,
    extraPartyReviewEmails: extraReviewEmails,
    partySignerNames,
    partySignerTitles,
    partyAddresses,
  };
}

export function applySignerSetupGeneratedPartyGuardToGate<T extends { complete: boolean; blockerMessage: string | null; ctaLabel: string }>(
  gate: T,
  guard: { beyondGenerated: boolean; warningMessage: string | null },
  incompleteCtaLabel: string,
): T {
  if (!guard.beyondGenerated) return gate;
  return {
    ...gate,
    complete: false,
    blockerMessage: guard.warningMessage ?? gate.blockerMessage,
    ctaLabel: incompleteCtaLabel,
  };
}

export type PaidProSignerSetupUiState = {
  creatorCoordinatorOnly: boolean;
  signerSetupUiPartyCount: number;
  draftParties: readonly { id?: string; name?: string; role?: string; email?: string }[];
  recipient1Name: string;
  recipient2Name: string;
  extraPartyLegalNames: readonly string[];
  recipient1Email: string;
  recipient2Email: string;
  extraPartyReviewEmails: readonly string[];
  partySignerNames: readonly string[];
  partySignerTitles: readonly string[];
  partyAddresses: readonly string[];
  signerSetupPartyIdentities?: readonly SignerSetupPartyIdentity[];
  intakeText?: string | null;
};

export function resolveSignerSetupUiPartyCount(
  state: Pick<PaidProSignerSetupUiState, "signerSetupUiPartyCount" | "draftParties" | "intakeText">,
): number {
  const frozenCount = readFrozenCanonicalManifestPartyCount();
  const consumedCount =
    readConsumedPaidProSignerMetadataAuthority()?.parties?.filter(
      (p) => String(p.partyLegalName ?? "").trim().length >= 2,
    ).length ?? 0;
  const draftNames = state.draftParties.map((p) => String(p.name ?? "").trim()).filter(Boolean);
  const slotCount = resolveAuthoritativePartySlotCount({
    intakeText: state.intakeText ?? "",
    draftPartyNames: draftNames,
    userExpandedPartyCount: state.signerSetupUiPartyCount,
  });
  const manifestPartyCount = Math.max(
    frozenCount,
    consumedCount,
    slotCount >= 3 ? slotCount : 0,
  );
  const rawUi = Math.min(
    Math.max(state.signerSetupUiPartyCount, state.draftParties.length, frozenCount, 2),
    PAID_PRO_SIGNER_SETUP_MAX_UI_PARTIES,
  );
  const resolution = resolveAuthoritativeSignerCount({
    intakeText: state.intakeText,
    draftParties: state.draftParties,
    userExpandedPartyCount: state.signerSetupUiPartyCount,
    rawPartyCount: rawUi,
    manifestPartyCount,
  });
  return consumeAuthoritativeSignerCount(
    "signer_setup_ui_party_count",
    {
      intakeText: state.intakeText,
      draftParties: state.draftParties,
      userExpandedPartyCount: state.signerSetupUiPartyCount,
      rawPartyCount: rawUi,
      manifestPartyCount,
    },
    resolution.count,
  );
}

/**
 * Add-party expands only by explicit user action, up to the GTM signing ceiling (2–4).
 * Does not jump to authority max slots on first review.
 */
export function canAddAnotherSignerParty(signerSetupUiPartyCount: number): boolean {
  return signerSetupUiPartyCount < PAID_PRO_GTM_MAX_SIGNING_PARTIES;
}

/** Initial / synced signer-setup row count from intake+draft — min 2, max GTM 4. */
export function resolveInitialSignerSetupPartyCount(args: {
  generatedPartyCount: number;
  intakeText?: string | null;
  draftParties?: readonly { name?: string | null }[];
}): number {
  const generated = resolveGeneratedAgreementPartyCount({
    draftParties: args.draftParties,
    intakeText: args.intakeText,
  });
  const n = Math.max(args.generatedPartyCount, generated, 2);
  return Math.min(n, PAID_PRO_GTM_MAX_SIGNING_PARTIES);
}

export function resolveLegalEntityNameForPartyIndex(
  state: PaidProSignerSetupUiState,
  index: number,
): string {
  const slotIdentities =
    state.signerSetupPartyIdentities ??
    state.draftParties.map((p) => ({ legalEntityName: String(p.name ?? "").trim() } as SignerSetupPartyIdentity));
  const fromRecipient =
    index === 0 ? state.recipient1Name : index === 1 ? state.recipient2Name : state.extraPartyLegalNames[index - 2] ?? "";
  const fromDraft = String(state.draftParties[index]?.name ?? "").trim();
  return (
    resolveSignerPartyLegalEntityDisplayValue({
      slotIndex: index,
      currentInputValue: fromRecipient,
      slotIdentities,
      source: "n_party_signer_setup",
    }) ||
    fromDraft ||
    ""
  );
}

function emailForPartyIndex(state: PaidProSignerSetupUiState, index: number): string {
  if (index === 0) return stripRecipientEmailNoise(state.recipient1Email);
  if (index === 1) return stripRecipientEmailNoise(state.recipient2Email);
  return stripRecipientEmailNoise(state.extraPartyReviewEmails[index - 2] ?? "");
}

export type BuildLegalPartiesFromSignerSetupArgs = {
  lifecycleMode?: SigningAuthorityLifecycleMode;
  /** Required when lifecycleMode is post-freeze — injected by orchestrating layer. */
  frozenSnapshot?: FrozenSigningAuthoritySnapshotV1 | null;
};

/** Build {@link AgreementParty} rows for VS01 role generation from live signer-setup UI. */
export function buildLegalPartiesFromSignerSetupState(
  state: PaidProSignerSetupUiState,
  opts?: BuildLegalPartiesFromSignerSetupArgs,
): AgreementParty[] {
  const mode = opts?.lifecycleMode ?? "pre_freeze";
  const injected = opts?.frozenSnapshot ?? null;

  if (isPostFreezeLifecycle(mode)) {
    if (!injected?.parties.length) {
      return [];
    }
    return frozenSnapshotToLegalPartyRows(injected).map((row) => ({
      id: row.id,
      name: row.name,
      role: row.role,
      email: row.email,
      signerName: row.signerName,
      signerTitle: row.signerTitle,
      signerEmail: row.signerEmail,
      reviewEmail: row.email,
      requiresSignature: row.requiresSignature,
    }));
  }

  if (injected?.parties.length) {
    return frozenSnapshotToLegalPartyRows(injected).map((row) => ({
      id: row.id,
      name: row.name,
      role: row.role,
      email: row.email,
      signerName: row.signerName,
      signerTitle: row.signerTitle,
      signerEmail: row.signerEmail,
      reviewEmail: row.email,
      requiresSignature: row.requiresSignature,
    }));
  }
  const count = resolveSignerSetupUiPartyCount(state);
  const out: AgreementParty[] = [];
  for (let i = 0; i < count; i++) {
    const name = resolveLegalEntityNameForPartyIndex(state, i).trim();
    if (!name) continue;
    const email = emailForPartyIndex(state, i);
    const draftRow = state.draftParties[i];
    const role = state.creatorCoordinatorOnly ? "party" : i === 0 ? "owner" : "party";
    out.push({
      id: draftRow?.id && String(draftRow.id).trim() ? String(draftRow.id).trim() : `party_${i}`,
      name,
      role,
      email: looksLikeEmail(email) ? email : draftRow?.email,
      signerName: (state.partySignerNames[i] ?? "").trim() || undefined,
      signerTitle: (state.partySignerTitles[i] ?? "").trim() || undefined,
      signerEmail: looksLikeEmail(email) ? email : undefined,
      reviewEmail: looksLikeEmail(email) ? email : undefined,
      requiresSignature: true,
    });
  }
  return out;
}

export function paidProSignerSetupUiStateFromRecipientSetup(
  draftParties: readonly AgreementParty[],
  setup: RecipientSetupEmailInput | null | undefined,
  partySignerNames: readonly string[],
  partySignerTitles: readonly string[],
): PaidProSignerSetupUiState {
  const partyEmails = setup?.recipientPartyEmails;
  const extraEmails =
    Array.isArray(partyEmails) && partyEmails.length > 0
      ? partyEmails.slice(2).map((x) => String(x ?? ""))
      : [];
  const legalExtras = (setup?.recipientPartyLegalNames ?? []).map((x) => String(x ?? ""));
  const uiCount = Math.max(setup?.signerSetupUiPartyCount ?? 0, draftParties.length, 2);
  return {
    creatorCoordinatorOnly: Boolean(setup?.creatorCoordinatorOnly),
    signerSetupUiPartyCount: Math.min(uiCount, PAID_PRO_SIGNER_SETUP_MAX_UI_PARTIES),
    draftParties,
    recipient1Name: String(setup?.recipient1Name ?? draftParties[0]?.name ?? ""),
    recipient2Name: String(setup?.recipient2Name ?? draftParties[1]?.name ?? ""),
    extraPartyLegalNames: legalExtras,
    recipient1Email: String(setup?.recipient1Email ?? partyEmails?.[0] ?? ""),
    recipient2Email: String(setup?.recipient2Email ?? partyEmails?.[1] ?? ""),
    extraPartyReviewEmails: extraEmails,
    partySignerNames,
    partySignerTitles,
    partyAddresses: [],
    intakeText: null,
  };
}

export function mergeNPartySignerSetupIntoDraft(
  draft: AgreementDraft | null,
  setup: RecipientSetupEmailInput | null | undefined,
): AgreementDraft | null {
  if (!draft) return draft;
  const ui = paidProSignerSetupUiStateFromRecipientSetup(
    draft.parties ?? [],
    setup,
    setup?.recipientPartySignerNames?.map((x) => String(x ?? "")) ?? [],
    setup?.recipientPartySignerTitles?.map((x) => String(x ?? "")) ?? [],
  );
  const legalParties = buildLegalPartiesFromSignerSetupState(ui);
  const coordinatorOnly = Boolean(setup?.creatorCoordinatorOnly);
  const parties = [...(draft.parties ?? [])] as AgreementParty[];
  const targetCount = resolveSignerSetupUiPartyCount(ui);
  while (parties.length < targetCount) {
    const idx = parties.length;
    parties.push({
      id: `party_${idx}`,
      name: legalParties[idx]?.name ?? `Party ${idx + 1}`,
      role: coordinatorOnly ? "party" : idx === 0 ? "owner" : "party",
      email: "",
    });
  }
  let changed = draft.creator_coordinator_only !== coordinatorOnly;
  for (let i = 0; i < targetCount; i++) {
    const next = legalParties[i];
    if (!next) continue;
    const prev = parties[i];
    const merged: AgreementParty = {
      ...prev,
      ...next,
      id: prev?.id ?? next.id,
      role: next.role,
      name: next.name,
    };
    if (
      prev?.name !== merged.name ||
      prev?.role !== merged.role ||
      prev?.email !== merged.email ||
      prev?.signerName !== merged.signerName ||
      prev?.signerTitle !== merged.signerTitle
    ) {
      parties[i] = merged;
      changed = true;
    }
  }
  if (!changed) return draft;
  return {
    ...draft,
    parties,
    creator_coordinator_only: coordinatorOnly,
  };
}

export function resolveBridgeCreatorIsParty(
  bridge: Pick<AgreementVs01BridgeSession, "creatorIsParty" | "legalParties"> | null | undefined,
  draftCoordinatorOnly?: boolean | null,
): boolean {
  if (draftCoordinatorOnly) return false;
  if (bridge?.creatorIsParty === false) return false;
  return true;
}

export function buildVs01PrepareSigningRolesForBridge(args: {
  agreementId: string;
  creatorName: string;
  creatorEmail: string;
  ownerSignerName?: string;
  ownerSignerTitle?: string;
  counterparties: Vs01Counterparty[];
  bridge?: Pick<AgreementVs01BridgeSession, "creatorIsParty" | "legalParties"> | null;
}): Vs01PrepareSigningRole[] {
  const creatorIsParty = resolveBridgeCreatorIsParty(args.bridge);
  const legalParties = args.bridge?.legalParties;
  return buildVs01PrepareSigningRoles({
    agreementId: args.agreementId,
    creatorName: args.creatorName,
    creatorEmail: args.creatorEmail,
    ownerSignerName: args.ownerSignerName,
    ownerSignerTitle: args.ownerSignerTitle,
    counterparties: args.counterparties,
    creatorIsParty,
    legalParties,
  });
}
