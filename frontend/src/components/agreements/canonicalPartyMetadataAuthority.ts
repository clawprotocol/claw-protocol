/**
 * Canonical party/signer/contact metadata — single mutable owner.
 * Handoff, consumed authority, and UI arrays are projections only.
 */

import {
  alignIntakeSignerMetadataToLegalEntities,
} from "./structuredIntakePartyContactParse";
import { extractIntakeContacts } from "./paidProIntakeContactSubstitution";
import { resolveLegalEntitiesForCanonicalMetadata } from "./canonicalLegalEntitiesForMetadata";
import {
  linearPremiumRecipientSlots,
  readPremiumRecipientHandoff,
} from "./premiumPartyNamesHandoff";
import { resolveUniversalSignerMetadataBySlotForCanonicalSeed } from "./universalSignerMetadataAuthority";
import {
  assertCanonicalMetadataNotFromAgreementBody,
  type CanonicalMutableMutationSource,
} from "./canonicalPartyMetadataGuard";
import { entitiesMatchForSignerMetadata } from "./universalSignerMetadataAuthority";
import { isPartyMetadataLabelValue } from "./intakeSectionLabels";
import {
  mergeCanonicalPartyAddresses,
  normalizeCanonicalPartyAddress,
} from "./canonicalPartyStructuredAddress";
import {
  hashPaidProSignerMetadataAuthority,
  paidProSignerMetadataForensicLineageEnabled,
  readConsumedPaidProSignerMetadataAuthority,
  setConsumedPaidProSignerMetadataAuthority,
  type PaidProSignerMetadataAuthority,
  type PaidProSignerMetadataParty,
} from "./paidProSignerMetadataAuthority";
import { writePremiumRecipientHandoffFromAuthorityParties } from "./premiumPartyNamesHandoff";
import { signerMetadataInputRaw } from "../../agreement/signerMetadataNormalize";

export const CANONICAL_PARTY_METADATA_SESSION_KEY = "claw:canonical-party-metadata:v1";

export type CanonicalPartyMetadataSource =
  | CanonicalMutableMutationSource
  | "generic_placeholder";

export type CanonicalPartyMetadataRecord = {
  partyId: string;
  partyIndex: number;
  partyLegalName: string;
  roleLabel: string;
  signerName: string;
  signerTitle: string;
  signerEmail: string;
  partyAddress: string;
  source: CanonicalPartyMetadataSource;
};

export type CanonicalPartyMetadataBundle = {
  bundleId: string;
  bundleHash: string;
  parties: CanonicalPartyMetadataRecord[];
  source: CanonicalPartyMetadataSource;
  createdAt: string;
  updatedAt: string;
};

export type CanonicalPartyMetadataStage =
  | "created"
  | "after-checkout"
  | "after-premium"
  | "after-freeze"
  | "review"
  | "signer-setup"
  | "email-packets"
  | "prepare-signatures"
  | "signing"
  | "completed-snapshot"
  | "pdf-export";

export type CanonicalPartyMetadataFieldCounts = {
  partyCount: number;
  entityCount: number;
  signerNameCount: number;
  titleCount: number;
  emailCount: number;
  addressCount: number;
  missingFields: string[];
  source: string;
  bundleId: string;
  bundleHash: string;
};

export type CanonicalProjectionSurface = "handoff" | "consumed_authority" | "session";

const STAGE_LOG_TAGS: Record<CanonicalPartyMetadataStage, string> = {
  created: "[canonical-party-metadata-created]",
  "after-checkout": "[canonical-party-metadata-after-checkout]",
  "after-premium": "[canonical-party-metadata-after-premium]",
  "after-freeze": "[canonical-party-metadata-after-freeze]",
  review: "[canonical-party-metadata-review]",
  "signer-setup": "[canonical-party-metadata-signer-setup]",
  "email-packets": "[canonical-party-metadata-email-packets]",
  "prepare-signatures": "[canonical-party-metadata-prepare-signatures]",
  signing: "[canonical-party-metadata-signing]",
  "completed-snapshot": "[canonical-party-metadata-completed-snapshot]",
  "pdf-export": "[canonical-party-metadata-pdf-export]",
};

let activeBundleId: string | null = null;
let activeBundleHash: string | null = null;
let lastFieldCounts: CanonicalPartyMetadataFieldCounts | null = null;
let lastProjectionBundleId: string | null = null;

