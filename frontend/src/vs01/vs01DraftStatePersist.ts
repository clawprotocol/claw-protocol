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
  /** Owner human representative (optional; separate from entity {@link creatorName}). */
  creatorSignerName?: string;
  creatorSignerTitle?: string;
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
      step: state.step,
      senderPlacedFields: state.senderPlacedFields.length,
      recipientPlacedFields: state.recipientPlacedFields.length,
      counterparties: state.counterparties.length,
    });
  }
}

export function loadVs01DraftState(documentId: string | null | undefined): Vs01DraftState | null {
  const did = (documentId || "").trim();
  if (!did) {
    if (diagEnabled()) {
      // eslint-disable-next-line no-console
      console.info("[vs01-draft-state-load-miss]", { documentId: did, reason: "empty_id" });
    }
    return null;
  }
  try {
    const raw = sessionStorage.getItem(keyFor(did));
    if (!raw) {
      if (diagEnabled()) {
        // eslint-disable-next-line no-console
        console.info("[vs01-draft-state-load-miss]", { documentId: did, reason: "no_entry" });
      }
      return null;
    }
    const o = JSON.parse(raw) as Vs01DraftState;
    if (o?.v !== 1 || o.documentId?.trim() !== did) {
      if (diagEnabled()) {
        // eslint-disable-next-line no-console
        console.info("[vs01-draft-state-load-miss]", { documentId: did, reason: "version_mismatch" });
      }
      return null;
    }
    if (!Array.isArray(o.counterparties)) return null;
    if (!Array.isArray(o.senderPlacedFields)) o.senderPlacedFields = [];
    if (!Array.isArray(o.recipientPlacedFields)) o.recipientPlacedFields = [];
    if (diagEnabled()) {
      // eslint-disable-next-line no-console
      console.info("[vs01-draft-state-hydrate]", {
        documentId: did,
        step: o.step,
        senderPlacedFields: o.senderPlacedFields.length,
        recipientPlacedFields: o.recipientPlacedFields.length,
        counterparties: o.counterparties.length,
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
  return mergeBridgeMetadataIntoSavedCounterparties(saved, bridge);
}

/**
 * Merge bridge emails and signer metadata into saved counterparties (fill blanks only).
 */
function normalizeBridgeLookupKey(name: string, email: string): string {
  return `${name.trim().toLowerCase()}|${email.trim().toLowerCase()}`;
}

function resolveBridgeRowForSaved(
  saved: Vs01Counterparty,
  index: number,
  bridgeById: Map<string, Vs01Counterparty>,
  bridgeByKey: Map<string, Vs01Counterparty>,
  bridge: Vs01Counterparty[],
): Vs01Counterparty | undefined {
  return (
    bridgeById.get(saved.id) ??
    bridgeByKey.get(normalizeBridgeLookupKey(saved.name, saved.email)) ??
    bridge[index]
  );
}

export function mergeBridgeMetadataIntoSavedCounterparties(
  saved: Vs01Counterparty[],
  bridge: Vs01Counterparty[],
): Vs01Counterparty[] {
  const bridgeById = new Map(bridge.map((b) => [b.id, b]));
  const bridgeByKey = new Map(
    bridge.map((b) => [normalizeBridgeLookupKey(b.name, b.email), b] as const),
  );
  return saved.map((s, i) => {
    const b = resolveBridgeRowForSaved(s, i, bridgeById, bridgeByKey, bridge);
    if (!b) return s;
    let next: Vs01Counterparty = { ...s };
    const existingEmail = (s.email || "").trim();
    const bridgeEmail = (b.email || "").trim();
    if (!existingEmail && bridgeEmail) next = { ...next, email: bridgeEmail };
    if (!(s.signerName || "").trim() && (b.signerName || "").trim()) {
      next = { ...next, signerName: b.signerName };
    }
    if (!(s.signerTitle || "").trim() && (b.signerTitle || "").trim()) {
      next = { ...next, signerTitle: b.signerTitle };
    }
    return next;
  });
}
