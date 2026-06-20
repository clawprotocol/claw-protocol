/**
 * TEST315 — single review-link / reviewer display corpus with hydrated execution block.
 */

import type { AgreementDraft } from "../../agreement/agreementTypes";
import type { AuthoritativeSigningSnapshotRecipientMetadata } from "../../components/agreements/authoritativeSigningSnapshot";
import {
  getAuthoritativeSigningSnapshot,
  readAuthoritativeSigningCorpus,
} from "../../components/agreements/authoritativeSigningSnapshot";
import { enforcePaidProSingleExecutionBlock } from "../../components/agreements/paidProExecutionBlockNormalization";
import { countPaidProExecutionBlocks } from "../../components/agreements/paidProExecutionBlockAuthority";
import {
  detectExecutionHeadingMetadataLeak,
  repairExecutionBlockEntityHeadingLines,
} from "../../components/agreements/paidProExecutionBlockEntityHeading";
import {
  countBlankSignerMetadataLinesInExecutionBlock,
  hydratePaidProExecutionBlockWithSignerMetadata,
  signerMetadataAuthorityHasHydratableFields,
} from "../../components/agreements/hydratePaidProExecutionBlockWithSignerMetadata";
import { readPaidProPinnedSignerAppliedCorpus } from "../../components/agreements/paidProFinalHydratedCorpus";
import { ensureExecutionBlockNoticeContactFieldLines } from "../../components/agreements/paidProPartyNoticeDetails";
import { repairMalformedPaidProAgreementRecital } from "../../components/agreements/paidProAgreementRecitalRepair";
import { finalizePaidProSigningCorpusText } from "../../components/agreements/paidProSignerSigningCorpusHygiene";
import {
  authorityPartiesToRecipientMetadata,
  readConsumedPaidProSignerMetadataAuthority,
  recipientMetadataToAuthorityParties,
} from "../../components/agreements/paidProSignerMetadataAuthority";
import { hashPaidProCorpus } from "../../components/agreements/paidProSourceOfTruth";
import {
  linearPremiumRecipientSlots,
  readPremiumRecipientHandoff,
  type PremiumRecipientHandoffV2,
} from "../../components/agreements/premiumPartyNamesHandoff";
import { signerMetadataInputRaw } from "../../agreement/signerMetadataNormalize";
import { peekReviewFirstPinnedCorpus } from "./reviewFirstSendSurface";

const BLANK_SIG_ADDRESS_RE = /^address\s+for\s+notices?\s*:\s*(?:_{2,}\s*)?$/im;
const BLANK_SIG_NAME_RE = /^name\s*:\s*(?:_{2,}\s*)?$/im;
const BLANK_SIG_TITLE_RE = /^title\s*:\s*(?:_{2,}\s*)?$/im;
const BLANK_SIG_EMAIL_RE = /^email\s+for\s+notices?\s*:\s*(?:_{2,}\s*)?$/im;
const PARTY_SECTION_HEADING_RE =
  /^(?:CLIENT|SERVICE\s+PROVIDER|PARTY(?:\s+\d+)?)\s*:\s*(.*)$/i;
const SIG_FIELD_LINE_RE =
  /^(By|Name|Title|Date|Email\s+for\s+Notices?|Address\s+for\s+Notices?)\s*:\s*(.*)$/i;
const ENTITY_SUFFIX_LINE_RE =
  /\b(?:LLC|L\.L\.C\.|Inc\.?|Incorporated|Corp\.?|Corporation|Ltd\.?|Limited|LLP|PLLC|LP|L\.P\.)\b/i;

export type ReviewReadyMetadataResolveOptions = {
  corpusHints?: readonly string[];
  reviewTrackSurface?: boolean;
};

export type ReviewReadyAddressBackfillOptions = ReviewReadyMetadataResolveOptions & {
  surface?: ReviewReadyHydratedDisplayCorpusSurface | string;
};

export type ReviewReadyHydratedDisplayCorpusSurface =
  | "owner_done"
  | "reviewer"
  | "copy_export"
  | "review_link_mint";

export function recipientMetadataFromPremiumHandoff(
  handoff: PremiumRecipientHandoffV2,
  draft: AgreementDraft | null,
): AuthoritativeSigningSnapshotRecipientMetadata {
  const partyCount = Math.max(2, draft?.parties?.length ?? 2);
  const slots = linearPremiumRecipientSlots(handoff, partyCount);
  return {
    partySignerNames: slots.map((s) => signerMetadataInputRaw(s.signerName)),
    partySignerTitles: slots.map((s) => signerMetadataInputRaw(s.signerTitle)),
    partyAddresses: slots.map((s) => String(s.partyAddress ?? "").trim()),
    recipient1Name: slots[0]?.name?.trim() ?? "",
    recipient2Name: slots[1]?.name?.trim() ?? "",
    recipient1Email: slots[0]?.email?.trim() ?? "",
    recipient2Email: slots[1]?.email?.trim() ?? "",
    extraPartyReviewEmails: slots.slice(2).map((s) => s.email?.trim()).filter(Boolean),
  };
}

function requiredPartyAddresses(meta: AuthoritativeSigningSnapshotRecipientMetadata | null): string[] {
  if (!meta) return [];
  return (meta.partyAddresses ?? []).map((a) => String(a ?? "").trim()).filter(Boolean);
}

export function countBlankAddressLinesInExecutionBlock(corpus: string): number {
  const witnessIdx = (corpus || "").search(/\bIN WITNESS WHEREOF\b/i);
  if (witnessIdx < 0) return 0;
  const tail = corpus.slice(witnessIdx);
  return (tail.match(BLANK_SIG_ADDRESS_RE) || []).length;
}

function countBlankNameTitleEmailLinesInExecutionBlock(corpus: string): number {
  const witnessIdx = (corpus || "").search(/\bIN WITNESS WHEREOF\b/i);
  if (witnessIdx < 0) return 0;
  const tail = corpus.slice(witnessIdx);
  let count = 0;
  if (BLANK_SIG_NAME_RE.test(tail)) count += (tail.match(BLANK_SIG_NAME_RE) || []).length;
  if (BLANK_SIG_TITLE_RE.test(tail)) count += (tail.match(BLANK_SIG_TITLE_RE) || []).length;
  if (BLANK_SIG_EMAIL_RE.test(tail)) count += (tail.match(BLANK_SIG_EMAIL_RE) || []).length;
  return count;
}

