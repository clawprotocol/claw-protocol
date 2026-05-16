import type { AgreementDraft, AgreementParty } from "./agreementTypes";
import type { AgreementVs01BridgeSession } from "../launch/simpleProduct/agreementToVs01SigningBridge";

export type PartySigningRoleSource = "intake" | "review_link" | "handoff" | "creator_profile" | "inferred";

export type PartySigningRole = {
  agreementId: string;
  partyId: string;
  partyIndex: number;
  partyName: string;
  entityName: string;
  role: "owner" | "counterparty" | "recipient";
  signerName?: string;
  signerTitle?: string;
  signerEmail?: string;
  reviewEmail?: string;
  isEntityParty: boolean;
  requiresSignature: boolean;
  source: PartySigningRoleSource;
  reviewerApproved?: boolean;
};

/** Generic legal-entity suffix heuristic — not jurisdiction- or industry-specific. */
export function looksLikeLegalEntityPartyName(name: string): boolean {
  const t = name.trim();
  if (!t) return false;
  const u = t.toUpperCase();
  return /\b(LLC|L\.L\.C\.|INC|INC\.|CORP|CORP\.|CO\.|LTD|LP|L\.P\.|PLC|GMBH|BV|NV|SA|AG)\b/.test(u);
}

function partySignerEmail(p: AgreementParty): string | undefined {
  const se = p.signerEmail?.trim();
  if (se) return se;
  return undefined;
}

function partyReviewEmail(p: AgreementParty): string | undefined {
  const re = p.reviewEmail?.trim();
  if (re) return re;
  return undefined;
}

function partySignerName(p: AgreementParty, entityName: string): string | undefined {
  const sn = p.signerName?.trim();
  if (!sn) return undefined;
  if (sn.toLowerCase() === entityName.trim().toLowerCase()) return undefined;
  return sn;
}

/**
 * Builds signer-centric roles from an agreement draft (never copies entity name into signerName implicitly).
 */
export function buildPartySigningRolesFromAgreementHandoff(args: {
  agreementId: string;
  draft: AgreementDraft | null | undefined;
  bridge?: AgreementVs01BridgeSession | null;
}): PartySigningRole[] {
  const aid = args.agreementId.trim();
  if (!aid) return [];
  const parties = (args.draft?.parties ?? []) as AgreementParty[];
  const owner =
    parties.find((p) => (p.role || "").toLowerCase() === "owner") ?? parties[0] ?? null;
  const reviewerApproved = Boolean(args.bridge?.reviewerApprovedCleanHandoff);
  const out: PartySigningRole[] = [];

  if (owner) {
    const entityName = (owner.name || "").trim() || "Owner";
    const idx = Math.max(0, parties.indexOf(owner));
    out.push({
      agreementId: aid,
      partyId: String(owner.id ?? `party_${idx}`),
      partyIndex: idx,
      partyName: entityName,
      entityName,
      role: "owner",
      signerName: partySignerName(owner, entityName),
      signerTitle: owner.signerTitle?.trim() || undefined,
      signerEmail: partySignerEmail(owner),
      reviewEmail: partyReviewEmail(owner) || (owner.email || "").trim() || undefined,
      isEntityParty: looksLikeLegalEntityPartyName(entityName),
      requiresSignature: true,
      source: "intake",
      reviewerApproved,
    });
  }

  const others = owner ? parties.filter((p) => p !== owner) : parties.slice(1);
  others.forEach((p, i) => {
    const entityName = (p.name || "").trim() || `Party ${i + 2}`;
    const idx = parties.indexOf(p);
    const wf = (p.role || "").toLowerCase();
    const role: PartySigningRole["role"] =
      wf === "reviewer" || wf === "recipient" ? "recipient" : "counterparty";
    out.push({
      agreementId: aid,
      partyId: String(p.id ?? `party_${idx >= 0 ? idx : i + 1}`),
      partyIndex: idx >= 0 ? idx : i + 1,
      partyName: entityName,
      entityName,
      role,
      signerName: partySignerName(p, entityName),
      signerTitle: p.signerTitle?.trim() || undefined,
      signerEmail: partySignerEmail(p),
      reviewEmail: partyReviewEmail(p) || (p.email || "").trim() || undefined,
      isEntityParty: looksLikeLegalEntityPartyName(entityName),
      requiresSignature: role !== "recipient" || wf === "recipient",
      source: wf === "reviewer" ? "review_link" : "intake",
      reviewerApproved,
    });
  });

  return out;
}

