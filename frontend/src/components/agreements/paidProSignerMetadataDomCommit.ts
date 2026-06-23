/**
 * Commit signer metadata from visible DOM inputs on finalize (mobile Safari often skips blur
 * before Continue). Display-only staging during typing is unchanged — this runs once on CTA.
 */

import { normalizeSignerMetadataForSave } from "../../agreement/signerMetadataNormalize";
import { stripRecipientEmailNoise } from "./recipientEmailValidation";
import {
  buildLivePaidProSignerMetadataAuthority,
  type LiveSignerMetadataUiState,
  type PaidProSignerMetadataAuthority,
} from "./paidProSignerMetadataAuthority";

const DOM_SIGNER_FIELDS = [
  "r1-name",
  "r2-name",
  "r1-email",
  "r2-email",
  "r1-signer-name",
  "r2-signer-name",
  "r1-signer-title",
  "r2-signer-title",
  "r1-party-address",
  "r2-party-address",
] as const;

export type PaidProSignerMetadataDomField = (typeof DOM_SIGNER_FIELDS)[number];

export function readVisiblePaidProSignerMetadataDomValue(field: PaidProSignerMetadataDomField): string | null {
  if (typeof document === "undefined") return null;
  const inputs = document.querySelectorAll<HTMLInputElement>(`[data-claw-recipient-field="${field}"]`);
  for (const el of inputs) {
    const rect = el.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) return el.value;
  }
  return null;
}

function readVisiblePartyFieldDomValue(partyIndex: number, field: string): string | null {
  if (typeof document === "undefined") return null;
  const fieldKey =
    partyIndex === 0
      ? `r1-${field}`
      : partyIndex === 1
        ? `r2-${field}`
        : `party-${partyIndex}-${field}`;
  const inputs = document.querySelectorAll<HTMLInputElement>(`[data-claw-recipient-field="${fieldKey}"]`);
  for (const el of inputs) {
    const rect = el.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) return el.value;
  }
  return null;
}

function normalizeSignerField(raw: string): string {
  return normalizeSignerMetadataForSave(raw) ?? String(raw ?? "").trim();
}

function mergeSignerRow(
  current: readonly string[],
  index: number,
  domValue: string | null,
): string[] {
  const next = [...current];
  while (next.length <= index) next.push("");
  if (domValue == null) return next;
  next[index] = normalizeSignerField(domValue);
  return next;
}

/** Merge visible DOM inputs over React UI state — manual corrections in focused fields win. */
export function mergeLiveSignerMetadataUiWithDomCommit(
  ui: LiveSignerMetadataUiState,
): LiveSignerMetadataUiState {
  const r1Name = readVisiblePaidProSignerMetadataDomValue("r1-name");
  const r2Name = readVisiblePaidProSignerMetadataDomValue("r2-name");
  const r1Email = readVisiblePaidProSignerMetadataDomValue("r1-email");
  const r2Email = readVisiblePaidProSignerMetadataDomValue("r2-email");

  let partySignerNames = mergeSignerRow(
    ui.partySignerNames,
    0,
    readVisiblePaidProSignerMetadataDomValue("r1-signer-name"),
  );
  partySignerNames = mergeSignerRow(
    partySignerNames,
    1,
    readVisiblePaidProSignerMetadataDomValue("r2-signer-name"),
  );

  let partySignerTitles = mergeSignerRow(
    ui.partySignerTitles,
    0,
    readVisiblePaidProSignerMetadataDomValue("r1-signer-title"),
  );
  partySignerTitles = mergeSignerRow(
    partySignerTitles,
    1,
    readVisiblePaidProSignerMetadataDomValue("r2-signer-title"),
  );

  let partyAddresses = mergeSignerRow(
    ui.partyAddresses,
    0,
    readVisiblePaidProSignerMetadataDomValue("r1-party-address"),
  );
  partyAddresses = mergeSignerRow(
    partyAddresses,
    1,
    readVisiblePaidProSignerMetadataDomValue("r2-party-address"),
  );

  const partyCount = Math.max(ui.partyCount, 2);
  let extraPartyLegalNames = [...(ui.extraPartyLegalNames ?? [])];
  let extraPartyReviewEmails = [...ui.extraPartyReviewEmails];
  for (let i = 2; i < partyCount; i++) {
    const legalDom = readVisiblePartyFieldDomValue(i, "legal-name");
    if (legalDom != null) {
      while (extraPartyLegalNames.length <= i - 2) extraPartyLegalNames.push("");
      extraPartyLegalNames[i - 2] = legalDom.trim();
    }
    const emailDom = readVisiblePartyFieldDomValue(i, "email");
    if (emailDom != null) {
      while (extraPartyReviewEmails.length <= i - 2) extraPartyReviewEmails.push("");
      extraPartyReviewEmails[i - 2] = stripRecipientEmailNoise(emailDom);
    }
    partySignerNames = mergeSignerRow(partySignerNames, i, readVisiblePartyFieldDomValue(i, "signer-name"));
    partySignerTitles = mergeSignerRow(partySignerTitles, i, readVisiblePartyFieldDomValue(i, "signer-title"));
    partyAddresses = mergeSignerRow(partyAddresses, i, readVisiblePartyFieldDomValue(i, "address"));
  }

  return {
    ...ui,
    partyCount,
    recipient1Name: r1Name != null ? r1Name.trim() : ui.recipient1Name,
    recipient2Name: r2Name != null ? r2Name.trim() : ui.recipient2Name,
    recipient1Email: r1Email != null ? stripRecipientEmailNoise(r1Email) : ui.recipient1Email,
    recipient2Email: r2Email != null ? stripRecipientEmailNoise(r2Email) : ui.recipient2Email,
    extraPartyLegalNames,
    extraPartyReviewEmails,
    partySignerNames,
    partySignerTitles,
    partyAddresses,
  };
}

export function buildPaidProSignerMetadataAuthorityForFinalize(
  ui: LiveSignerMetadataUiState,
  opts?: { intakeText?: string | null; draftPartyNames?: readonly string[] },
): PaidProSignerMetadataAuthority {
  return buildLivePaidProSignerMetadataAuthority(mergeLiveSignerMetadataUiWithDomCommit(ui), "live_ui", opts);
}