/** Names/titles/emails present — used to skip full signing hygiene when only addresses are missing. */
export function corpusHasHydratedSignerNamesTitlesEmails(
  plain: string,
  meta: AuthoritativeSigningSnapshotRecipientMetadata | null,
): boolean {
  const body = (plain || "").trim();
  if (!body || !meta) return false;
  if (countPaidProExecutionBlocks(body) !== 1) return false;
  if (countBlankNameTitleEmailLinesInExecutionBlock(body) > 0) return false;
  const lower = body.toLowerCase();
  const requiredNames = (meta.partySignerNames ?? []).map((n) => String(n ?? "").trim()).filter(Boolean);
  if (requiredNames.length < 2) return false;
  return requiredNames.every((name) => lower.includes(name.toLowerCase()));
}

function isBlankSigFieldValue(value: string): boolean {
  const v = value.trim();
  return !v || /^_{2,}$/.test(v);
}

export function countBlankExecutionMetadataLines(corpus: string): number {
  return countBlankSignerMetadataLinesInExecutionBlock(corpus);
}

export function executionBlockHasBlankMetadataLines(corpus: string): boolean {
  return countBlankExecutionMetadataLines(corpus) > 0;
}

/** True when review-track plain text has signing-capacity fields for both parties (no notice-contact lines). */
export function reviewTrackExecutionMetadataComplete(plain: string): boolean {
  const body = (plain || "").trim();
  if (body.length < 80) return false;
  if (countPaidProExecutionBlocks(body) !== 1) return false;
  if (executionBlockHasBlankMetadataLines(body)) return false;

  const witnessIdx = body.search(/\bIN WITNESS WHEREOF\b/i);
  if (witnessIdx < 0) return false;
  const tail = body.slice(witnessIdx);
  if (/email\s+for\s+notices?\s*:/i.test(tail) || /address\s+for\s+notices?\s*:/i.test(tail)) {
    return false;
  }

  const filledNames = (tail.match(/^name\s*:\s*(.+)$/gim) ?? []).filter(
    (line) => !/^name\s*:\s*(?:_{2,}\s*)?$/i.test(line.trim()),
  ).length;
  const filledTitles = (tail.match(/^title\s*:\s*(.+)$/gim) ?? []).filter(
    (line) => !/^title\s*:\s*(?:_{2,}\s*)?$/i.test(line.trim()),
  ).length;

  return filledNames >= 2 && filledTitles >= 2;
}

/** Contact authority: notice addresses live in metadata/Notices clause, not execution blocks. */
export function executionBlockMissingAddressCarryover(
  _plain: string,
  _meta: AuthoritativeSigningSnapshotRecipientMetadata | null,
): boolean {
  return false;
}

export function isReviewTrackHydrationSurface(
  surface: ReviewReadyHydratedDisplayCorpusSurface | string | undefined,
): boolean {
  return (
    surface === "owner_done" ||
    surface === "reviewer" ||
    surface === "copy_export" ||
    surface === "review_link_mint"
  );
}

export function corpusHasFullyHydratedExecutionBlock(corpus: string): boolean {
  const body = (corpus || "").trim();
  if (body.length < 80) return false;
  if (countPaidProExecutionBlocks(body) !== 1) return false;
  if (executionBlockHasBlankMetadataLines(body)) return false;
  return reviewTrackExecutionMetadataComplete(body);
}

type PartyExecutionFields = {
  entity: string;
  signerName: string;
  signerTitle: string;
  email: string;
  address: string;
};

function extractPartyExecutionFieldsFromCorpus(plain: string): PartyExecutionFields[] {
  const result: PartyExecutionFields[] = [];
  const body = (plain || "").replace(/\r\n/g, "\n");
  const witnessIdx = body.search(/\bIN WITNESS WHEREOF\b/i);
  if (witnessIdx < 0) return result;

  const lines = body.slice(witnessIdx).split("\n");
  let current: PartyExecutionFields = {
    entity: "",
    signerName: "",
    signerTitle: "",
    email: "",
    address: "",
  };
  let inParty = false;

  const pushCurrent = () => {
    if (
      current.entity ||
      current.signerName ||
      current.signerTitle ||
      current.email ||
      current.address
    ) {
      result.push({ ...current });
    }
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || /^IN WITNESS WHEREOF\b/i.test(trimmed)) continue;

    const heading = trimmed.match(PARTY_SECTION_HEADING_RE);
    if (heading) {
      pushCurrent();
      const inline = (heading[1] ?? "").trim();
      current = {
        entity:
          inline && ENTITY_SUFFIX_LINE_RE.test(inline)
            ? inline.replace(/\(\s*(?:Client|Service\s+Provider)\s*\)\s*$/i, "").trim()
            : inline,
        signerName: "",
        signerTitle: "",
        email: "",
        address: "",
      };
      inParty = Boolean(current.entity);
      continue;
    }

    if (
      !SIG_FIELD_LINE_RE.test(trimmed) &&
      ENTITY_SUFFIX_LINE_RE.test(trimmed) &&
      !/^address\s+for\s+notice/i.test(trimmed)
    ) {
      pushCurrent();
      current = {
        entity: trimmed.replace(/\(\s*(?:Client|Service\s+Provider)\s*\)\s*$/i, "").trim(),
        signerName: "",
        signerTitle: "",
        email: "",
        address: "",
      };
      inParty = true;
      continue;
    }

    if (!inParty) continue;

    const nameM = trimmed.match(/^name\s*:\s*(.+)$/i);
    if (nameM && !isBlankSigFieldValue(nameM[1] ?? "")) {
      current.signerName = nameM[1]!.trim();
      continue;
    }
    const titleM = trimmed.match(/^title\s*:\s*(.+)$/i);
    if (titleM && !isBlankSigFieldValue(titleM[1] ?? "")) {
      current.signerTitle = titleM[1]!.trim();
      continue;
    }
    const emailM = trimmed.match(/^email\s+for\s+notices?\s*:\s*(.+)$/i);
    if (emailM && !isBlankSigFieldValue(emailM[1] ?? "")) {
      current.email = emailM[1]!.trim();
      continue;
    }
    const addrM = trimmed.match(/^address\s+for\s+notices?\s*:\s*(.+)$/i);
    if (addrM && !isBlankSigFieldValue(addrM[1] ?? "")) {
      current.address = addrM[1]!.trim();
    }
  }
  pushCurrent();
  return result;
}

