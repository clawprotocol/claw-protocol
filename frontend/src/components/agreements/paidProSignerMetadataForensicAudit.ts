/**
 * Paid Pro signer metadata lineage checks (DEV diagnostics + test assertions).
 */

import {
  linearPremiumRecipientSlots,
  readPremiumRecipientHandoff,
} from "./premiumPartyNamesHandoff";
import {
  logSignerMetadataLifecycleEvent,
  paidProSignerMetadataForensicLineageEnabled,
  readConsumedPaidProSignerMetadataAuthority,
  readPaidProSignerMetadataFieldFromConsumedAuthority,
  type PaidProSignerMetadataField,
} from "./paidProSignerMetadataAuthority";
import {
  getAuthoritativeSigningSnapshot,
  hasAuthoritativeSigningSnapshot,
} from "./authoritativeSigningSnapshot";
import { getPaidProSourceOfTruth } from "./paidProSourceOfTruth";
import {
  paidProSignerMetadataSessionActive,
  paidProSigningCorpusFreezeActive,
} from "./paidProReviewStateMachine";
import type { PaidProSignerDetailsGate } from "./signerSetupPartyIdentity";
import type { PaidProStickyCtaState } from "./paidProStickyCta";

export type SignerMetadataForensicField = PaidProSignerMetadataField;

export type SignerMetadataForensicPartyIndex = 0 | 1;

export type SignerMetadataFieldLineageRow = {
  field: SignerMetadataForensicField;
  partyIndex: SignerMetadataForensicPartyIndex;
  localValue: string | null;
  authoritativeValue: string | null;
  reviewValue: string | null;
  snapshotValue: string | null;
  freezeValue: string | null;
  ctaValue: string | null;
  signingPayloadValue: string | null;
  persistedValue: string | null;
};

export type CollectSignerMetadataForensicArgs = {
  partyIndex: SignerMetadataForensicPartyIndex;
  local: {
    recipient1Name: string;
    recipient2Name: string;
    recipient1Email: string;
    recipient2Email: string;
    partySignerNames: readonly string[];
    partySignerTitles: readonly string[];
    /** Panel-local only — not lifted to intake parent. */
    partyAddresses?: readonly string[];
  };
  /** Render slot canonical legal entity (may differ from raw recipient name state). */
  reviewLegalEntity?: string | null;
  gate?: PaidProSignerDetailsGate | null;
  stickyCta?: PaidProStickyCtaState | null;
  /** VS01 bridge / prepare role projection when available. */
  signingPayload?: {
    creatorEmail?: string;
    counterparties?: readonly { name?: string; email?: string; signerName?: string; signerTitle?: string }[];
  } | null;
  sessionContext?: {
    signaturePreparationRequested: boolean;
    signerSetupLatched: boolean;
    signerSetupActive: boolean;
  };
};

function devAuditEnabled(): boolean {
  return paidProSignerMetadataForensicLineageEnabled();
}

function norm(v: string | null | undefined): string | null {
  const s = String(v ?? "").trim();
  return s || null;
}

function legalEntityLocal(args: CollectSignerMetadataForensicArgs): string | null {
  return norm(args.partyIndex === 0 ? args.local.recipient1Name : args.local.recipient2Name);
}

function emailLocal(args: CollectSignerMetadataForensicArgs): string | null {
  return norm(args.partyIndex === 0 ? args.local.recipient1Email : args.local.recipient2Email);
}

function handoffSlot(partyIndex: number) {
  const handoff = readPremiumRecipientHandoff();
  if (!handoff) return null;
  const slots = linearPremiumRecipientSlots(handoff, Math.max(partyIndex + 1, 2));
  return slots[partyIndex] ?? null;
}

function manifestParty(partyIndex: number) {
  const snap = getAuthoritativeSigningSnapshot();
  return snap?.partyManifest.parties[partyIndex] ?? null;
}