export type { SigningPacketPrepareGate } from "../vs01/vs01SignerFieldAssignment";
export { canFinishPreparePacketSignerCentric as canFinishPreparingSigningPacket } from "../vs01/vs01SignerFieldAssignment";

/** True only when a real signer-execute session (receipt) is allowed — never during packet preparation. */
export function isActualSignerCompletionAllowed(args: {
  agreementBridgeMode?: string | null;
  ownerIsPreparingPacket?: boolean | null;
  hasSignerSessionReceipt: boolean;
}): boolean {
  if (args.agreementBridgeMode === "prepare_signing_packet" || Boolean(args.ownerIsPreparingPacket)) {
    return false;
  }
  return args.hasSignerSessionReceipt;
}

/** When true, UI must not emit `vs01_signature_complete` or navigate as if the sender signed. */
export function shouldBlockVs01SignatureCompleteTelemetry(args: {
  agreementBridgeMode?: string | null;
  ownerIsPreparingPacket?: boolean | null;
}): boolean {
  return args.agreementBridgeMode === "prepare_signing_packet" || Boolean(args.ownerIsPreparingPacket);
}

export function logVs01PartySigningRolesDiag(roles: PartySigningRole[]): void {
  if (typeof window === "undefined") return;
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  const on =
    Boolean(typeof import.meta !== "undefined" && import.meta.env?.DEV) ||
    window.localStorage?.getItem("lawdogVs01FieldDiag") === "1";
  if (!on) return;
  const missingSignerNameCount = roles.filter((r) => !r.signerName?.trim()).length;
  const missingSignerTitleCount = roles.filter((r) => r.isEntityParty && !r.signerTitle?.trim()).length;
  const missingSignerEmailCount = roles.filter((r) => !r.signerEmail?.trim()).length;
  // eslint-disable-next-line no-console
  console.info("[vs01-party-signing-roles]", {
    roleCount: roles.length,
    missingSignerNameCount,
    missingSignerTitleCount,
    missingSignerEmailCount,
    ownerRolePresent: roles.some((r) => r.role === "owner"),
    counterpartyCount: roles.filter((r) => r.role === "counterparty").length,
  });
}

/** Bridge-only party list (Vs01Wizard has no full draft) — diagnostics only. */
export function logVs01PartySigningRolesForBridgeSession(bridge: AgreementVs01BridgeSession): void {
  const parties: AgreementParty[] = [
    {
      id: "bridge_owner",
      name: bridge.creatorName || "Sender",
      role: "owner",
      email: bridge.creatorEmail,
    },
    ...(bridge.counterparties ?? []).map((c) => ({
      id: c.id,
      name: c.name,
      role: "counterparty",
      email: c.email,
      signerName: c.signerName,
      signerTitle: c.signerTitle,
      signerEmail: c.signerEmail,
      reviewEmail: c.reviewEmail,
    })),
  ];
  const minimalDraft: AgreementDraft = {
    id: bridge.agreementId,
    title: bridge.agreementTitle,
    jurisdiction: "",
    parties,
    purpose: "",
    payment_terms: "",
    duration: null,
    due_date: null,
    effective_date: null,
    created_at: "",
    updated_at: "",
    versions: [],
    audit_log: [],
  };
  const roles = buildPartySigningRolesFromAgreementHandoff({
    agreementId: bridge.agreementId,
    draft: minimalDraft,
    bridge,
  });
  logVs01PartySigningRolesDiag(roles);
}
