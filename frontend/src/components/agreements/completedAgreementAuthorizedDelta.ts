/**
 * Phase 3C — authorized-delta validation between frozen corpus and completed agreement.
 * Permits only signing mutations; rejects substantive legal changes.
 */

import type {
  FrozenSigningAuthoritySnapshotV1,
} from "./frozenSigningAuthoritySnapshot";
import { extractRequiredSigningActions } from "./frozenSigningAuthoritySnapshot";
import { hashPaidProCorpus } from "./paidProSourceOfTruth";

export type CompletedAgreementDeltaError =
  | "corpus_hash_mismatch_baseline"
  | "legal_entity_mutation"
  | "execution_heading_mutation"
  | "operative_clause_mutation"
  | "party_order_mutation"
  | "unauthorized_signer_field"
  | "unauthorized_initials_location"
  | "duplicate_action_completion"
  | "superseded_packet_action"
  | "missing_required_action"
  | "signer_party_mismatch";

export type CompletedActionRecord = {
  actionId: string;
  signerRecordId: string;
  agreementPartyId: string;
  fieldId: string;
  type: "signature" | "initials" | "date";
  completedAt?: string;
  anchor?: string;
  packetRevision?: string;
};

export type ValidateCompletedAgreementAuthorizedDeltaArgs = {
  frozenCorpus: string;
  completedCorpus: string;
  snapshot: FrozenSigningAuthoritySnapshotV1;
  completedActions: readonly CompletedActionRecord[];
  activePacketRevision?: string;
};

export type ValidateCompletedAgreementAuthorizedDeltaResult =
  | { ok: true; authorizedTailHash: string }
  | { ok: false; error: CompletedAgreementDeltaError; detail?: string };

const WITNESS_RE = /\bIN WITNESS WHEREOF\b/i;
const SIGNATURE_LINE_RE = /^(?:By|Signature)\s*:/i;
const INITIALS_LINE_RE = /^Initials\s*:/i;
const DATE_LINE_RE = /^Date\s*:/i;
const NAME_LINE_RE = /^Name\s*:/i;
const TITLE_LINE_RE = /^Title\s*:/i;

function witnessStartIndex(corpus: string): number {
  const match = corpus.search(WITNESS_RE);
  if (match >= 0) return match;
  return Math.floor(corpus.length * 0.72);
}

