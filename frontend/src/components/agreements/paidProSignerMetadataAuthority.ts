/**
 * Single authority model for paid Pro signer metadata — live edits, freeze, and snapshot parity.
 */

import {
  getAuthoritativeSigningSnapshot,
  type AuthoritativeSigningSnapshotRecipientMetadata,
} from "./authoritativeSigningSnapshot";
import { fingerprintAgreementBody } from "./guidedDealCompletion/guidedSigningPacketVersion";
import { hashPaidProCorpus } from "./paidProSourceOfTruth";
import { stripRecipientEmailNoise } from "./recipientEmailValidation";

export const PAID_PRO_SIGNER_METADATA_FIELDS = [
  "partyLegalName",
  "signerEmail",
  "signerName",
  "signerTitle",
  "partyAddress",
] as const;

export type PaidProSignerMetadataField = (typeof PAID_PRO_SIGNER_METADATA_FIELDS)[number];

export type PaidProSignerMetadataParty = {
  partyIndex: number;
  partyLegalName: string;
  signerEmail: string;
  signerName: string;
  signerTitle: string;
  partyAddress: string;
};

export type PaidProSignerMetadataAuthoritySource =
  | "live_ui"
  | "authoritative_snapshot"
  | "authoritative_write";

export type PaidProSignerMetadataAuthority = {
  parties: PaidProSignerMetadataParty[];
  source: PaidProSignerMetadataAuthoritySource;
  hash: string;
  updatedAt: number;
};

export type LiveSignerMetadataUiState = {
  partyCount: number;
  recipient1Name: string;
  recipient2Name: string;
  recipient1Email: string;
  recipient2Email: string;
  extraPartyReviewEmails: readonly string[];
  partySignerNames: readonly string[];
  partySignerTitles: readonly string[];
  partyAddresses: readonly string[];
};

export type SignerMetadataLifecycleEvent =
  | "metadata-input-change"
  | "authoritative-write"
  | "metadata-freeze"
  | "cta-evaluation";

const LEGACY_PAID_PRO_SIGNER_CTA_REASONS = new Set([
  "continue_to_recipients",
  "premium_continue_to_signers",
  "guided_final_review_hidden",
]);

function norm(v: string | null | undefined): string {
  return String(v ?? "").trim();
}

function partyLegalNameForIndex(ui: LiveSignerMetadataUiState, index: number): string {
  if (index === 0) return norm(ui.recipient1Name);
  if (index === 1) return norm(ui.recipient2Name);
  return "";
}

function signerEmailForIndex(ui: LiveSignerMetadataUiState, index: number): string {
  if (index === 0) return stripRecipientEmailNoise(ui.recipient1Email);
  if (index === 1) return stripRecipientEmailNoise(ui.recipient2Email);
  return stripRecipientEmailNoise(ui.extraPartyReviewEmails[index - 2] ?? "");
}

export function buildPaidProSignerMetadataParties(
  ui: LiveSignerMetadataUiState,
): PaidProSignerMetadataParty[] {
  const count = Math.max(ui.partyCount, 2);
  const parties: PaidProSignerMetadataParty[] = [];
  for (let i = 0; i < count; i++) {
    parties.push({
      partyIndex: i,
      partyLegalName: partyLegalNameForIndex(ui, i),
      signerEmail: signerEmailForIndex(ui, i),
      signerName: norm(ui.partySignerNames[i]),
      signerTitle: norm(ui.partySignerTitles[i]),
      partyAddress: norm(ui.partyAddresses[i]),
    });
  }
  return parties;
}

export function hashPaidProSignerMetadataAuthority(
  parties: readonly PaidProSignerMetadataParty[],
): string {
  const payload = JSON.stringify(
    parties.map((p) => ({
      i: p.partyIndex,
      legal: p.partyLegalName,
      email: p.signerEmail,
      name: p.signerName,
      title: p.signerTitle,
      address: p.partyAddress,
    })),
  );
  return hashPaidProCorpus(payload) || fingerprintAgreementBody(payload);
}

export function buildLivePaidProSignerMetadataAuthority(
  ui: LiveSignerMetadataUiState,
  source: PaidProSignerMetadataAuthoritySource = "live_ui",
): PaidProSignerMetadataAuthority {
  const parties = buildPaidProSignerMetadataParties(ui);
  return {
    parties,
    source,
    hash: hashPaidProSignerMetadataAuthority(parties),
    updatedAt: Date.now(),
  };
}

export function recipientMetadataToAuthorityParties(
  meta: AuthoritativeSigningSnapshotRecipientMetadata,
): PaidProSignerMetadataParty[] {
  const addresses = meta.partyAddresses ?? [];
  const count = Math.max(
    meta.partySignerNames.length,
    meta.partySignerTitles.length,
    addresses.length,
    2,
  );
  const parties: PaidProSignerMetadataParty[] = [];
  for (let i = 0; i < count; i++) {
    parties.push({
      partyIndex: i,
      partyLegalName: norm(i === 0 ? meta.recipient1Name : i === 1 ? meta.recipient2Name : ""),
      signerEmail: norm(
        i === 0
          ? meta.recipient1Email
          : i === 1
            ? meta.recipient2Email
            : meta.extraPartyReviewEmails[i - 2],
      ),
      signerName: norm(meta.partySignerNames[i]),
      signerTitle: norm(meta.partySignerTitles[i]),
      partyAddress: norm(addresses[i]),
    });
  }
  return parties;
}