function snapshotMetaField(
  partyIndex: number,
  field: SignerMetadataForensicField,
): string | null {
  const snap = getAuthoritativeSigningSnapshot();
  if (!snap) return null;
  const m = snap.signerMetadata;
  switch (field) {
    case "partyLegalName":
      return norm(partyIndex === 0 ? m.recipient1Name : m.recipient2Name);
    case "signerEmail":
      return norm(partyIndex === 0 ? m.recipient1Email : m.recipient2Email);
    case "signerName":
      return norm(m.partySignerNames[partyIndex]);
    case "signerTitle":
      return norm(m.partySignerTitles[partyIndex]);
    case "partyAddress":
      return norm((m.partyAddresses ?? [])[partyIndex]);
    default:
      return null;
  }
}

function gateEvaluatedValue(
  gate: PaidProSignerDetailsGate | null | undefined,
  partyIndex: number,
  field: SignerMetadataForensicField,
  local: CollectSignerMetadataForensicArgs["local"],
): string | null {
  if (!gate) return null;
  if (field === "partyLegalName") return norm(gate.legalEntityNames[partyIndex]);
  if (field === "signerName") return norm(local.partySignerNames[partyIndex]);
  if (field === "signerEmail") {
    return norm(partyIndex === 0 ? local.recipient1Email : local.recipient2Email);
  }
  return null;
}

function signingPayloadForParty(
  args: CollectSignerMetadataForensicArgs,
  field: SignerMetadataForensicField,
): string | null {
  const payload = args.signingPayload;
  if (!payload) return null;
  if (args.partyIndex === 0) {
    if (field === "signerEmail") return norm(payload.creatorEmail);
    return null;
  }
  const cp = payload.counterparties?.[args.partyIndex - 1];
  if (!cp) return null;
  switch (field) {
    case "partyLegalName":
      return norm(cp.name);
    case "signerEmail":
      return norm(cp.email);
    case "signerName":
      return norm(cp.signerName);
    case "signerTitle":
      return norm(cp.signerTitle);
    default:
      return null;
  }
}

export function collectSignerMetadataFieldLineage(
  args: CollectSignerMetadataForensicArgs,
  field: SignerMetadataForensicField,
): SignerMetadataFieldLineageRow {
  const idx = args.partyIndex;
  const snap = getAuthoritativeSigningSnapshot();
  const manifest = manifestParty(idx);
  const slot = handoffSlot(idx);
  const sot = getPaidProSourceOfTruth();
  const session = args.sessionContext;
  const metadataSessionActive = session
    ? paidProSignerMetadataSessionActive({
        hasPaidProSourceOfTruth: Boolean(sot),
        prepareSignatureLinksRequested: session.signaturePreparationRequested,
        signerSetupActive: session.signerSetupActive,
        signerSetupLatched: session.signerSetupLatched,
      })
    : false;
  const signingCorpusFrozen = session
    ? paidProSigningCorpusFreezeActive({
        hasPaidProSourceOfTruth: Boolean(sot),
        prepareSignatureLinksRequested: session.signaturePreparationRequested,
      })
    : false;

  let localValue: string | null = null;
  switch (field) {
    case "partyLegalName":
      localValue = legalEntityLocal(args);
      break;
    case "signerEmail":
      localValue = emailLocal(args);
      break;
    case "signerName":
      localValue = norm(args.local.partySignerNames[idx]);
      break;
    case "signerTitle":
      localValue = norm(args.local.partySignerTitles[idx]);
      break;
    case "partyAddress":
      localValue = norm(args.local.partyAddresses?.[idx]);
      break;
    default:
      break;
  }

  const consumedField = readPaidProSignerMetadataFieldFromConsumedAuthority(idx, field);
  let authoritativeValue: string | null = consumedField || null;
  if (!authoritativeValue) {
    if (field === "partyLegalName") {
      authoritativeValue = norm(manifest?.partyName) ?? norm(slot?.name);
    } else if (field === "signerEmail") {
      authoritativeValue = norm(manifest?.email) ?? norm(slot?.email);
    } else if (field === "signerName") {
      authoritativeValue = norm(manifest?.signerName) ?? norm(slot?.signerName);
    } else if (field === "signerTitle") {
      authoritativeValue = norm(manifest?.signerTitle) ?? norm(slot?.signerTitle);
    } else if (field === "partyAddress") {
      authoritativeValue =
        norm(slot?.partyAddress) ?? norm((snap?.signerMetadata.partyAddresses ?? [])[idx]);
    }
  }
  if (!authoritativeValue && localValue) {
    authoritativeValue = localValue;
  }

  const consumedAuth = readConsumedPaidProSignerMetadataAuthority();
  let reviewValue: string | null = null;
  if (field === "partyLegalName") {
    reviewValue = norm(args.reviewLegalEntity) || consumedField || norm(manifest?.partyName);
  } else if (snap?.corpus || consumedAuth) {
    reviewValue = consumedField || snapshotMetaField(idx, field);
  }

  const snapshotValue = snap ? snapshotMetaField(idx, field) : consumedField || null;
  const freezeValue = metadataSessionActive || signingCorpusFrozen ? localValue : localValue;
  const ctaValue = gateEvaluatedValue(args.gate, idx, field, args.local);
  const signingPayloadValue = signingPayloadForParty(args, field);
  const persistedValue =
    field === "partyAddress"
      ? norm(slot?.partyAddress)
      : field === "partyLegalName"
        ? norm(slot?.name)
        : field === "signerEmail"
          ? norm(slot?.email)
          : field === "signerName"
            ? norm(slot?.signerName)
            : field === "signerTitle"
              ? norm(slot?.signerTitle)
              : null;

  return {
    field,
    partyIndex: idx,
    localValue,
    authoritativeValue,
    reviewValue,
    snapshotValue,
    freezeValue,
    ctaValue,
    signingPayloadValue,
    persistedValue,
  };
}

