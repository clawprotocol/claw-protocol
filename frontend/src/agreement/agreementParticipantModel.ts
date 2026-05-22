/**
 * Canonical signer/participant representation for LawDog → VS01 handoff.
 * All bridge and hydrate paths should normalize through this shape.
 */

import type { AgreementParty } from "./agreementTypes";
import {
  explicitSignerNameForEntity,
  normalizeSignerMetadataForSave,
} from "./signerMetadataNormalize";
import type { Vs01Counterparty } from "../vs01/types";

export type AgreementParticipantRole = "owner" | "counterparty";

export type AgreementParticipant = {
  role: AgreementParticipantRole;
  partyName: string;
  signerName: string;
  signerTitle: string;
  signerEmail: string;
  signingOrder: number;
  /** Stable id when known (party id or VS01 counterparty id). */
  id?: string;
  phone?: string;
  reviewEmail?: string;
};

export function agreementParticipantFromParty(
  party: AgreementParty,
  role: AgreementParticipantRole,
  signingOrder: number,
): AgreementParticipant {
  const partyName = (party.name || "").trim();
  return {
    role,
    partyName,
    signerName: explicitSignerNameForEntity(party.signerName, partyName) ?? "",
    signerTitle: normalizeSignerMetadataForSave(party.signerTitle) ?? "",
    signerEmail: (party.signerEmail || party.email || "").trim(),
    signingOrder,
    id: party.id ? String(party.id).trim() : undefined,
    phone: (party.phone || "").trim() || undefined,
    reviewEmail: (party.reviewEmail || "").trim() || undefined,
  };
}

export function participantsFromAgreementDraft(
  parties: readonly AgreementParty[],
): AgreementParticipant[] {
  const list = [...parties];
  const ownerIdx = list.findIndex((p) => (p.role || "").toLowerCase() === "owner");
  const owner = ownerIdx >= 0 ? list[ownerIdx]! : list[0];
  const others = owner ? list.filter((p) => p !== owner) : list.slice(1);
  const out: AgreementParticipant[] = [];
  if (owner) {
    out.push(agreementParticipantFromParty(owner, "owner", 1));
  }
  others.forEach((p, i) => {
    out.push(agreementParticipantFromParty(p, "counterparty", i + 2));
  });
  return out;
}

export function agreementParticipantToVs01Counterparty(p: AgreementParticipant): Vs01Counterparty {
  return {
    id: p.id || `cp_${p.signingOrder}`,
    name: p.partyName,
    email: p.signerEmail,
    phone: p.phone ?? "",
    ...(p.signerName ? { signerName: p.signerName } : {}),
    ...(p.signerTitle ? { signerTitle: p.signerTitle } : {}),
    ...(p.reviewEmail ? { reviewEmail: p.reviewEmail } : {}),
  };
}

export type SignerMetadataPreservationReport = {
  beforeSlotsWithSignerName: number;
  afterSlotsWithSignerName: number;
  beforeSlotsWithSignerTitle: number;
  afterSlotsWithSignerTitle: number;
  ok: boolean;
  missing: string[];
};

export function countParticipantSignerMetadata(
  participants: readonly AgreementParticipant[],
): { slotsWithSignerName: number; slotsWithSignerTitle: number } {
  return {
    slotsWithSignerName: participants.filter((p) => Boolean(p.signerName.trim())).length,
    slotsWithSignerTitle: participants.filter((p) => Boolean(p.signerTitle.trim())).length,
  };
}

/** Hard assert: signer metadata present before bridge must survive normalization. */
export function assertSignerMetadataPreserved(
  before: readonly AgreementParticipant[],
  after: readonly AgreementParticipant[],
  label: string,
): SignerMetadataPreservationReport {
  const missing: string[] = [];
  const beforeByKey = new Map<string, AgreementParticipant>(
    before.map((p) => [`${p.role}:${p.partyName.toLowerCase()}`, p]),
  );
  for (const a of after) {
    const key = `${a.role}:${a.partyName.toLowerCase()}`;
    const b = beforeByKey.get(key);
    if (!b) continue;
    if ((b.signerName ?? "").trim() && !(a.signerName ?? "").trim()) {
      missing.push(`${key}:signerName`);
    }
    if ((b.signerTitle ?? "").trim() && !(a.signerTitle ?? "").trim()) {
      missing.push(`${key}:signerTitle`);
    }
  }
  const bCounts = countParticipantSignerMetadata(before);
  const aCounts = countParticipantSignerMetadata(after);
  const ok = missing.length === 0 && aCounts.slotsWithSignerName >= bCounts.slotsWithSignerName;
  if (typeof import.meta !== "undefined" && import.meta.env?.DEV && !ok) {
    // eslint-disable-next-line no-console
    console.warn("[agreement-participant-preservation-failed]", { label, missing, bCounts, aCounts });
  }
  return {
    beforeSlotsWithSignerName: bCounts.slotsWithSignerName,
    afterSlotsWithSignerName: aCounts.slotsWithSignerName,
    beforeSlotsWithSignerTitle: bCounts.slotsWithSignerTitle,
    afterSlotsWithSignerTitle: aCounts.slotsWithSignerTitle,
    ok,
    missing,
  };
}

export function logAgreementParticipantNormalization(
  stage: string,
  participants: readonly AgreementParticipant[],
): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  const counts = countParticipantSignerMetadata(participants);
  // eslint-disable-next-line no-console
  console.info("[agreement-participant-normalize]", {
    stage,
    participantCount: participants.length,
    ...counts,
  });
}