function partyFieldsToRecipientMetadata(
  fields: readonly PartyExecutionFields[],
  seed: AuthoritativeSigningSnapshotRecipientMetadata | null,
  draft: AgreementDraft | null,
): AuthoritativeSigningSnapshotRecipientMetadata | null {
  if (fields.length < 2) return null;
  const hasSignal = fields.some(
    (p) => p.signerName || p.signerTitle || p.email || p.address,
  );
  if (!hasSignal) return null;

  const slotCount = Math.max(fields.length, 2);
  const partySignerNames: string[] = [];
  const partySignerTitles: string[] = [];
  const partyAddresses: string[] = [];
  const legalNames: string[] = [];

  for (let i = 0; i < slotCount; i++) {
    const field = fields[i];
    const seedLegal =
      i === 0
        ? seed?.recipient1Name
        : i === 1
          ? seed?.recipient2Name
          : "";
    const draftLegal = draft?.parties?.[i]?.name?.trim() ?? "";
    const entity = field?.entity?.trim() || seedLegal?.trim() || draftLegal || "";
    legalNames.push(entity);
    partySignerNames.push(field?.signerName?.trim() ?? "");
    partySignerTitles.push(field?.signerTitle?.trim() ?? "");
    partyAddresses.push(field?.address?.trim() ?? "");
  }

  return {
    partySignerNames,
    partySignerTitles,
    partyAddresses,
    recipient1Name: legalNames[0] ?? "",
    recipient2Name: legalNames[1] ?? "",
    recipient1Email: fields[0]?.email?.trim() || seed?.recipient1Email?.trim() || draft?.parties?.[0]?.email?.trim() || "",
    recipient2Email: fields[1]?.email?.trim() || seed?.recipient2Email?.trim() || draft?.parties?.[1]?.email?.trim() || "",
    extraPartyReviewEmails: seed?.extraPartyReviewEmails ?? [],
  };
}

function recipientMetadataFromExecutionBlockCorpus(
  corpus: string,
  seed: AuthoritativeSigningSnapshotRecipientMetadata | null,
  draft: AgreementDraft | null,
): AuthoritativeSigningSnapshotRecipientMetadata | null {
  const fields = extractPartyExecutionFieldsFromCorpus(corpus);
  return partyFieldsToRecipientMetadata(fields, seed, draft);
}

export type ReviewExecutionMetadataProvenance = {
  client: {
    nameSource: string;
    titleSource: string;
    emailSource: string;
    addressSource: string;
  };
  serviceProvider: {
    nameSource: string;
    titleSource: string;
    emailSource: string;
    addressSource: string;
  };
};

type TaggedRecipientMetadata = {
  id: string;
  meta: AuthoritativeSigningSnapshotRecipientMetadata;
};

function emptyProvenance(): ReviewExecutionMetadataProvenance {
  const slot = {
    nameSource: "none",
    titleSource: "none",
    emailSource: "none",
    addressSource: "none",
  };
  return { client: { ...slot }, serviceProvider: { ...slot } };
}

function mergeTaggedRecipientMetadataNonblankWins(
  sources: readonly TaggedRecipientMetadata[],
): { meta: AuthoritativeSigningSnapshotRecipientMetadata; provenance: ReviewExecutionMetadataProvenance } {
  if (sources.length === 0) {
    throw new Error("mergeTaggedRecipientMetadataNonblankWins requires at least one source");
  }
  const primary = sources[0]!.meta;
  const slotCount = Math.max(
    ...sources.map(({ meta: m }) =>
      Math.max(
        m.partySignerNames.length,
        m.partySignerTitles.length,
        (m.partyAddresses ?? []).length,
        2,
      ),
    ),
  );

  const partySignerNames: string[] = [];
  const partySignerTitles: string[] = [];
  const partyAddresses: string[] = [];
  const provenance = emptyProvenance();
  const partyKeys = ["client", "serviceProvider"] as const;

  for (let i = 0; i < slotCount; i++) {
    let name = "";
    let title = "";
    let addr = "";
    let nameSource = "none";
    let titleSource = "none";
    let addrSource = "none";
    for (const { id, meta: m } of sources) {
      const n = String(m.partySignerNames[i] ?? "").trim();
      const t = String(m.partySignerTitles[i] ?? "").trim();
      const a = String((m.partyAddresses ?? [])[i] ?? "").trim();
      if (!name && n) {
        name = n;
        nameSource = id;
      }
      if (!title && t) {
        title = t;
        titleSource = id;
      }
      if (!addr && a) {
        addr = a;
        addrSource = id;
      }
    }
    partySignerNames.push(name);
    partySignerTitles.push(title);
    partyAddresses.push(addr);
    if (i < 2) {
      const key = partyKeys[i]!;
      provenance[key].nameSource = nameSource;
      provenance[key].titleSource = titleSource;
      provenance[key].addressSource = addrSource;
    }
  }

  let recipient1Name = primary.recipient1Name;
  let recipient2Name = primary.recipient2Name;
  let recipient1Email = primary.recipient1Email;
  let recipient2Email = primary.recipient2Email;
  let r1EmailSource = provenance.client.emailSource;
  let r2EmailSource = provenance.serviceProvider.emailSource;

  for (const { id, meta: m } of sources) {
    if (!recipient1Name.trim() && m.recipient1Name.trim()) recipient1Name = m.recipient1Name;
    if (!recipient2Name.trim() && m.recipient2Name.trim()) recipient2Name = m.recipient2Name;
    if (!recipient1Email.trim() && m.recipient1Email.trim()) {
      recipient1Email = m.recipient1Email;
      r1EmailSource = id;
    }
    if (!recipient2Email.trim() && m.recipient2Email.trim()) {
      recipient2Email = m.recipient2Email;
      r2EmailSource = id;
    }
  }
  provenance.client.emailSource = r1EmailSource;
  provenance.serviceProvider.emailSource = r2EmailSource;

  return {
    meta: {
      ...primary,
      partySignerNames,
      partySignerTitles,
      partyAddresses,
      recipient1Name,
      recipient2Name,
      recipient1Email,
      recipient2Email,
    },
    provenance,
  };
}

function executionTailFromCorpus(corpus: string): string | null {
  const idx = corpus.search(/\bIN WITNESS WHEREOF\b/i);
  if (idx < 0) return null;
  return corpus.slice(idx).trim();
}

export function spliceHydratedExecutionTail(basePlain: string, hydratedPlain: string): string {
  const base = (basePlain || "").trim();
  const hintTail = executionTailFromCorpus(hydratedPlain);
  if (!hintTail) return base;
  const baseIdx = base.search(/\bIN WITNESS WHEREOF\b/i);
  if (baseIdx < 0) return base;
  const head = base.slice(0, baseIdx).trimEnd();
  const spliced = `${head}\n\n${hintTail}`.trim();
  if (countPaidProExecutionBlocks(spliced) > 1) {
    return enforcePaidProSingleExecutionBlock(spliced).text.trim();
  }
  return spliced;
}

