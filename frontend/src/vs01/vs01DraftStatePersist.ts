/**
 * Persist in-progress VS01 e-sign setup (placed fields, signers, step) across refresh.
 * Keyed by documentId in sessionStorage; cleared on explicit reset or post-sign completion.
 */
import type { PlacedSigningField } from "./signingFields";
import type { Vs01Counterparty, Vs01RecipientPlacedField, Vs01SenderSignatureRef, Vs01Step } from "./types";

const KEY_PREFIX = "claw_vs01_draft_state_v1_";

export type Vs01DraftState = {
  v: 1;
  documentId: string;
  step: Vs01Step;
  furthestStep: Vs01Step;
  agreementTitle: string;
  creatorName: string;
  creatorEmail: string;
  senderMessage: string;
  counterparties: Vs01Counterparty[];
  senderPlacedFields: PlacedSigningField[];
  recipientPlacedFields: Vs01RecipientPlacedField[];
  senderSignatureRef: Vs01SenderSignatureRef | null;
  /** Typed-name value from the signing step (survives mode switch). */
  signatureTypedName?: string;
  savedAt: number;
};

function keyFor(documentId: string): string {
  return `${KEY_PREFIX}${documentId.trim()}`;
}

function diagEnabled(): boolean {
  if (typeof window === "undefined") return false;
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return false;
  return (
    Boolean(typeof import.meta !== "undefined" && import.meta.env?.DEV) ||
    window.localStorage?.getItem("lawdogVs01PersistDiag") === "1"
  );
}

export function saveVs01DraftState(state: Vs01DraftState): void {
  const did = (state.documentId || "").trim();
  if (!did) return;
  try {
    sessionStorage.setItem(keyFor(did), JSON.stringify(state));
  } catch {
    /* ignore — quota */
  }
  if (diagEnabled()) {
    // eslint-disable-next-line no-console
    console.info("[vs01-draft-state-save]", {
      documentId: did,
      fieldCount: state.senderPlacedFields.length + state.recipientPlacedFields.length,
      signerCount: state.counterparties.length,
      currentStep: state.step,
      reason: "auto",
    });
  }
}

export function loadVs01DraftState(documentId: string | null | undefined): Vs01DraftState | null {
  const did = (documentId || "").trim();
  if (!did) return null;
  try {
    const raw = sessionStorage.getItem(keyFor(did));
    if (!raw) return null;
    const o = JSON.parse(raw) as Vs01DraftState;
    if (o?.v !== 1 || o.documentId?.trim() !== did) return null;
    if (!Array.isArray(o.counterparties)) return null;
    if (!Array.isArray(o.senderPlacedFields)) o.senderPlacedFields = [];
    if (!Array.isArray(o.recipientPlacedFields)) o.recipientPlacedFields = [];
    if (diagEnabled()) {
      // eslint-disable-next-line no-console
      console.info("[vs01-draft-state-hydrate]", {
        documentId: did,
        fieldCount: o.senderPlacedFields.length + o.recipientPlacedFields.length,
        signerCount: o.counterparties.length,
        currentStep: o.step,
        reason: "load",
      });
    }
    return o;
  } catch {
    return null;
  }
}

export function clearVs01DraftState(documentId: string | null | undefined, reason: string): void {
  const did = (documentId || "").trim();
  if (!did) return;
  try {
    sessionStorage.removeItem(keyFor(did));
  } catch {
    /* ignore */
  }
  if (diagEnabled()) {
    // eslint-disable-next-line no-console
    console.info("[vs01-draft-state-clear]", { documentId: did, reason });
  }
}

/**
 * Merge bridge signer emails into saved counterparties: fill blanks, never overwrite non-empty.
 */
export function mergeBridgeEmailsIntoSavedCounterparties(
  saved: Vs01Counterparty[],
  bridge: Vs01Counterparty[],
): Vs01Counterparty[] {
  return saved.map((s, i) => {
    const b = bridge[i];
    if (!b) return s;
    const existingEmail = (s.email || "").trim();
    const bridgeEmail = (b.email || "").trim();
    if (existingEmail) return s;
    if (!bridgeEmail) return s;
    return { ...s, email: bridgeEmail };
  });
}