function diagnosticsEnabled(partyCount = 0): boolean {
  return (
    paidProSignerMetadataForensicLineageEnabled() ||
    partyCount >= 3 ||
    (typeof import.meta !== "undefined" && import.meta.env?.DEV === true)
  );
}

function normEntityKey(name: string): string {
  return name.replace(/\s+/g, " ").trim().toLowerCase().replace(/[.,;:()'"]+/g, "");
}

export function stablePartyIdForLegalEntity(legalName: string, fallbackIndex = 0): string {
  const slug = legalName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  if (slug.length >= 2) return `party-${slug}`;
  return `party-slot-${fallbackIndex + 1}`;
}

function createBundleId(): string {
  return `cpm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function trimField(value: string | null | undefined): string {
  const t = String(value ?? "").replace(/\s+/g, " ").trim();
  return isPartyMetadataLabelValue(t) ? "" : t;
}

function trimPartyAddressField(value: string | null | undefined): string {
  return normalizeCanonicalPartyAddress(value);
}

function sanitizeSignerMetadataField(value: string | null | undefined): string {
  const raw = trimField(value);
  if (!raw) return "";
  const normalized = signerMetadataInputRaw(raw);
  return isPartyMetadataLabelValue(normalized) ? "" : normalized;
}

function recordFingerprint(p: CanonicalPartyMetadataRecord): string {
  return [p.partyId, p.partyLegalName, p.signerName, p.signerTitle, p.signerEmail, p.partyAddress].join("|");
}

export function computeCanonicalPartyMetadataBundleHash(
  parties: readonly CanonicalPartyMetadataRecord[],
): string {
  void parties.map(recordFingerprint);
  return hashPaidProSignerMetadataAuthority(
    parties.map((p, i) => ({
      partyIndex: i,
      partyLegalName: p.partyLegalName,
      signerName: p.signerName,
      signerTitle: p.signerTitle,
      signerEmail: p.signerEmail,
      partyAddress: p.partyAddress,
    })),
  );
}

function recordFromAuthorityParty(
  party: PaidProSignerMetadataParty,
  source: CanonicalPartyMetadataSource,
  existingPartyId?: string,
): CanonicalPartyMetadataRecord {
  const partyIndex = party.partyIndex ?? 0;
  const partyLegalName = trimField(party.partyLegalName);
  return {
    partyId: existingPartyId || stablePartyIdForLegalEntity(partyLegalName, partyIndex),
    partyIndex,
    partyLegalName,
    roleLabel: "",
    signerName: sanitizeSignerMetadataField(party.signerName),
    signerTitle: sanitizeSignerMetadataField(party.signerTitle),
    signerEmail: trimField(party.signerEmail),
    partyAddress: trimPartyAddressField(party.partyAddress),
    source,
  };
}

function intakeRecordForSlot(
  slot: {
    partyLegalName: string;
    signerName: string;
    signerTitle: string;
    signerEmail: string;
    partyAddress: string;
  },
  partyIndex: number,
  existingPartyId?: string,
): CanonicalPartyMetadataRecord {
  return recordFromAuthorityParty(
    {
      partyIndex,
      partyLegalName: slot.partyLegalName,
      signerName: slot.signerName,
      signerTitle: slot.signerTitle,
      signerEmail: slot.signerEmail,
      partyAddress: slot.partyAddress,
    },
    "structured_intake",
    existingPartyId,
  );
}

/** Unify intake parser, universal resolver, contacts, and handoff into canonical records. */
function synchronizeIntakeSignerMetadataIntoRecords(
  records: CanonicalPartyMetadataRecord[],
  args: {
    legalEntities: readonly string[];
    intakeText?: string | null;
    uiSignerNames?: readonly string[];
    uiSignerTitles?: readonly string[];
  },
): void {
  const legalEntities = args.legalEntities;
  if (records.length === 0 || legalEntities.length === 0) return;

  const intakeAligned = alignIntakeSignerMetadataToLegalEntities(args.intakeText, legalEntities);
  const resolved = resolveUniversalSignerMetadataBySlotForCanonicalSeed({
    legalEntities,
    intakeText: args.intakeText,
    corpusText: null,
    uiSignerNames: args.uiSignerNames,
    uiSignerTitles: args.uiSignerTitles,
  });
  const contacts = extractIntakeContacts(args.intakeText);
  const handoffSlots = linearPremiumRecipientSlots(readPremiumRecipientHandoff(), records.length);

  for (let i = 0; i < records.length; i += 1) {
    const record = records[i]!;
    const aligned = intakeAligned[i];
    if (aligned) {
      mergeRecordFields(record, intakeRecordForSlot(aligned, i, record.partyId));
    }
    const uni = resolved[i];
    if (uni?.signerName || uni?.signerTitle) {
      mergeRecordFields(
        record,
        intakeRecordForSlot(
          {
            partyLegalName: record.partyLegalName,
            signerName: uni.signerName,
            signerTitle: uni.signerTitle,
            signerEmail: "",
            partyAddress: "",
          },
          i,
          record.partyId,
        ),
      );
    }
    const emailHint =
      record.signerEmail.trim() ||
      aligned?.signerEmail.trim() ||
      handoffSlots[i]?.email.trim() ||
      "";
    let contact = emailHint
      ? contacts.find((c) => c.email.toLowerCase() === emailHint.toLowerCase())
      : undefined;
    if (!contact?.name.trim() && contacts[i]?.name.trim()) contact = contacts[i];
    if (contact?.name.trim() || contact?.title.trim() || contact?.email.trim()) {
      mergeRecordFields(
        record,
        intakeRecordForSlot(
          {
            partyLegalName: record.partyLegalName,
            signerName: contact.name,
            signerTitle: contact.title,
            signerEmail: contact.email,
            partyAddress: "",
          },
          i,
          record.partyId,
        ),
      );
    }
    const ho = handoffSlots[i];
    if (ho) {
      mergeRecordFields(
        record,
        recordFromAuthorityParty(
          {
            partyIndex: i,
            partyLegalName: ho.name || record.partyLegalName,
            signerName: ho.signerName || "",
            signerTitle: ho.signerTitle || "",
            signerEmail: ho.email || "",
            partyAddress: ho.partyAddress || "",
          },
          "freeze_snapshot",
          record.partyId,
        ),
      );
    }
  }
}

function mergeRecordFields(
  target: CanonicalPartyMetadataRecord,
  incoming: CanonicalPartyMetadataRecord,
): void {
  const userEdited =
    incoming.source === "user_edited_ui" ||
    incoming.source === "signer_setup_form" ||
    incoming.source === "signing_audit_event";
  const assign = (
    field: keyof Pick<
      CanonicalPartyMetadataRecord,
      "partyLegalName" | "roleLabel" | "signerName" | "signerTitle" | "signerEmail" | "partyAddress"
    >,
  ) => {
    const next = incoming[field].trim();
    if (!next) return;
    if (userEdited || !target[field].trim()) target[field] = next;
  };
  assign("partyLegalName");
  assign("roleLabel");
  assign("signerName");
  assign("signerTitle");
  assign("signerEmail");
  const nextAddress = incoming.partyAddress.trim();
  if (nextAddress) {
    const merged = mergeCanonicalPartyAddresses(target.partyAddress, nextAddress);
    const intakeEnrichment =
      incoming.source === "structured_intake" && target.partyAddress.trim().length > 0;
    if (!target.partyAddress.trim()) {
      target.partyAddress = merged;
    } else if (intakeEnrichment || !userEdited || merged.length >= target.partyAddress.length) {
      target.partyAddress = merged;
    }
  }
  if (userEdited) target.source = incoming.source;
  else if (incoming.source === "structured_intake" && target.source === "generic_placeholder") {
    target.source = incoming.source;
  }
}

export function findCanonicalPartyById(
  bundle: CanonicalPartyMetadataBundle | null | undefined,
  partyId: string,
): CanonicalPartyMetadataRecord | undefined {
  return bundle?.parties.find((p) => p.partyId === partyId);
}

export function findCanonicalPartyByLegalEntity(
  bundle: CanonicalPartyMetadataBundle | null | undefined,
  legalName: string,
): CanonicalPartyMetadataRecord | undefined {
  return bundle?.parties.find(
    (p) => p.partyLegalName.trim() && entitiesMatchForSignerMetadata(p.partyLegalName, legalName),
  );
}

function preservePartyIdsOnMerge(
  existing: CanonicalPartyMetadataBundle,
  incomingParties: CanonicalPartyMetadataRecord[],
): CanonicalPartyMetadataRecord[] {
  const byId = new Map(existing.parties.map((p) => [p.partyId, p]));
  const byEntity = new Map(
    existing.parties.filter((p) => p.partyLegalName.trim()).map((p) => [normEntityKey(p.partyLegalName), p]),
  );
  const count = Math.max(existing.parties.length, incomingParties.length);
  const out: CanonicalPartyMetadataRecord[] = [];
  for (let i = 0; i < count; i += 1) {
    const inc = incomingParties[i];
    const matched =
      (inc?.partyId && byId.get(inc.partyId)) ||
      (inc?.partyLegalName.trim() && byEntity.get(normEntityKey(inc.partyLegalName))) ||
      existing.parties[i];
    const base: CanonicalPartyMetadataRecord = matched
      ? { ...matched, partyIndex: i }
      : {
          partyId: stablePartyIdForLegalEntity(inc?.partyLegalName ?? "", i),
          partyIndex: i,
          partyLegalName: "",
          roleLabel: "",
          signerName: "",
          signerTitle: "",
          signerEmail: "",
          partyAddress: "",
          source: "generic_placeholder",
        };
    if (inc) mergeRecordFields(base, inc);
    out.push(base);
  }
  return out;
}

export function computeCanonicalPartyMetadataFieldCounts(
  bundle: CanonicalPartyMetadataBundle | null | undefined,
): CanonicalPartyMetadataFieldCounts {
  const parties = bundle?.parties ?? [];
  const missingFields: string[] = [];
  for (let i = 0; i < parties.length; i += 1) {
    const p = parties[i]!;
    const prefix = `party${i + 1}`;
    if (!p.partyLegalName.trim()) missingFields.push(`${prefix}.entity`);
    if (!p.signerName.trim()) missingFields.push(`${prefix}.signerName`);
    if (!p.signerTitle.trim()) missingFields.push(`${prefix}.title`);
    if (!p.signerEmail.trim()) missingFields.push(`${prefix}.email`);
    if (!p.partyAddress.trim()) missingFields.push(`${prefix}.address`);
  }
  return {
    partyCount: parties.length,
    entityCount: parties.filter((p) => p.partyLegalName.trim()).length,
    signerNameCount: parties.filter((p) => p.signerName.trim()).length,
    titleCount: parties.filter((p) => p.signerTitle.trim()).length,
    emailCount: parties.filter((p) => p.signerEmail.trim()).length,
    addressCount: parties.filter((p) => p.partyAddress.trim()).length,
    missingFields,
    source: bundle?.source ?? "none",
    bundleId: bundle?.bundleId ?? "",
    bundleHash: bundle?.bundleHash ?? "",
  };
}

function detectFieldCountLoss(
  prior: CanonicalPartyMetadataFieldCounts | null | undefined,
  next: CanonicalPartyMetadataFieldCounts,
): string[] {
  if (!prior) return [];
  const losses: string[] = [];
  for (const field of ["entityCount", "signerNameCount", "titleCount", "emailCount", "addressCount"] as const) {
    if (next[field] < prior[field]) losses.push(`${field}:${prior[field]}→${next[field]}`);
  }
  if (next.partyCount < prior.partyCount) losses.push(`partyCount:${prior.partyCount}→${next.partyCount}`);
  return losses;
}

export function logCanonicalPartyMetadataDiagnostics(
  stage: CanonicalPartyMetadataStage,
  bundle: CanonicalPartyMetadataBundle | null | undefined,
  prior?: CanonicalPartyMetadataFieldCounts | null,
): CanonicalPartyMetadataFieldCounts {
  const counts = computeCanonicalPartyMetadataFieldCounts(bundle);
  if (bundle?.bundleId) activeBundleId = bundle.bundleId;
  if (bundle?.bundleHash) activeBundleHash = bundle.bundleHash;
  if (diagnosticsEnabled(counts.partyCount)) {
    const losses = detectFieldCountLoss(prior ?? null, counts);
    const authoritySplit =
      counts.emailCount > counts.signerNameCount && counts.emailCount >= 2
        ? {
            authoritySplit: "email_without_signer_name" as const,
            emailCount: counts.emailCount,
            signerNameCount: counts.signerNameCount,
          }
        : null;
    // eslint-disable-next-line no-console
    console.info(STAGE_LOG_TAGS[stage], {
      ...counts,
      signerNameCount: counts.signerNameCount,
      signerEmailCount: counts.emailCount,
      signerTitleCount: counts.titleCount,
      addressCount: counts.addressCount,
      bundleId: counts.bundleId,
      bundleHash: counts.bundleHash,
      source: counts.source,
      fieldCounts: {
        entity: counts.entityCount,
        signerName: counts.signerNameCount,
        title: counts.titleCount,
        email: counts.emailCount,
        address: counts.addressCount,
      },
      partyIds: bundle?.parties.map((p) => p.partyId) ?? [],
      ...(losses.length ? { dataLoss: losses } : {}),
      ...(authoritySplit ?? {}),
    });
  }
  lastFieldCounts = counts;
  return counts;
}

function logProjection(stage: CanonicalPartyMetadataStage, surface: CanonicalProjectionSurface, bundle: CanonicalPartyMetadataBundle): void {
  if (!diagnosticsEnabled()) return;
  // eslint-disable-next-line no-console
  console.info("[canonical-party-metadata-projection]", {
    stage,
    surface,
    bundleId: bundle.bundleId,
    bundleHash: bundle.bundleHash,
    partyCount: bundle.parties.length,
    mutationAllowed: false,
  });
}

export function readCanonicalPartyMetadata(): CanonicalPartyMetadataBundle | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(CANONICAL_PARTY_METADATA_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CanonicalPartyMetadataBundle;
    if (!parsed?.parties?.length || !parsed.bundleId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function persistCanonicalPartyMetadata(bundle: CanonicalPartyMetadataBundle): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(CANONICAL_PARTY_METADATA_SESSION_KEY, JSON.stringify(bundle));
    activeBundleId = bundle.bundleId;
    activeBundleHash = bundle.bundleHash;
  } catch {
    /* ignore */
  }
}

export function clearCanonicalPartyMetadata(): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.removeItem(CANONICAL_PARTY_METADATA_SESSION_KEY);
  } catch {
    /* ignore */
  }
  activeBundleId = null;
  activeBundleHash = null;
  lastProjectionBundleId = null;
}

export function readActiveCanonicalBundleIdentity(): { bundleId: string | null; bundleHash: string | null } {
  return { bundleId: activeBundleId, bundleHash: activeBundleHash };
}

export function readLastCanonicalProjectionBundleId(): string | null {
  return lastProjectionBundleId;
}

export function canonicalBundleToAuthorityParties(
  bundle: CanonicalPartyMetadataBundle,
): PaidProSignerMetadataParty[] {
  return bundle.parties.map((p) => ({
    partyIndex: p.partyIndex,
    partyLegalName: p.partyLegalName,
    signerEmail: p.signerEmail,
    signerName: p.signerName,
    signerTitle: p.signerTitle,
    partyAddress: p.partyAddress,
  }));
}

function recordsFromUiParties(
  parties: readonly PaidProSignerMetadataParty[],
  source: CanonicalPartyMetadataSource,
  existing?: CanonicalPartyMetadataBundle | null,
): CanonicalPartyMetadataRecord[] {
  return parties.map((party, i) => {
    const legal = trimField(party.partyLegalName);
    const existingRecord =
      findCanonicalPartyByLegalEntity(existing ?? null, legal) || existing?.parties[i];
    return recordFromAuthorityParty(party, source, existingRecord?.partyId);
  });
}

export function buildCanonicalPartyMetadataBundle(args: {
  legalEntities?: readonly string[];
  intakeText?: string | null;
  uiParties?: readonly PaidProSignerMetadataParty[];
  consumedAuthority?: PaidProSignerMetadataAuthority | null;
  existing?: CanonicalPartyMetadataBundle | null;
  mutationSource?: CanonicalMutableMutationSource;
}): CanonicalPartyMetadataBundle {
  assertCanonicalMetadataNotFromAgreementBody(args.mutationSource ?? "");
  const now = new Date().toISOString();
  const legalEntities = resolveLegalEntitiesForCanonicalMetadata({
    legalEntities: args.legalEntities,
    intakeText: args.intakeText,
  });
  const partyCount =
    legalEntities.length >= 2
      ? legalEntities.length
      : Math.max(
          legalEntities.length,
          args.uiParties?.length ?? 0,
          args.consumedAuthority?.parties.length ?? 0,
          args.existing?.parties.length ?? 0,
          1,
        );
  const intakeAligned = alignIntakeSignerMetadataToLegalEntities(args.intakeText, legalEntities);
  const intakeRecords = intakeAligned.slice(0, partyCount).map((slot, i) => {
    const existingRecord = findCanonicalPartyByLegalEntity(args.existing ?? null, slot.partyLegalName);
    return recordFromAuthorityParty(
      {
        partyIndex: i,
        partyLegalName: slot.partyLegalName || legalEntities[i] || "",
        signerName: slot.signerName,
        signerTitle: slot.signerTitle,
        signerEmail: slot.signerEmail,
        partyAddress: slot.partyAddress,
      },
      "structured_intake",
      existingRecord?.partyId,
    );
  });
  const consumedRecords = (args.consumedAuthority?.parties ?? []).map((p, i) => {
    const existingRecord =
      findCanonicalPartyByLegalEntity(args.existing ?? null, p.partyLegalName) || args.existing?.parties[i];
    return recordFromAuthorityParty(p, "freeze_snapshot", existingRecord?.partyId);
  });
  const uiSource: CanonicalPartyMetadataSource =
    args.mutationSource === "signer_setup_form" || args.mutationSource === "signing_audit_event"
      ? args.mutationSource
      : "user_edited_ui";
  const uiRecords = recordsFromUiParties(args.uiParties ?? [], uiSource, args.existing);
  const merged: CanonicalPartyMetadataRecord[] = [];
  for (let i = 0; i < partyCount; i += 1) {
    const existingRecord = args.existing?.parties[i];
    const base: CanonicalPartyMetadataRecord = existingRecord
      ? { ...existingRecord, partyIndex: i }
      : {
          partyId: stablePartyIdForLegalEntity(legalEntities[i] ?? "", i),
          partyIndex: i,
          partyLegalName: legalEntities[i] ?? "",
          roleLabel: "",
          signerName: "",
          signerTitle: "",
          signerEmail: "",
          partyAddress: "",
          source: "generic_placeholder",
        };
    for (const layer of [intakeRecords[i], consumedRecords[i], uiRecords[i]].filter(Boolean) as CanonicalPartyMetadataRecord[]) {
      mergeRecordFields(base, layer);
    }
    merged.push(base);
  }
  synchronizeIntakeSignerMetadataIntoRecords(merged, {
    legalEntities,
    intakeText: args.intakeText,
    uiSignerNames: args.uiParties?.map((p) => p.signerName),
    uiSignerTitles: args.uiParties?.map((p) => p.signerTitle),
  });
  const hasUiSignal = uiRecords.some((p) => p.signerName || p.signerTitle || p.signerEmail || p.partyAddress);
  const hasIntakeSignal = intakeRecords.some(
    (p) => p.signerName || p.signerTitle || p.signerEmail || p.partyAddress || p.partyLegalName,
  );
  const hasConsumedSignal = consumedRecords.some(
    (p) => p.signerName || p.signerTitle || p.signerEmail || p.partyAddress,
  );
  let source: CanonicalPartyMetadataSource = "generic_placeholder";
  if (hasUiSignal) source = uiSource;
  else if (hasIntakeSignal) source = "structured_intake";
  else if (hasConsumedSignal) source = "freeze_snapshot";
  const parties = args.existing ? preservePartyIdsOnMerge(args.existing, merged) : merged;
  const bundleId = args.existing?.bundleId ?? createBundleId();
  return {
    bundleId,
    bundleHash: computeCanonicalPartyMetadataBundleHash(parties),
    parties,
    source,
    createdAt: args.existing?.createdAt ?? now,
    updatedAt: now,
  };
}

export type MutateCanonicalPartyMetadataArgs = {
  stage: CanonicalPartyMetadataStage;
  legalEntities?: readonly string[];
  intakeText?: string | null;
  uiParties?: readonly PaidProSignerMetadataParty[];
  mutationSource?: CanonicalMutableMutationSource;
  replaceSession?: boolean;
  project?: boolean;
};

export function mutateCanonicalPartyMetadata(args: MutateCanonicalPartyMetadataArgs): CanonicalPartyMetadataBundle {
  const existing = args.replaceSession ? null : readCanonicalPartyMetadata();
  const consumed = args.replaceSession ? null : readConsumedPaidProSignerMetadataAuthority();
  const mutationSource =
    args.mutationSource ??
    (args.uiParties?.some((p) => p.signerName.trim() || p.signerTitle.trim())
      ? "user_edited_ui"
      : "structured_intake");
  const built = buildCanonicalPartyMetadataBundle({
    legalEntities: args.legalEntities,
    intakeText: args.intakeText,
    uiParties: args.uiParties,
    consumedAuthority: consumed,
    existing,
    mutationSource,
  });
  persistCanonicalPartyMetadata(built);
  logCanonicalPartyMetadataDiagnostics(args.stage, built, lastFieldCounts);
  if (args.project !== false) projectCanonicalMetadataToSurfaces(built, args.stage);
  return built;
}

export function projectCanonicalMetadataToSurfaces(
  bundle: CanonicalPartyMetadataBundle,
  stage: CanonicalPartyMetadataStage = "review",
): { handoffWritten: boolean; consumedWritten: boolean; bundleId: string; bundleHash: string } {
  const authorityParties = canonicalBundleToAuthorityParties(bundle);
  const hasSignerSignal = authorityParties.some(
    (p) =>
      p.signerName.trim() ||
      p.signerTitle.trim() ||
      p.signerEmail.trim() ||
      p.partyAddress.trim(),
  );
  let handoffWritten = false;
  let consumedWritten = false;
  if (hasSignerSignal && authorityParties.length >= 2) {
    writePremiumRecipientHandoffFromAuthorityParties(authorityParties);
    handoffWritten = true;
    logProjection(stage, "handoff", bundle);
    setConsumedPaidProSignerMetadataAuthority(
      { parties: authorityParties, source: "live_ui", hash: bundle.bundleHash, updatedAt: Date.now() },
      { projectionBundleId: bundle.bundleId },
    );
    consumedWritten = true;
    logProjection(stage, "consumed_authority", bundle);
    lastProjectionBundleId = bundle.bundleId;
  }
  return { handoffWritten, consumedWritten, bundleId: bundle.bundleId, bundleHash: bundle.bundleHash };
}

export type EstablishCanonicalPartyMetadataArgs = MutateCanonicalPartyMetadataArgs & {
  persistHandoff?: boolean;
  promoteConsumedAuthority?: boolean;
  skipConsumedAuthority?: boolean;
};

export function establishCanonicalPartyMetadataAtStage(
  args: EstablishCanonicalPartyMetadataArgs,
): CanonicalPartyMetadataBundle {
  return mutateCanonicalPartyMetadata({
    stage: args.stage,
    legalEntities: args.legalEntities,
    intakeText: args.intakeText,
    uiParties: args.uiParties,
    mutationSource:
      args.uiParties?.some((p) => p.signerName.trim() || p.signerTitle.trim())
        ? "user_edited_ui"
        : "structured_intake",
    replaceSession: args.skipConsumedAuthority === true,
    project: args.persistHandoff !== false && args.promoteConsumedAuthority !== false,
  });
}

export function resetCanonicalPartyMetadataDiagnosticsForTests(): void {
  lastFieldCounts = null;
  clearCanonicalPartyMetadata();
}

export function mapCanonicalStageFromSeedStage(stage: string): CanonicalPartyMetadataStage {
  const s = stage.toLowerCase();
  if (s.includes("checkout")) return "after-checkout";
  if (s.includes("premium") || s.includes("completion")) return "after-premium";
  if (s.includes("freeze") || s.includes("finalize")) return "after-freeze";
  if (s.includes("prepare") || s.includes("packet")) return "prepare-signatures";
  if (s.includes("sign") && !s.includes("signer")) return "signing";
  if (s.includes("completed") || s.includes("pdf")) return "completed-snapshot";
  if (s.includes("email")) return "email-packets";
  if (s.includes("signer") || s.includes("recipient")) return "signer-setup";
  if (s.includes("review")) return "review";
  return "created";
}

export const CANONICAL_PARTY_METADATA_DEPENDENCY_MAP = [
  { stage: "Intake", input: "structured_intake", output: "CanonicalPartyMetadataBundle", mutation: true },
  { stage: "Pro seed", input: "canonical + intake", output: "handoff/consumed projection", mutation: true },
  { stage: "Review", input: "canonical_bundle", output: "UI projection", mutation: false },
  { stage: "Notices", input: "canonical_bundle", output: "corpus decoration", mutation: false },
  { stage: "Execution", input: "canonical_bundle", output: "corpus decoration", mutation: false },
  { stage: "Signer setup", input: "canonical_bundle", output: "form projection", mutation: true },
  { stage: "Email packets", input: "canonical_bundle", output: "recipient projection", mutation: false },
  { stage: "Signing", input: "canonical + audit", output: "audit projection", mutation: true },
  { stage: "Completed/PDF", input: "snapshot", output: "render", mutation: false },
] as const;