export function findStrongestHydratedReviewCorpus(
  corpusHints: readonly string[],
): { corpus: string; source: string } | null {
  const prioritized: { id: string; corpus: string }[] = [
    { id: "pinned_finalized_corpus", corpus: readPaidProPinnedSignerAppliedCorpus() },
    { id: "authoritative_signing_snapshot", corpus: readAuthoritativeSigningCorpus() },
    { id: "finalized_signing", corpus: getAuthoritativeSigningSnapshot()?.corpus ?? "" },
  ];
  for (const hint of corpusHints) {
    prioritized.push({ id: "corpus_hint", corpus: hint });
  }

  const seen = new Set<string>();
  for (const { id, corpus } of prioritized) {
    const body = corpus.trim();
    if (body.length < 80 || seen.has(body)) continue;
    seen.add(body);
    if (corpusHasFullyHydratedExecutionBlock(body)) {
      return { corpus: body, source: id };
    }
  }
  return null;
}

function normalizeEntityKey(name: string): string {
  return name
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/[.,;:]+$/g, "");
}

/** Extract hydrated Address for Notice values keyed by canonical legal entity name. */
export function extractPartyAddressesFromExecutionBlockCorpus(
  plain: string,
): ReadonlyMap<string, string> {
  const result = new Map<string, string>();
  const body = (plain || "").replace(/\r\n/g, "\n");
  const witnessIdx = body.search(/\bIN WITNESS WHEREOF\b/i);
  if (witnessIdx < 0) return result;

  const lines = body.slice(witnessIdx).split("\n");
  let currentEntity = "";
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const heading = trimmed.match(PARTY_SECTION_HEADING_RE);
    if (heading) {
      const inline = (heading[1] ?? "").trim();
      currentEntity =
        inline && ENTITY_SUFFIX_LINE_RE.test(inline)
          ? inline.replace(/\(\s*(?:Client|Service\s+Provider)\s*\)\s*$/i, "").trim()
          : inline || trimmed.replace(/:.*/, "").trim();
      continue;
    }

    if (
      !SIG_FIELD_LINE_RE.test(trimmed) &&
      ENTITY_SUFFIX_LINE_RE.test(trimmed) &&
      !/^address\s+for\s+notice/i.test(trimmed)
    ) {
      currentEntity = trimmed.replace(/\(\s*(?:Client|Service\s+Provider)\s*\)\s*$/i, "").trim();
      continue;
    }

    const addrMatch = trimmed.match(/^address\s+for\s+notices?\s*:\s*(.+)$/i);
    if (addrMatch && currentEntity) {
      const val = String(addrMatch[1] ?? "").trim();
      if (!isBlankSigFieldValue(val)) {
        result.set(normalizeEntityKey(currentEntity), val);
      }
    }
  }
  return result;
}

function draftStringField(draft: AgreementDraft, key: keyof AgreementDraft): string {
  const v = draft[key];
  return typeof v === "string" ? v.trim() : "";
}

/** Draft fields that may hold the /app/create finalized hydrated corpus (reviewer routes). */
export function collectFinalizedCorpusHintsFromDraft(draft: AgreementDraft | null): string[] {
  if (!draft) return [];
  const hints = new Set<string>();
  const push = (text: string, minLen = 80) => {
    const body = (text || "").trim();
    if (body.length >= minLen) hints.add(body);
  };

  for (const key of [
    "premium_server_full_document_text",
    "server_full_document_text",
    "premium_full_document_text",
    "document_text",
    "rendered_document_text",
  ] as const) {
    push(draftStringField(draft, key));
  }

  const pr = draft.pro_redline_v1;
  const rf =
    pr && typeof pr === "object" && !Array.isArray(pr)
      ? (pr as Record<string, unknown>).review_first_final_corpus
      : null;
  if (rf && typeof rf === "object" && !Array.isArray(rf)) {
    push(String((rf as Record<string, unknown>).text ?? ""));
  }

  return [...hints];
}

export function collectReviewReadyCorpusHints(
  selectedPlain: string,
  draft: AgreementDraft | null,
): string[] {
  const hints = new Set<string>();
  const push = (text: string) => {
    const body = (text || "").trim();
    if (body.length >= 80) hints.add(body);
  };

  push(selectedPlain);
  push(readAuthoritativeSigningCorpus());
  push(readPaidProPinnedSignerAppliedCorpus());
  push(getAuthoritativeSigningSnapshot()?.corpus ?? "");

  for (const draftHint of collectFinalizedCorpusHintsFromDraft(draft)) {
    hints.add(draftHint);
  }

  const agreementId = String(draft?.id ?? "").trim();
  if (agreementId) {
    push(peekReviewFirstPinnedCorpus(agreementId) ?? "");
  }

  return [...hints];
}

