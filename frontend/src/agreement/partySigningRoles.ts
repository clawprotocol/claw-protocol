import type { AgreementDraft, AgreementParty } from "./agreementTypes";
import type { AgreementVs01BridgeSession } from "../launch/simpleProduct/agreementToVs01SigningBridge";
import type { PlacedSigningField } from "../vs01/signingFields";
import type { Vs01Counterparty, Vs01RecipientPlacedField } from "../vs01/types";

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

export type SigningPacketPrepareGate = {
  canFinish: boolean;
  missingByParty: Record<string, string[]>;
  totalRequiredRoles: number;
  fieldsByRole: Record<string, { signature: number; printed_name: number; date: number; title: number }>;
};

function countTypes(
  fields: Iterable<{ type: string }>,
): { signature: number; printed_name: number; date: number; title: number } {
  let signature = 0;
  let printed_name = 0;
  let date = 0;
  let title = 0;
  for (const f of fields) {
    if (f.type === "signature") signature += 1;
    else if (f.type === "printed_name") printed_name += 1;
    else if (f.type === "date") date += 1;
    else if (f.type === "text") title += 1;
  }
  return { signature, printed_name, date, title };
}

function missingForRole(
  tallies: { signature: number; printed_name: number; date: number; title: number },
  needsTitle: boolean,
): string[] {
  const m: string[] = [];
  if (tallies.signature < 1) m.push("signature");
  if (tallies.printed_name < 1) m.push("printed_name");
  if (tallies.date < 1) m.push("date");
  if (needsTitle && tallies.title < 1) m.push("title");
  return m;
}

/**
 * Gate “finish preparing packet”: owner template fields + per–named-counterparty recipient placements.
 */
export function canFinishPreparingSigningPacket(args: {
  counterparties: Vs01Counterparty[];
  senderPlacedFields: PlacedSigningField[];
  recipientPlacedFields: Vs01RecipientPlacedField[];
}): SigningPacketPrepareGate {
  const named = args.counterparties.filter((c) => c.name.trim().length > 0);
  const ownerTallies = countTypes(args.senderPlacedFields);
  const fieldsByRole: SigningPacketPrepareGate["fieldsByRole"] = {
    __owner__: ownerTallies,
  };
  const missingByParty: Record<string, string[]> = {};
  const ownerMissing = missingForRole(ownerTallies, false);
  if (ownerMissing.length) missingByParty.__owner__ = ownerMissing;

  for (const c of named) {
    const cpFields = args.recipientPlacedFields.filter((f) => f.counterpartyId === c.id);
    const t = countTypes(cpFields);
    fieldsByRole[c.id] = t;
    const needsTitle = looksLikeLegalEntityPartyName(c.name);
    const miss = missingForRole(t, needsTitle);
    if (miss.length) missingByParty[c.id] = miss;
  }

  const totalRequiredRoles = 1 + named.length;
  const canFinish = Object.keys(missingByParty).length === 0;

  return { canFinish, missingByParty, totalRequiredRoles, fieldsByRole };
}

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
