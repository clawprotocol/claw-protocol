import type { AgreementParty } from "../../agreement/agreementTypes";
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
import type { Vs01Counterparty } from "../../vs01/types";

/** UI cap for explicit multi-party signer setup (handoff supports more). */
export const PAID_PRO_SIGNER_SETUP_MAX_UI_PARTIES = 4;

export const PAID_PRO_COORDINATOR_TOGGLE_LABEL =
  "I'm coordinating this agreement, not signing as a party";

export const PAID_PRO_COORDINATOR_TOGGLE_HELPER =
  "You can prepare and send this agreement without being listed as a legal party or required signer.";

export const PAID_PRO_ADD_ANOTHER_PARTY_LABEL = "Add another party";

export type PaidProSignerSetupUiState = {
  creatorCoordinatorOnly: boolean;
  signerSetupUiPartyCount: number;
  draftParties: readonly { id?: string; name?: string; role?: string }[];
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

export function resolveSignerSetupUiPartyCount(state: Pick<PaidProSignerSetupUiState, "signerSetupUiPartyCount" | "draftParties">): number {
  const raw = Math.max(state.signerSetupUiPartyCount, state.draftParties.length, 2);
  return Math.min(raw, PAID_PRO_SIGNER_SETUP_MAX_UI_PARTIES);
}

export function canAddAnotherSignerParty(signerSetupUiPartyCount: number): boolean {
  return signerSetupUiPartyCount < PAID_PRO_SIGNER_SETUP_MAX_UI_PARTIES;
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

/** Build {@link AgreementParty} rows for VS01 role generation from live signer-setup UI. */
export function buildLegalPartiesFromSignerSetupState(state: PaidProSignerSetupUiState): AgreementParty[] {
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
  draft: { parties?: AgreementParty[]; creator_coordinator_only?: boolean } | null,
  setup: RecipientSetupEmailInput | null | undefined,
): typeof draft {
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
  if (bridge?.creatorIsParty === false) return false;
  if (bridge?.legalParties?.length && bridge.creatorIsParty === false) return false;
  if (draftCoordinatorOnly) return false;
  return bridge?.creatorIsParty !== false;
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