/** Resolve signer metadata for review-ready surfaces when snapshot/consumed authority is absent. */
export function resolveReviewReadyRecipientMetadata(
  draft: AgreementDraft | null,
  options?: ReviewReadyMetadataResolveOptions,
): AuthoritativeSigningSnapshotRecipientMetadata | null {
  const sources: TaggedRecipientMetadata[] = [];
  const metadataSourcesChecked: string[] = [];

  const corpusHints = collectReviewReadyCorpusHints("", draft);
  for (const hint of options?.corpusHints ?? []) {
    if (hint.trim().length >= 80) corpusHints.push(hint.trim());
  }
  const uniqueCorpusHints = [...new Set(corpusHints)];

  const strongest = findStrongestHydratedReviewCorpus(uniqueCorpusHints);
  if (strongest) {
    const extracted = recipientMetadataFromExecutionBlockCorpus(strongest.corpus, null, draft);
    if (extracted && signerMetadataAuthorityHasHydratableFields(extracted)) {
      sources.push({ id: strongest.source, meta: extracted });
      metadataSourcesChecked.push(strongest.source);
    }
  }

  for (const corpus of uniqueCorpusHints) {
    const extracted = recipientMetadataFromExecutionBlockCorpus(
      corpus,
      sources[0]?.meta ?? null,
      draft,
    );
    if (
      extracted &&
      signerMetadataAuthorityHasHydratableFields(extracted) &&
      !sources.some((s) => s.meta === extracted)
    ) {
      sources.push({ id: "execution_block_corpus", meta: extracted });
      metadataSourcesChecked.push("execution_block_corpus");
    }
  }

  const consumed = readConsumedPaidProSignerMetadataAuthority();
  if (consumed && consumed.parties.length >= 2) {
    const meta = authorityPartiesToRecipientMetadata(consumed.parties);
    if (signerMetadataAuthorityHasHydratableFields(meta)) {
      sources.push({ id: "consumed_signer_authority", meta });
      metadataSourcesChecked.push("consumed_signer_authority");
    }
  }

  const snapshotMeta = getAuthoritativeSigningSnapshot()?.signerMetadata;
  if (snapshotMeta && signerMetadataAuthorityHasHydratableFields(snapshotMeta)) {
    sources.push({
      id: "authoritative_signing_snapshot",
      meta: { ...snapshotMeta, partyAddresses: snapshotMeta.partyAddresses ?? [] },
    });
    metadataSourcesChecked.push("authoritative_signing_snapshot");
  }

  const handoff = readPremiumRecipientHandoff();
  if (handoff) {
    const meta = recipientMetadataFromPremiumHandoff(handoff, draft);
    if (signerMetadataAuthorityHasHydratableFields(meta)) {
      const partialHandoff = requiredPartyAddresses(meta).length < 2;
      sources.push({
        id: partialHandoff ? "premium_recipient_handoff_partial" : "premium_recipient_handoff",
        meta,
      });
      metadataSourcesChecked.push(
        partialHandoff ? "premium_recipient_handoff_partial" : "premium_recipient_handoff",
      );
    }
  }

  if (sources.length === 0) {
    lastReviewReadyMetadataSourcesChecked = [];
    lastReviewExecutionMetadataProvenance = emptyProvenance();
    return null;
  }

  const merged = mergeTaggedRecipientMetadataNonblankWins(sources);
  lastReviewReadyMetadataSourcesChecked = [...new Set(metadataSourcesChecked)];
  lastReviewExecutionMetadataProvenance = merged.provenance;
  return merged.meta;
}

let lastReviewExecutionMetadataProvenance: ReviewExecutionMetadataProvenance = emptyProvenance();

export function readReviewExecutionMetadataProvenance(): ReviewExecutionMetadataProvenance {
  return lastReviewExecutionMetadataProvenance;
}

let lastReviewReadyMetadataSourcesChecked: string[] = [];

export function readReviewReadyMetadataSourcesChecked(): string[] {
  return [...lastReviewReadyMetadataSourcesChecked];
}

function countSignerMetadataSlots(meta: AuthoritativeSigningSnapshotRecipientMetadata | null): {
  slotsWithSignerName: number;
  slotsWithSignerTitle: number;
} {
  if (!meta) return { slotsWithSignerName: 0, slotsWithSignerTitle: 0 };
  const names = meta.partySignerNames ?? [];
  const titles = meta.partySignerTitles ?? [];
  return {
    slotsWithSignerName: names.filter((n) => String(n ?? "").trim().length > 0).length,
    slotsWithSignerTitle: titles.filter((t) => String(t ?? "").trim().length > 0).length,
  };
}

export function corpusHasHydratedSignerMetadata(
  plain: string,
  meta: AuthoritativeSigningSnapshotRecipientMetadata | null,
  options?: { reviewTrackSurface?: boolean },
): boolean {
  const body = (plain || "").trim();
  if (!body || !meta) return false;
  if (countPaidProExecutionBlocks(body) !== 1) return false;
  if (executionBlockHasBlankMetadataLines(body)) return false;

  const lower = body.toLowerCase();
  const requiredNames = (meta.partySignerNames ?? []).map((n) => String(n ?? "").trim()).filter(Boolean);
  if (requiredNames.length < 2) return false;
  if (!requiredNames.every((name) => lower.includes(name.toLowerCase()))) return false;

  if (options?.reviewTrackSurface && !reviewTrackExecutionMetadataComplete(body)) {
    return false;
  }

  return true;
}

/**
 * Apply signer execution-block hydration without mutating stores or creating duplicate blocks.
 */
export function applyReviewReadySignerExecutionHydration(
  basePlain: string,
  draft: AgreementDraft | null,
  options?: ReviewReadyMetadataResolveOptions,
): string {
  const base = (basePlain || "").trim();
  if (base.length < 80) return base;

  const corpusHints = collectReviewReadyCorpusHints(base, draft);
  for (const hint of options?.corpusHints ?? []) {
    if (hint.trim().length >= 80) corpusHints.push(hint.trim());
  }
  const recipientMeta = resolveReviewReadyRecipientMetadata(draft, {
    corpusHints: [...new Set(corpusHints)],
  });
  if (!recipientMeta || !signerMetadataAuthorityHasHydratableFields(recipientMeta)) {
    return base;
  }

  if (
    corpusHasHydratedSignerMetadata(base, recipientMeta, {
      reviewTrackSurface: options?.reviewTrackSurface ?? false,
    })
  ) {
    return base;
  }

  const parties = recipientMetadataToAuthorityParties(recipientMeta);
  const earlyHydration = hydratePaidProExecutionBlockWithSignerMetadata(base, recipientMeta, {
    acceptedCorpus: base,
  });
  if (
    earlyHydration.applied &&
    corpusHasHydratedSignerMetadata(earlyHydration.corpus, recipientMeta, {
      reviewTrackSurface: options?.reviewTrackSurface ?? false,
    })
  ) {
    return preserveHydratedExecutionBlockOnEnforce(earlyHydration.corpus);
  }

  let out = base;
  const namesTitlesEmailsHydrated = corpusHasHydratedSignerNamesTitlesEmails(base, recipientMeta);
  if (parties.length >= 2 && !namesTitlesEmailsHydrated) {
    out = repairMalformedPaidProAgreementRecital(out, parties).text;
  }

  out = ensureExecutionBlockNoticeContactFieldLines(out).text;
  if (parties.length >= 2 && !namesTitlesEmailsHydrated) {
    out = finalizePaidProSigningCorpusText(out, parties, { acceptedCorpus: base }).text;
  }

  const hydration = hydratePaidProExecutionBlockWithSignerMetadata(out, recipientMeta, {
    acceptedCorpus: base,
  });
  if (hydration.applied) {
    out = hydration.corpus;
  } else if (
    countBlankSignerMetadataLinesInExecutionBlock(out) > 0
  ) {
    const retry = hydratePaidProExecutionBlockWithSignerMetadata(base, recipientMeta, {
      acceptedCorpus: base,
    });
    if (retry.applied) out = retry.corpus;
  }

  if (detectExecutionHeadingMetadataLeak(out).leak && parties.length >= 2) {
    out = repairExecutionBlockEntityHeadingLines(out, parties).text.trim();
  }

  return preserveHydratedExecutionBlockOnEnforce(out);
}