export function collectSignerMetadataForensicMatrix(
  args: Omit<CollectSignerMetadataForensicArgs, "partyIndex"> & {
    partyIndices?: readonly SignerMetadataForensicPartyIndex[];
  },
): SignerMetadataFieldLineageRow[] {
  const indices = args.partyIndices ?? ([0, 1] as const);
  const fields: SignerMetadataForensicField[] = [
    "partyLegalName",
    "signerEmail",
    "signerName",
    "signerTitle",
    "partyAddress",
  ];
  const rows: SignerMetadataFieldLineageRow[] = [];
  for (const partyIndex of indices) {
    for (const field of fields) {
      rows.push(
        collectSignerMetadataFieldLineage({ ...args, partyIndex }, field),
      );
    }
  }
  return rows;
}

export { logSignerMetadataLifecycleEvent };

export function logSignerMetadataFieldLineage(
  trigger: string,
  row: SignerMetadataFieldLineageRow,
): void {
  if (!devAuditEnabled()) return;
  const diverges =
    row.snapshotValue != null &&
    row.localValue != null &&
    row.snapshotValue !== row.localValue;
  // eslint-disable-next-line no-console
  console.info("[paid-pro-signer-audit:field-lineage]", {
    trigger,
    ...row,
    divergesFromSnapshot: diverges,
    hasSnapshot: hasAuthoritativeSigningSnapshot(),
  });
}

export type CtaForensicEvaluation = {
  reason: string;
  phase: string;
  missingFields: string[];
  requiredFields: string[];
  evaluatedValues: Record<string, string | null>;
  sourceOfTruth: string;
};

const PAID_PRO_SIGNER_REQUIRED_FIELDS = [
  "partyLegalName",
  "signerName",
  "signerEmail",
] as const;

export function buildCtaForensicEvaluation(args: {
  gate: PaidProSignerDetailsGate;
  stickyCta: PaidProStickyCtaState | null;
  evaluatedValues: Record<string, string | null>;
}): CtaForensicEvaluation {
  const missingFields = args.gate.blockers.map(
    (b) => `${b.field}@party${b.partyIndex}`,
  );
  return {
    reason: args.stickyCta?.reason ?? args.gate.ctaLabel,
    phase: args.stickyCta?.phase ?? "legacy_gate_only",
    missingFields,
    requiredFields: [...PAID_PRO_SIGNER_REQUIRED_FIELDS],
    evaluatedValues: args.evaluatedValues,
    sourceOfTruth: args.stickyCta
      ? "paidProStickyCta"
      : "resolvePaidProSignerDetailsGate",
  };
}

export function logCtaForensicEvaluation(
  trigger: string,
  evaluation: CtaForensicEvaluation,
): void {
  if (!devAuditEnabled()) return;
  logSignerMetadataLifecycleEvent("cta-evaluation", { trigger, ...evaluation });
}