function normalizeOperativeCorpus(corpus: string): string {
  const operativeEnd = witnessStartIndex(corpus);
  return corpus
    .slice(0, operativeEnd)
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeExecutionTail(corpus: string): string {
  const tail = corpus.slice(witnessStartIndex(corpus));
  return tail
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => {
      if (!line) return false;
      if (SIGNATURE_LINE_RE.test(line)) return false;
      if (INITIALS_LINE_RE.test(line)) return false;
      if (DATE_LINE_RE.test(line)) return false;
      if (NAME_LINE_RE.test(line)) return false;
      if (TITLE_LINE_RE.test(line)) return false;
      if (/_{3,}/.test(line)) return false;
      if (/^\[SIGNED:/i.test(line)) return false;
      return true;
    })
    .join("\n")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function extractExecutionHeadings(corpus: string): string[] {
  const tail = corpus.slice(witnessStartIndex(corpus));
  const headings: string[] = [];
  for (const line of tail.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.endsWith(":")) continue;
    if (/^(By|Name|Title|Date|Initials|Signature)\s*:/i.test(trimmed)) continue;
    if (trimmed.length >= 3 && trimmed.length <= 120) headings.push(trimmed.toLowerCase());
  }
  return headings;
}

function partyNamesFromSnapshot(snapshot: FrozenSigningAuthoritySnapshotV1): string[] {
  return [...snapshot.parties]
    .sort((a, b) => a.canonicalOrder - b.canonicalOrder)
    .map((p) => p.legalEntityName.trim().toLowerCase())
    .filter(Boolean);
}

export function validateCompletedAgreementAuthorizedDelta(
  args: ValidateCompletedAgreementAuthorizedDeltaArgs,
): ValidateCompletedAgreementAuthorizedDeltaResult {
  const frozenOperative = normalizeOperativeCorpus(args.frozenCorpus);
  const completedOperative = normalizeOperativeCorpus(args.completedCorpus);

  if (frozenOperative !== completedOperative) {
    return { ok: false, error: "operative_clause_mutation", detail: "operative_body_differs" };
  }

  const frozenHeadings = extractExecutionHeadings(args.frozenCorpus);
  const completedHeadings = extractExecutionHeadings(args.completedCorpus);
  if (frozenHeadings.join("|") !== completedHeadings.join("|")) {
    return { ok: false, error: "execution_heading_mutation" };
  }

  const frozenParties = partyNamesFromSnapshot(args.snapshot);
  const completedLower = args.completedCorpus.toLowerCase();
  for (const name of frozenParties) {
    if (!completedLower.includes(name)) {
      return { ok: false, error: "legal_entity_mutation", detail: name };
    }
  }

  const expectedPartyOrder = args.snapshot.execution.partyOrder.join("|");
  const derivedOrder = [...args.snapshot.parties]
    .sort((a, b) => a.canonicalOrder - b.canonicalOrder)
    .map((p) => p.agreementPartyId)
    .join("|");
  if (expectedPartyOrder !== derivedOrder) {
    return { ok: false, error: "party_order_mutation" };
  }

  const requiredActions = extractRequiredSigningActions(args.snapshot);
  const requiredIds = new Set(requiredActions.filter((a) => a.required).map((a) => a.actionId));
  const completedIds = new Set<string>();

  for (const action of args.completedActions) {
    if (args.activePacketRevision && action.packetRevision && action.packetRevision !== args.activePacketRevision) {
      return { ok: false, error: "superseded_packet_action", detail: action.actionId };
    }
    const signer = args.snapshot.signers.find((s) => s.signerRecordId === action.signerRecordId);
    if (!signer || signer.agreementPartyId !== action.agreementPartyId) {
      return { ok: false, error: "signer_party_mismatch", detail: action.signerRecordId };
    }
    const allowed = requiredActions.some(
      (a) =>
        a.actionId === action.actionId ||
        (a.signerRecordId === action.signerRecordId && a.type === action.type),
    );
    if (!allowed && action.type !== "date") {
      return { ok: false, error: "unauthorized_signer_field", detail: action.actionId };
    }
    if (completedIds.has(action.actionId)) {
      return { ok: false, error: "duplicate_action_completion", detail: action.actionId };
    }
    completedIds.add(action.actionId);
  }

  for (const actionId of requiredIds) {
    if (!completedIds.has(actionId)) {
      return { ok: false, error: "missing_required_action", detail: actionId };
    }
  }

  const authorizedTailHash = hashPaidProCorpus(normalizeExecutionTail(args.completedCorpus));
  return { ok: true, authorizedTailHash };
}

export function assertAllRequiredActionsComplete(args: {
  snapshot: FrozenSigningAuthoritySnapshotV1;
  completedActions: readonly CompletedActionRecord[];
  packetState?: string;
}): { ok: true } | { ok: false; error: CompletedAgreementDeltaError; detail?: string } {
  if ((args.packetState ?? "").toLowerCase() === "superseded") {
    return { ok: false, error: "superseded_packet_action" };
  }
  const required = extractRequiredSigningActions(args.snapshot).filter((a) => a.required);
  const done = new Set(args.completedActions.map((a) => a.actionId));
  for (const action of required) {
    if (!done.has(action.actionId)) {
      return { ok: false, error: "missing_required_action", detail: action.actionId };
    }
  }
  return { ok: true };
}

export function completedActionsFromSnapshotSigners(
  snapshot: FrozenSigningAuthoritySnapshotV1,
  completedSignerRecordIds: readonly string[],
  opts?: { packetRevision?: string; completedAt?: string },
): CompletedActionRecord[] {
  const done = new Set(completedSignerRecordIds);
  const actions: CompletedActionRecord[] = [];
  for (const required of extractRequiredSigningActions(snapshot)) {
    if (!done.has(required.signerRecordId)) continue;
    actions.push({
      actionId: required.actionId,
      signerRecordId: required.signerRecordId,
      agreementPartyId: required.agreementPartyId,
      fieldId: required.fieldId,
      type: required.type,
      anchor: required.anchor,
      completedAt: opts?.completedAt,
      packetRevision: opts?.packetRevision,
    });
  }
  return actions;
}