function preserveHydratedExecutionBlockOnEnforce(corpus: string): string {
  const body = (corpus || "").trim();
  if (!body) return body;
  const wasFullyHydrated = corpusHasFullyHydratedExecutionBlock(body);
  const enforced = enforcePaidProSingleExecutionBlock(body);
  if (wasFullyHydrated && !corpusHasFullyHydratedExecutionBlock(enforced.text)) {
    return body;
  }
  return enforced.text.trim();
}

function executionMetadataPresenceFlags(
  plain: string,
  meta: AuthoritativeSigningSnapshotRecipientMetadata | null,
): {
  hasClientName: boolean;
  hasClientTitle: boolean;
  hasClientEmail: boolean;
  hasClientAddress: boolean;
  hasServiceProviderName: boolean;
  hasServiceProviderTitle: boolean;
  hasServiceProviderEmail: boolean;
  hasServiceProviderAddress: boolean;
} {
  const lower = (plain || "").toLowerCase();
  const names = meta?.partySignerNames ?? [];
  const titles = meta?.partySignerTitles ?? [];
  const addrs = meta?.partyAddresses ?? [];
  const r1Email = meta?.recipient1Email?.trim() ?? "";
  const r2Email = meta?.recipient2Email?.trim() ?? "";
  const includes = (value: string) => value.length > 0 && lower.includes(value.toLowerCase());

  return {
    hasClientName: includes(names[0] ?? ""),
    hasClientTitle: includes(titles[0] ?? ""),
    hasClientEmail: includes(r1Email),
    hasClientAddress: includes(addrs[0] ?? ""),
    hasServiceProviderName: includes(names[1] ?? ""),
    hasServiceProviderTitle: includes(titles[1] ?? ""),
    hasServiceProviderEmail: includes(r2Email),
    hasServiceProviderAddress: includes(addrs[1] ?? ""),
  };
}

/** Late-binding full metadata backfill after review corpus selection. */
export function applyReviewReadyMetadataBackfill(
  plain: string,
  draft: AgreementDraft | null,
  options?: ReviewReadyAddressBackfillOptions & { selectedSource?: string },
): string {
  const before = (plain || "").trim();
  if (before.length < 80) return before;

  const corpusHints = collectReviewReadyCorpusHints(before, draft);
  for (const hint of options?.corpusHints ?? []) {
    if (hint.trim().length >= 80) corpusHints.push(hint.trim());
  }
  const uniqueHints = [...new Set(corpusHints)];
  const meta = resolveReviewReadyRecipientMetadata(draft, { corpusHints: uniqueHints });
  const beforeHash = hashPaidProCorpus(before);
  const selectedSource = options?.selectedSource ?? options?.surface ?? "unknown";
  const reviewTrack = isReviewTrackHydrationSurface(options?.surface);

  const hasBlankLines = executionBlockHasBlankMetadataLines(before);
  const needsAddressCarryover =
    reviewTrack && executionBlockMissingAddressCarryover(before, meta);
  const alreadyHydrated = meta
    ? corpusHasHydratedSignerMetadata(before, meta, { reviewTrackSurface: reviewTrack })
    : false;

  if (!hasBlankLines && alreadyHydrated && !needsAddressCarryover && reviewTrackExecutionMetadataComplete(before)) {
    logTest319ReviewerExecutionMetadataSource({
      surface: options?.surface ?? "unknown",
      selectedCorpusSource: selectedSource,
      beforePlain: before,
      afterPlain: before,
      meta,
      hydrationSource: "metadata_backfill_skip",
      beforeHash,
      afterHash: beforeHash,
    });
    logTest318ReviewMetadataCarryover({
      surface: options?.surface ?? "unknown",
      selectedSource,
      hydrationSource: "metadata_backfill_skip",
      beforePlain: before,
      afterPlain: before,
      meta,
      beforeHash,
      afterHash: beforeHash,
    });
    return before;
  }

  let working = before;
  let hydrationSource = "none";

  if (hasBlankLines || needsAddressCarryover || (meta && !alreadyHydrated)) {
    const strongest = findStrongestHydratedReviewCorpus(uniqueHints);
    if (strongest && strongest.corpus.trim() !== before) {
      const spliced = spliceHydratedExecutionTail(before, strongest.corpus);
      if (spliced !== before) {
        working = spliced;
        hydrationSource = `splice_${strongest.source}`;
      }
    }
  }

  const splicedFullyHydrated = corpusHasFullyHydratedExecutionBlock(working);
  if (
    !splicedFullyHydrated &&
    (!meta ||
      !corpusHasHydratedSignerMetadata(working, meta, { reviewTrackSurface: reviewTrack }))
  ) {
    const hydrated = applyReviewReadySignerExecutionHydration(working, draft, {
      corpusHints: uniqueHints,
      reviewTrackSurface: reviewTrack,
    });
    if (hydrated !== working) {
      working = hydrated;
      if (hydrationSource === "none") hydrationSource = "signer_execution_hydration";
    }
  }

  logTest319ReviewerExecutionMetadataSource({
    surface: options?.surface ?? "unknown",
    selectedCorpusSource: selectedSource,
    beforePlain: before,
    afterPlain: working,
    meta,
    hydrationSource,
    beforeHash,
    afterHash: hashPaidProCorpus(working),
  });

  logTest318ReviewMetadataCarryover({
    surface: options?.surface ?? "unknown",
    selectedSource,
    hydrationSource,
    beforePlain: before,
    afterPlain: working,
    meta,
    beforeHash,
    afterHash: hashPaidProCorpus(working),
  });

  logTest317ReviewAddressCarryover({
    surface: options?.surface ?? "unknown",
    source: hydrationSource,
    beforePlain: before,
    afterPlain: working,
    meta,
    beforeHash,
    afterHash: hashPaidProCorpus(working),
  });

  return working;
}

/** @deprecated Use applyReviewReadyMetadataBackfill — kept for call-site compatibility. */
export function applyReviewReadyAddressBackfill(
  plain: string,
  draft: AgreementDraft | null,
  options?: ReviewReadyAddressBackfillOptions,
): string {
  return applyReviewReadyMetadataBackfill(plain, draft, options);
}

let lastTest315ReviewCopyHydrationKey = "";
let lastTest316ReviewAddressHydrationKey = "";
let lastTest317ReviewAddressCarryoverKey = "";
let lastTest318ReviewMetadataCarryoverKey = "";
let lastTest319ReviewerExecutionMetadataSourceKey = "";
let lastTest320ReviewerVisibleExecutionMetadataKey = "";