export function authorityPartiesToRecipientMetadata(
  parties: readonly PaidProSignerMetadataParty[],
  extraEmails: readonly string[] = [],
): AuthoritativeSigningSnapshotRecipientMetadata {
  const p0 = parties[0];
  const p1 = parties[1];
  const partySignerNames = parties.map((p) => p.signerName);
  const partySignerTitles = parties.map((p) => p.signerTitle);
  const partyAddresses = parties.map((p) => p.partyAddress);
  return {
    partySignerNames,
    partySignerTitles,
    partyAddresses,
    recipient1Name: p0?.partyLegalName ?? "",
    recipient2Name: p1?.partyLegalName ?? "",
    recipient1Email: p0?.signerEmail ?? "",
    recipient2Email: p1?.signerEmail ?? "",
    extraPartyReviewEmails: [...extraEmails],
  };
}

export function buildSnapshotPaidProSignerMetadataAuthority(): PaidProSignerMetadataAuthority | null {
  const snap = getAuthoritativeSigningSnapshot();
  if (!snap) return null;
  const parties = recipientMetadataToAuthorityParties(snap.signerMetadata);
  return {
    parties,
    source: "authoritative_snapshot",
    hash: hashPaidProSignerMetadataAuthority(parties),
    updatedAt: snap.frozenAt,
  };
}

export function fingerprintPaidProSignerMetadataAuthority(
  authority: PaidProSignerMetadataAuthority,
): string {
  return authority.hash;
}

export function signerMetadataAuthorityDrifted(
  frozen: PaidProSignerMetadataAuthority,
  live: PaidProSignerMetadataAuthority,
): boolean {
  return frozen.hash !== live.hash;
}

export function isLegacyPaidProSignerCtaReason(reason: string | null | undefined): boolean {
  const r = norm(reason);
  if (!r) return false;
  return LEGACY_PAID_PRO_SIGNER_CTA_REASONS.has(r);
}

export function assertCanonicalPaidProSignerCtaReason(args: {
  reason: string;
  canonicalSignerFlowActive: boolean;
}): string {
  if (!args.canonicalSignerFlowActive) return args.reason;
  if (isLegacyPaidProSignerCtaReason(args.reason)) {
    return "paid_pro_signer_details_required";
  }
  return args.reason;
}

function devLifecycleLogEnabled(): boolean {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return false;
  return typeof import.meta !== "undefined" && Boolean(import.meta.env?.DEV);
}

export function logSignerMetadataLifecycleEvent(
  event: SignerMetadataLifecycleEvent | "snapshot-write",
  payload: Record<string, unknown>,
): void {
  if (!devLifecycleLogEnabled()) return;
  // eslint-disable-next-line no-console
  console.info(`[paid-pro-signer-audit:${event}]`, payload);
}

export type ApplyPaidProSignerMetadataFieldUpdateArgs = {
  partyIndex: number;
  field: PaidProSignerMetadataField;
  raw: string;
  inputEventKind: "change" | "blur" | "input" | "paste" | "autofill";
  surface: string;
  /** When true, also emit metadata-freeze (session active). */
  sessionActive?: boolean;
};

/** Unified field update diagnostics — every signer field uses this path. */
export function emitPaidProSignerMetadataFieldDiagnostics(
  args: ApplyPaidProSignerMetadataFieldUpdateArgs,
): void {
  logSignerMetadataLifecycleEvent("metadata-input-change", {
    field: args.field,
    partyIndex: args.partyIndex,
    inputEventKind: args.inputEventKind,
    surface: args.surface,
    rawLen: args.raw.length,
  });
  if (args.sessionActive) {
    logSignerMetadataLifecycleEvent("metadata-freeze", {
      field: args.field,
      partyIndex: args.partyIndex,
      inputEventKind: args.inputEventKind,
      surface: args.surface,
    });
  }
}

export function emitPaidProSignerMetadataAuthoritativeWrite(payload: Record<string, unknown>): void {
  logSignerMetadataLifecycleEvent("authoritative-write", payload);
}

export function emitPaidProSignerMetadataCtaEvaluation(payload: Record<string, unknown>): void {
  logSignerMetadataLifecycleEvent("cta-evaluation", payload);
}

/** Parity check: live authority matches snapshot authority (post-finalize invariant). */
export function paidProSignerMetadataParity(args: {
  live: PaidProSignerMetadataAuthority;
  snapshot: PaidProSignerMetadataAuthority | null;
}): { ok: boolean; mismatches: string[] } {
  const mismatches: string[] = [];
  if (!args.snapshot) {
    mismatches.push("missing_snapshot");
    return { ok: false, mismatches };
  }
  if (args.live.hash !== args.snapshot.hash) {
    mismatches.push("hash");
  }
  const max = Math.max(args.live.parties.length, args.snapshot.parties.length);
  for (let i = 0; i < max; i++) {
    const l = args.live.parties[i];
    const s = args.snapshot.parties[i];
    if (!l || !s) {
      mismatches.push(`party_${i}_missing`);
      continue;
    }
    for (const field of PAID_PRO_SIGNER_METADATA_FIELDS) {
      const lk = field === "partyLegalName" ? l.partyLegalName : field === "signerEmail" ? l.signerEmail : field === "signerName" ? l.signerName : field === "signerTitle" ? l.signerTitle : l.partyAddress;
      const sk = field === "partyLegalName" ? s.partyLegalName : field === "signerEmail" ? s.signerEmail : field === "signerName" ? s.signerName : field === "signerTitle" ? s.signerTitle : s.partyAddress;
      if (lk !== sk) mismatches.push(`${field}@party${i}`);
    }
  }
  return { ok: mismatches.length === 0, mismatches };
}
