import type { PublicVerifySignatureEvent } from "../agreement/agreementPublicVerify";

export const VS01_COMPLETION_EVENT_MISSING_IDENTITY = "[vs01-completion-event-missing-identity]";

export class Vs01CompletionEventMissingIdentityError extends Error {
  readonly code = VS01_COMPLETION_EVENT_MISSING_IDENTITY;

  constructor(message = VS01_COMPLETION_EVENT_MISSING_IDENTITY) {
    super(message);
    this.name = "Vs01CompletionEventMissingIdentityError";
  }
}

/** VS01 dashboard rehydration: every persisted completion must carry canonical signer_role_id. */
export function assertVs01PublicVerifyCompletionIdentity(
  events: readonly PublicVerifySignatureEvent[],
): void {
  for (const event of events) {
    if (event.event_type !== "signature_completed") continue;
    const signerRoleId = (event.signer_role_id ?? "").trim();
    if (!signerRoleId) {
      throw new Vs01CompletionEventMissingIdentityError();
    }
  }
}

export function completedSignerRoleIdsFromPublicVerify(
  events: readonly PublicVerifySignatureEvent[],
): Set<string> {
  const ids = new Set<string>();
  for (const event of events) {
    if (event.event_type !== "signature_completed") continue;
    const rid = (event.signer_role_id ?? "").trim();
    if (rid) ids.add(rid);
  }
  return ids;
}

export function completedParticipantIdsFromPublicVerify(
  events: readonly PublicVerifySignatureEvent[],
): Set<string> {
  const ids = new Set<string>();
  for (const event of events) {
    if (event.event_type !== "signature_completed") continue;
    const pid = (event.participant_id ?? "").trim();
    if (pid) ids.add(pid);
  }
  return ids;
}

export type Vs01SignerStatusRow = {
  key: string;
  signerRoleId: string;
  participantId: string;
};

export function applyVs01CompletionEventsByCanonicalIdentity(args: {
  bySignerKey: Record<string, "waiting" | "opened" | "signed">;
  rows: readonly Vs01SignerStatusRow[];
  completedRoleIds: ReadonlySet<string>;
  completedParticipantIds: ReadonlySet<string>;
}): void {
  for (const row of args.rows) {
    if (args.bySignerKey[row.key] === "signed") continue;
    if (row.signerRoleId && args.completedRoleIds.has(row.signerRoleId)) {
      args.bySignerKey[row.key] = "signed";
      continue;
    }
    if (row.participantId && args.completedParticipantIds.has(row.participantId)) {
      args.bySignerKey[row.key] = "signed";
    }
  }
}