export function resetPaidProTest315ReviewCopyHydrationLogsForTests(): void {
  lastTest315ReviewCopyHydrationKey = "";
  lastTest316ReviewAddressHydrationKey = "";
  lastTest317ReviewAddressCarryoverKey = "";
  lastTest318ReviewMetadataCarryoverKey = "";
  lastTest319ReviewerExecutionMetadataSourceKey = "";
  lastTest320ReviewerVisibleExecutionMetadataKey = "";
  lastReviewReadyMetadataSourcesChecked = [];
  lastReviewExecutionMetadataProvenance = emptyProvenance();
}

function visibleDocumentInspectionText(plain: string, html: string): string {
  const body = (plain || "").trim();
  const htmlBody = (html || "")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, "\n")
    .replace(/\s+/g, " ")
    .trim();
  if (!htmlBody) return body;
  return `${body}\n${htmlBody}`.trim();
}

export function logTest320ReviewVisibleExecutionMetadata(args: {
  surface: ReviewReadyHydratedDisplayCorpusSurface | string;
  selectedCorpusSource: string;
  visiblePlain: string;
  visibleHtml?: string;
  draft?: AgreementDraft | null;
}): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  const plain = (args.visiblePlain || "").trim();
  if (!plain) return;
  const inspect = visibleDocumentInspectionText(plain, args.visibleHtml ?? "");
  const meta = resolveReviewReadyRecipientMetadata(args.draft ?? null, {
    corpusHints: collectReviewReadyCorpusHints(plain, args.draft ?? null),
  });
  const flags = executionMetadataPresenceFlags(inspect, meta);
  const provenance = readReviewExecutionMetadataProvenance();
  const payload = {
    surface: args.surface,
    selectedCorpusSource: args.selectedCorpusSource,
    finalRenderHash: hashPaidProCorpus(inspect),
    executionBlockCount: countPaidProExecutionBlocks(plain),
    blankMetadataLineCount: countBlankExecutionMetadataLines(plain),
    addressLinesBlank: countBlankAddressLinesInExecutionBlock(plain),
    metadataSourceUsed: provenance,
    reviewTrackComplete: reviewTrackExecutionMetadataComplete(plain),
    ...flags,
  };
  const key = JSON.stringify(payload);
  if (key === lastTest320ReviewerVisibleExecutionMetadataKey) return;
  lastTest320ReviewerVisibleExecutionMetadataKey = key;
  // eslint-disable-next-line no-console
  console.info("[test320-reviewer-visible-execution-metadata]", payload);
  if (
    typeof import.meta !== "undefined" &&
    import.meta.env?.DEV &&
    isReviewTrackHydrationSurface(args.surface) &&
    (payload.blankMetadataLineCount > 0 ||
      payload.addressLinesBlank > 0 ||
      !flags.hasClientAddress ||
      !flags.hasServiceProviderAddress)
  ) {
    // eslint-disable-next-line no-console
    console.warn("[test320-reviewer-visible-execution-metadata-leak]", payload);
  }
}

export function logTest319ReviewerExecutionMetadataSource(args: {
  surface: ReviewReadyHydratedDisplayCorpusSurface | string;
  selectedCorpusSource: string;
  hydrationSource: string;
  beforePlain: string;
  afterPlain: string;
  meta: AuthoritativeSigningSnapshotRecipientMetadata | null;
  beforeHash: string;
  afterHash: string;
}): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  const after = (args.afterPlain || "").trim();
  if (!after) return;
  const flags = executionMetadataPresenceFlags(after, args.meta);
  const provenance = readReviewExecutionMetadataProvenance();
  const payload = {
    surface: args.surface,
    selectedCorpusSource: args.selectedCorpusSource,
    hydrationSource: args.hydrationSource,
    metadataSourceUsed: provenance,
    executionBlockCount: countPaidProExecutionBlocks(after),
    blankMetadataLineCount: countBlankExecutionMetadataLines(after),
    metadataSourcesChecked: readReviewReadyMetadataSourcesChecked(),
    beforeHash: args.beforeHash,
    afterHash: args.afterHash,
    ...flags,
  };
  const key = JSON.stringify(payload);
  if (key === lastTest319ReviewerExecutionMetadataSourceKey) return;
  lastTest319ReviewerExecutionMetadataSourceKey = key;
  // eslint-disable-next-line no-console
  console.info("[test319-reviewer-execution-metadata-source]", payload);
  if (
    typeof import.meta !== "undefined" &&
    import.meta.env?.DEV &&
    args.meta &&
    signerMetadataAuthorityHasHydratableFields(args.meta) &&
    isReviewTrackHydrationSurface(args.surface) &&
    (payload.blankMetadataLineCount > 0 ||
      !flags.hasClientAddress ||
      !flags.hasServiceProviderAddress)
  ) {
    // eslint-disable-next-line no-console
    console.warn("[test319-reviewer-execution-metadata-source-leak]", payload);
  }
}

export function logTest318ReviewMetadataCarryover(args: {
  surface: ReviewReadyHydratedDisplayCorpusSurface | string;
  selectedSource: string;
  hydrationSource: string;
  beforePlain: string;
  afterPlain: string;
  meta: AuthoritativeSigningSnapshotRecipientMetadata | null;
  beforeHash: string;
  afterHash: string;
}): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  const after = (args.afterPlain || "").trim();
  if (!after) return;
  const flags = executionMetadataPresenceFlags(after, args.meta);
  const payload = {
    surface: args.surface,
    selectedSource: args.selectedSource,
    hydrationSource: args.hydrationSource,
    executionBlockCount: countPaidProExecutionBlocks(after),
    blankMetadataLineCount: countBlankExecutionMetadataLines(after),
    metadataSourcesChecked: readReviewReadyMetadataSourcesChecked(),
    beforeHash: args.beforeHash,
    afterHash: args.afterHash,
    ...flags,
  };
  const key = JSON.stringify(payload);
  if (key === lastTest318ReviewMetadataCarryoverKey) return;
  lastTest318ReviewMetadataCarryoverKey = key;
  // eslint-disable-next-line no-console
  console.info("[test318-review-metadata-carryover]", payload);
  if (
    typeof import.meta !== "undefined" &&
    import.meta.env?.DEV &&
    args.meta &&
    signerMetadataAuthorityHasHydratableFields(args.meta) &&
    (payload.blankMetadataLineCount > 0 ||
      !flags.hasClientName ||
      !flags.hasServiceProviderName)
  ) {
    // eslint-disable-next-line no-console
    console.warn("[test318-review-metadata-carryover-leak]", payload);
  }
}

export function logTest317ReviewAddressCarryover(args: {
  surface: ReviewReadyHydratedDisplayCorpusSurface | string;
  source: string;
  beforePlain: string;
  afterPlain: string;
  meta: AuthoritativeSigningSnapshotRecipientMetadata | null;
  beforeHash: string;
  afterHash: string;
}): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  const after = (args.afterPlain || "").trim();
  if (!after) return;
  const addresses = requiredPartyAddresses(args.meta);
  const lower = after.toLowerCase();
  const payload = {
    surface: args.surface,
    source: args.source,
    hasClientAddress:
      addresses.length >= 1 ? lower.includes(addresses[0]!.trim().toLowerCase()) : false,
    hasServiceProviderAddress:
      addresses.length >= 2 ? lower.includes(addresses[1]!.trim().toLowerCase()) : false,
    addressLinesBlank: countBlankAddressLinesInExecutionBlock(after),
    metadataSourcesChecked: readReviewReadyMetadataSourcesChecked(),
    executionBlockCount: countPaidProExecutionBlocks(after),
    beforeHash: args.beforeHash,
    afterHash: args.afterHash,
  };
  const key = JSON.stringify(payload);
  if (key === lastTest317ReviewAddressCarryoverKey) return;
  lastTest317ReviewAddressCarryoverKey = key;
  // eslint-disable-next-line no-console
  console.info("[test317-review-address-carryover]", payload);
  if (
    typeof import.meta !== "undefined" &&
    import.meta.env?.DEV &&
    args.meta &&
    addresses.length > 0 &&
    (payload.addressLinesBlank > 0 || !payload.hasClientAddress || !payload.hasServiceProviderAddress)
  ) {
    // eslint-disable-next-line no-console
    console.warn("[test317-review-address-carryover-leak]", payload);
  }
}

export function logTest315ReviewCopyHydration(args: {
  surface: ReviewReadyHydratedDisplayCorpusSurface | string;
  source: string;
  plain: string;
  draft?: AgreementDraft | null;
}): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  const plain = (args.plain || "").trim();
  if (!plain) return;
  const meta = resolveReviewReadyRecipientMetadata(args.draft ?? null, {
    corpusHints: collectReviewReadyCorpusHints(plain, args.draft ?? null),
  });
  const slots = countSignerMetadataSlots(meta);
  const lower = plain.toLowerCase();
  const addresses = requiredPartyAddresses(meta);
  const addressLinesBlank = countBlankAddressLinesInExecutionBlock(plain);
  const hasClientAddress =
    addresses.length >= 1 ? lower.includes(addresses[0]!.trim().toLowerCase()) : false;
  const hasServiceProviderAddress =
    addresses.length >= 2 ? lower.includes(addresses[1]!.trim().toLowerCase()) : false;
  const payload = {
    surface: args.surface,
    source: args.source,
    len: plain.length,
    hash: plain.length >= 80 ? hashPaidProCorpus(plain) : null,
    hasExecutionBlock: /\bIN WITNESS WHEREOF\b/i.test(plain),
    executionBlockCount: countPaidProExecutionBlocks(plain),
    slotsWithSignerName: slots.slotsWithSignerName,
    slotsWithSignerTitle: slots.slotsWithSignerTitle,
    hasSarahMitchell: lower.includes("sarah mitchell"),
    hasMichaelTorres: lower.includes("michael torres"),
    blankSignerLinesRemaining: countBlankSignerMetadataLinesInExecutionBlock(plain),
    slotsWithPartyAddress: addresses.length,
    hasClientAddress,
    hasServiceProviderAddress,
    addressLinesBlank,
  };
  const key = JSON.stringify(payload);
  if (key === lastTest315ReviewCopyHydrationKey) return;
  lastTest315ReviewCopyHydrationKey = key;
  // eslint-disable-next-line no-console
  console.info("[test315-review-copy-hydration]", payload);

  const addressPayload = {
    surface: args.surface,
    source: args.source,
    hasClientAddress,
    hasServiceProviderAddress,
    addressLinesBlank,
    executionBlockCount: countPaidProExecutionBlocks(plain),
    slotsWithPartyAddress: addresses.length,
  };
  const addressKey = JSON.stringify(addressPayload);
  if (addressKey !== lastTest316ReviewAddressHydrationKey) {
    lastTest316ReviewAddressHydrationKey = addressKey;
    // eslint-disable-next-line no-console
    console.info("[test316-review-address-hydration]", addressPayload);
  }

  if (
    typeof import.meta !== "undefined" &&
    import.meta.env?.DEV &&
    meta &&
    slots.slotsWithSignerName >= 2 &&
    slots.slotsWithSignerTitle >= 2 &&
    !corpusHasHydratedSignerMetadata(plain, meta)
  ) {
    // eslint-disable-next-line no-console
    console.warn("[test315-review-copy-hydration-leak]", payload);
  }
}

let lastTest323ReviewerVisibleClauseParityKey = "";

export function logTest323ReviewerVisibleClauseParity(payload: {
  agreementId: string | null;
  surface: string;
  selectedCorpusSource: string;
  selectedCorpusHash: string;
  visibleTextHash: string;
  copyExportHash: string;
  hasSection9HeadingInCorpus: boolean;
  hasSection9BodyInCorpus: boolean;
  hasSection9HeadingInVisibleHtml: boolean;
  hasSection9BodyInVisibleHtml: boolean;
  hasSection9HeadingInCopyExport: boolean;
  hasSection9BodyInCopyExport: boolean;
  clauseCountBeforePolish: number;
  clauseCountAfterPolish: number;
  droppedHeadingNumbers: number[];
}): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  const key = JSON.stringify(payload);
  if (key === lastTest323ReviewerVisibleClauseParityKey) return;
  lastTest323ReviewerVisibleClauseParityKey = key;
  // eslint-disable-next-line no-console
  console.info("[test323-reviewer-visible-clause-parity]", payload);
  if (
    typeof import.meta !== "undefined" &&
    import.meta.env?.DEV &&
    (payload.droppedHeadingNumbers.length > 0 ||
      (payload.hasSection9BodyInCopyExport && !payload.hasSection9BodyInVisibleHtml))
  ) {
    // eslint-disable-next-line no-console
    console.warn("[test323-reviewer-visible-clause-parity-leak]", payload);
  }
}
