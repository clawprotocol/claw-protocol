/**
 * Universal signer metadata authority — names/titles must not disappear across Paid Pro lifecycle.
 *
 * Authority hierarchy (highest wins; lower ranks fill only empty slots):
 * 1. user_edited_ui — applied at hydration boundary (never overwrite non-empty UI)
 * 2. persisted_handoff / authoritative_snapshot
 * 3. draft_party_fields
 * 4. intake_structured_contacts + intake_natural_language
 * 5. generated_corpus_inference
 */

import { normalizeSignerMetadataForSave } from "../../agreement/signerMetadataNormalize";
import { extractIntakeContacts } from "./paidProIntakeContactSubstitution";
import { partyLegalNamesMatch } from "./paidProAcceptedCorpusPartyRoles";
import {
  linearPremiumRecipientSlots,
  readPremiumRecipientHandoff,
  type PremiumRecipientHandoffV2,
} from "./premiumPartyNamesHandoff";
import {
  getAuthoritativeSigningSnapshot,
  type AuthoritativeSigningSnapshotRecipientMetadata,
} from "./authoritativeSigningSnapshot";
import { paidProSignerMetadataForensicLineageEnabled } from "./paidProSignerMetadataAuthority";
import {
  matchSignerForEntityIsClauses,
  sanitizePartyLegalNameFromIntakeFragment,
} from "./intakeSignerInstructionParse";

export type SignerMetadataAuthoritySource =
  | "user_edited_ui"
  | "persisted_handoff"
  | "authoritative_snapshot"
  | "draft_party"
  | "intake_structured_contact"
  | "intake_natural_language"
  | "generated_corpus_inference";

/** Lower number = higher authority. */
export const SIGNER_METADATA_AUTHORITY_RANK: Record<SignerMetadataAuthoritySource, number> = {
  user_edited_ui: 1,
  authoritative_snapshot: 2,
  persisted_handoff: 3,
  draft_party: 4,
  intake_structured_contact: 5,
  intake_natural_language: 6,
  generated_corpus_inference: 7,
};

export type EntitySignerMetadataCandidate = {
  entity: string;
  signerName: string;
  signerTitle: string;
  source: SignerMetadataAuthoritySource;
  authorityRank: number;
};

export type ResolvedEntitySignerMetadata = {
  entity: string;
  signerName: string;
  signerTitle: string;
  source: SignerMetadataAuthoritySource;
  authorityRank: number;
};

export type UniversalSignerMetadataSources = {
  legalEntities: readonly string[];
  intakeText?: string | null;
  corpusText?: string | null;
  draftParties?: readonly {
    name?: string | null;
    signerName?: string | null;
    signerTitle?: string | null;
  }[] | null;
  handoff?: PremiumRecipientHandoffV2 | null;
  snapshotMetadata?: AuthoritativeSigningSnapshotRecipientMetadata | null;
  uiSignerNames?: readonly string[];
  uiSignerTitles?: readonly string[];
};

const ENTITY_SUFFIX_TAIL_RE =
  /\s+(?:LLC|L\.L\.C\.|Inc\.?|Incorporated|Corp\.?|Corporation|Ltd\.?|Limited|LLP|PLLC|LP|Co\.?|Company)\.?$/i;

const PLACEHOLDER_SIGNER_VALUE_RE =
  /^[_\s.\-–—]+$/i;

function devTelemetryEnabled(): boolean {
  return paidProSignerMetadataForensicLineageEnabled() || import.meta.env?.DEV === true;
}

function normEntityKey(name: string): string {
  return name
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/[.,;:()'"]+/g, "")
    .replace(/\bincorporated\b/g, "inc")
    .replace(/\bcorporation\b/g, "corp")
    .replace(/\blimited\b/g, "ltd")
    .replace(/\bcompany\b/g, "co")
    .replace(/\s+/g, " ")
    .trim();
}

export function entitiesMatchForSignerMetadata(a: string, b: string): boolean {
  const ea = normEntityKey(a);
  const eb = normEntityKey(b);
  if (!ea || !eb) return false;
  if (ea === eb) return true;
  if (partyLegalNamesMatch(a, b)) return true;
  const stripSuffix = (k: string) => k.replace(ENTITY_SUFFIX_TAIL_RE, "").trim();
  const sa = stripSuffix(ea);
  const sb = stripSuffix(eb);
  if (sa && sb && (sa === sb || sa.startsWith(sb) || sb.startsWith(sa))) return true;
  return false;
}

function cleanSignerField(value: string | null | undefined, field: "signerName" | "signerTitle"): string {
  const raw = String(value ?? "").trim();
  if (!raw || PLACEHOLDER_SIGNER_VALUE_RE.test(raw)) return "";
  return normalizeSignerMetadataForSave(raw, field) ?? "";
}

function pushCandidate(
  out: Map<string, EntitySignerMetadataCandidate>,
  entity: string,
  signerName: string,
  signerTitle: string,
  source: SignerMetadataAuthoritySource,
): void {
  const legal = entity.replace(/\s+/g, " ").trim();
  if (!legal) return;
  const name = cleanSignerField(signerName, "signerName");
  const title = cleanSignerField(signerTitle, "signerTitle");
  if (!name && !title) return;
  const key = normEntityKey(legal);
  const rank = SIGNER_METADATA_AUTHORITY_RANK[source];
  const prev = out.get(key);
  if (prev && prev.authorityRank <= rank) {
    const merged: EntitySignerMetadataCandidate = {
      entity: legal,
      signerName: prev.signerName || name,
      signerTitle: prev.signerTitle || title,
      source: prev.source,
      authorityRank: prev.authorityRank,
    };
    out.set(key, merged);
    return;
  }
  out.set(key, {
    entity: legal,
    signerName: name || prev?.signerName || "",
    signerTitle: title || prev?.signerTitle || "",
    source,
    authorityRank: rank,
  });
}

/** Natural-language signer instructions (multiple phrasings). */
export function extractSignerMetadataFromIntakeNaturalLanguage(
  intakeRaw: string | null | undefined,
): EntitySignerMetadataCandidate[] {
  const raw = String(intakeRaw || "");
  if (!raw.trim()) return [];
  const byEntity = new Map<string, EntitySignerMetadataCandidate>();
  const indexOnly: EntitySignerMetadataCandidate[] = [];

  for (const row of matchSignerForEntityIsClauses(raw)) {
    if (row.entity) pushCandidate(byEntity, row.entity, row.signerName, row.signerTitle, "intake_natural_language");
    else if (row.signerName) {
      indexOnly.push({
        entity: "",
        signerName: cleanSignerField(row.signerName, "signerName"),
        signerTitle: cleanSignerField(row.signerTitle, "signerTitle"),
        source: "intake_natural_language",
        authorityRank: SIGNER_METADATA_AUTHORITY_RANK.intake_natural_language,
      });
    }
  }

  const entityPatterns: Array<{ re: RegExp; entityIdx: number; nameIdx: number; titleIdx: number }> = [
    {
      re: /([^,\n]+?),\s*([^,\n]+?),\s*will\s+sign\s+for\s+([^.\n]+)/gi,
      entityIdx: 3,
      nameIdx: 1,
      titleIdx: 2,
    },
    {
      re: /authorized\s+signer(?:\s+for\s+([^.\n]+?))?\s+is\s+([^,\n]+?)(?:,\s*([^.\n]+?))?(?:\.|$)/gi,
      entityIdx: 1,
      nameIdx: 2,
      titleIdx: 3,
    },
    {
      re: /([^.\n]+?)\s+shall\s+be\s+executed\s+by\s+([^,\n]+?)(?:,\s*([^.\n]+?))?(?:\.|$)/gi,
      entityIdx: 1,
      nameIdx: 2,
      titleIdx: 3,
    },
  ];

  for (const { re, entityIdx, nameIdx, titleIdx } of entityPatterns) {
    for (const m of raw.matchAll(re)) {
      const entity = (m[entityIdx] ?? "").trim();
      const name = (m[nameIdx] ?? "").trim();
      const title = (m[titleIdx] ?? "").trim();
      if (!name) continue;
      if (entity) pushCandidate(byEntity, entity, name, title, "intake_natural_language");
    }
  }

  const lineRe =
    /(?:^|\n)\s*(?:sender\/signer\s*\d*|signer|party)\s*\d*\s*:\s*([^,\n]+?)(?:,\s*([^,\n@]+?))?(?:,|\s|$|@)/gi;
  for (const m of raw.matchAll(lineRe)) {
    const name = (m[1] ?? "").trim();
    const title = (m[2] ?? "").trim();
    if (!name) continue;
    indexOnly.push({
      entity: "",
      signerName: cleanSignerField(name, "signerName"),
      signerTitle: cleanSignerField(title, "signerTitle"),
      source: "intake_natural_language",
      authorityRank: SIGNER_METADATA_AUTHORITY_RANK.intake_natural_language,
    });
  }

  return [...byEntity.values(), ...indexOnly];
}

export function extractSignerMetadataFromIntakeContacts(
  intakeRaw: string | null | undefined,
): EntitySignerMetadataCandidate[] {
  const contacts = extractIntakeContacts(intakeRaw);
  const out: EntitySignerMetadataCandidate[] = [];
  for (const c of contacts) {
    if (!c.name.trim()) continue;
    const entity = c.companyHint.trim();
    out.push({
      entity,
      signerName: cleanSignerField(c.name, "signerName"),
      signerTitle: cleanSignerField(c.title, "signerTitle"),
      source: "intake_structured_contact",
      authorityRank: SIGNER_METADATA_AUTHORITY_RANK.intake_structured_contact,
    });
  }
  return out;
}

export function extractSignerMetadataFromIntake(
  intakeRaw: string | null | undefined,
): {
  extractedNames: string[];
  extractedTitles: string[];
  matchedEntities: string[];
  unmatchedEntities: string[];
  candidates: EntitySignerMetadataCandidate[];
} {
  const nl = extractSignerMetadataFromIntakeNaturalLanguage(intakeRaw);
  const contacts = extractSignerMetadataFromIntakeContacts(intakeRaw);
  const candidates = [...nl, ...contacts];
  const extractedNames = candidates.map((c) => c.signerName).filter(Boolean);
  const extractedTitles = candidates.map((c) => c.signerTitle).filter(Boolean);
  const matchedEntities = candidates.map((c) => c.entity).filter(Boolean);
  const unmatchedEntities = candidates.filter((c) => !c.entity).map((c) => c.signerName);
  if (devTelemetryEnabled()) {
    // eslint-disable-next-line no-console
    console.info("[signer-metadata-intake-extract]", {
      extractedNames,
      extractedTitles,
      matchedEntities,
      unmatchedEntities,
    });
  }
  return { extractedNames, extractedTitles, matchedEntities, unmatchedEntities, candidates };
}

function isPlaceholderSignerLineValue(value: string): boolean {
  const v = value.trim();
  if (!v) return true;
  if (PLACEHOLDER_SIGNER_VALUE_RE.test(v)) return true;
  if (/^_{2,}$/.test(v)) return true;
  return false;
}

/** Parse Name:/Title: under entity heading blocks in generated corpus. */
export function extractSignerMetadataFromCorpus(
  corpus: string,
  legalEntities: readonly string[],
): EntitySignerMetadataCandidate[] {
  const text = String(corpus || "");
  if (!text.trim() || legalEntities.length === 0) return [];
  const out: EntitySignerMetadataCandidate[] = [];
  const witnessIdx = text.search(/\bIN WITNESS WHEREOF\b/i);
  const scan = witnessIdx >= 0 ? text.slice(witnessIdx) : text.slice(Math.max(0, text.length - 8000));

  for (const entity of legalEntities) {
    const escaped = entity.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const blockRe = new RegExp(
      `(?:^|\\n)\\s*(?:CLIENT|SERVICE\\s+PROVIDER|PARTY\\s+\\d+|[""']?${escaped}[""']?)\\s*:?\\s*\\n[\\s\\S]{0,900}`,
      "i",
    );
    const directRe = new RegExp(
      `(?:^|\\n)\\s*${escaped}\\s*\\n([\\s\\S]{0,600}?)(?=\\n\\s*(?:[A-Z][A-Za-z0-9 .,'&()-]+(?:LLC|Inc|Corp|Ltd)|IN WITNESS|CLIENT:|SERVICE PROVIDER:|PARTY\\s+\\d+)|$)`,
      "i",
    );
    let block = scan.match(blockRe)?.[0] ?? scan.match(directRe)?.[0];
    if (!block) {
      const idx = scan.toLowerCase().indexOf(entity.toLowerCase());
      if (idx >= 0) block = scan.slice(idx, idx + 900);
    }
    if (!block) continue;
    const nameM = block.match(/\n\s*Name:\s*([^\n]+)/i);
    const titleM = block.match(/\n\s*Title:\s*([^\n]+)/i);
    const name = nameM?.[1]?.trim() ?? "";
    const title = titleM?.[1]?.trim() ?? "";
    if (isPlaceholderSignerLineValue(name) && isPlaceholderSignerLineValue(title)) continue;
    const single = new Map<string, EntitySignerMetadataCandidate>();
    pushCandidate(single, entity, name, title, "generated_corpus_inference");
    out.push(...single.values());
  }
  return out;
}

function candidatesFromHandoff(
  handoff: PremiumRecipientHandoffV2 | null | undefined,
  partyCount: number,
  legalEntities: readonly string[],
): EntitySignerMetadataCandidate[] {
  if (!handoff) return [];
  const slots = linearPremiumRecipientSlots(handoff, partyCount);
  const out: EntitySignerMetadataCandidate[] = [];
  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i]!;
    const entity =
      legalEntities[i]?.trim() ||
      slot.name.trim() ||
      (i === 0 ? handoff.party1.name : i === 1 ? handoff.party2.name : "");
    const name = cleanSignerField(slot.signerName, "signerName");
    const title = cleanSignerField(slot.signerTitle, "signerTitle");
    if (!name && !title) continue;
    out.push({
      entity,
      signerName: name,
      signerTitle: title,
      source: "persisted_handoff",
      authorityRank: SIGNER_METADATA_AUTHORITY_RANK.persisted_handoff,
    });
  }
  return out;
}

function candidatesFromSnapshot(
  meta: AuthoritativeSigningSnapshotRecipientMetadata | null | undefined,
  legalEntities: readonly string[],
): EntitySignerMetadataCandidate[] {
  if (!meta) return [];
  const out: EntitySignerMetadataCandidate[] = [];
  const count = Math.max(meta.partySignerNames.length, meta.partySignerTitles.length, legalEntities.length, 2);
  for (let i = 0; i < count; i++) {
    const entity =
      legalEntities[i]?.trim() ||
      (i === 0 ? meta.recipient1Name : i === 1 ? meta.recipient2Name : "").trim();
    const name = cleanSignerField(meta.partySignerNames[i], "signerName");
    const title = cleanSignerField(meta.partySignerTitles[i], "signerTitle");
    if (!name && !title) continue;
    out.push({
      entity,
      signerName: name,
      signerTitle: title,
      source: "authoritative_snapshot",
      authorityRank: SIGNER_METADATA_AUTHORITY_RANK.authoritative_snapshot,
    });
  }
  return out;
}

function candidatesFromDraftParties(
  parties: UniversalSignerMetadataSources["draftParties"],
  legalEntities: readonly string[],
): EntitySignerMetadataCandidate[] {
  if (!parties?.length) return [];
  const out: EntitySignerMetadataCandidate[] = [];
  for (let i = 0; i < parties.length; i++) {
    const p = parties[i]!;
    const entity = legalEntities[i]?.trim() || String(p.name ?? "").trim();
    const name = cleanSignerField(p.signerName, "signerName");
    const title = cleanSignerField(p.signerTitle, "signerTitle");
    if (!name && !title) continue;
    out.push({
      entity,
      signerName: name,
      signerTitle: title,
      source: "draft_party",
      authorityRank: SIGNER_METADATA_AUTHORITY_RANK.draft_party,
    });
  }
  return out;
}

function mergeCandidatesByEntity(
  candidates: readonly EntitySignerMetadataCandidate[],
): Map<string, ResolvedEntitySignerMetadata> {
  const merged = new Map<string, ResolvedEntitySignerMetadata>();
  const sorted = [...candidates].sort((a, b) => a.authorityRank - b.authorityRank);
  for (const c of sorted) {
    const key = c.entity ? normEntityKey(c.entity) : `__idx_${c.signerName}`;
    const prev = merged.get(key);
    if (!prev) {
      merged.set(key, {
        entity: c.entity,
        signerName: c.signerName,
        signerTitle: c.signerTitle,
        source: c.source,
        authorityRank: c.authorityRank,
      });
      continue;
    }
    if (c.authorityRank < prev.authorityRank) {
      merged.set(key, {
        entity: c.entity || prev.entity,
        signerName: c.signerName || prev.signerName,
        signerTitle: c.signerTitle || prev.signerTitle,
        source: c.source,
        authorityRank: c.authorityRank,
      });
    } else {
      merged.set(key, {
        entity: prev.entity || c.entity,
        signerName: prev.signerName || c.signerName,
        signerTitle: prev.signerTitle || c.signerTitle,
        source: prev.source,
        authorityRank: prev.authorityRank,
      });
    }
  }
  return merged;
}

export function resolveUniversalSignerMetadataBySlot(
  sources: UniversalSignerMetadataSources,
): ResolvedEntitySignerMetadata[] {
  const legalEntities = sources.legalEntities
    .map((e) => sanitizePartyLegalNameFromIntakeFragment(e.replace(/\s+/g, " ").trim()))
    .filter(Boolean);
  const partyCount = Math.max(legalEntities.length, sources.draftParties?.length ?? 0, 2);
  const handoff = sources.handoff ?? readPremiumRecipientHandoff();
  const snapshotMeta =
    sources.snapshotMetadata ?? getAuthoritativeSigningSnapshot()?.signerMetadata ?? null;

  const intakeExtract = extractSignerMetadataFromIntake(sources.intakeText);
  const allCandidates: EntitySignerMetadataCandidate[] = [
    ...candidatesFromSnapshot(snapshotMeta, legalEntities),
    ...candidatesFromHandoff(handoff, partyCount, legalEntities),
    ...candidatesFromDraftParties(sources.draftParties, legalEntities),
    ...intakeExtract.candidates,
    ...extractSignerMetadataFromCorpus(sources.corpusText ?? "", legalEntities),
  ];

  // UI edits (highest) — slot index keyed
  for (let i = 0; i < partyCount; i++) {
    const entity = legalEntities[i] ?? "";
    const uiName = cleanSignerField(sources.uiSignerNames?.[i], "signerName");
    const uiTitle = cleanSignerField(sources.uiSignerTitles?.[i], "signerTitle");
    if (uiName || uiTitle) {
      allCandidates.unshift({
        entity,
        signerName: uiName,
        signerTitle: uiTitle,
        source: "user_edited_ui",
        authorityRank: SIGNER_METADATA_AUTHORITY_RANK.user_edited_ui,
      });
    }
  }

  const byEntity = mergeCandidatesByEntity(allCandidates);
  const indexOnly = intakeExtract.candidates.filter((c) => !c.entity && c.signerName);
  const intakeRowsOrdered = matchSignerForEntityIsClauses(sources.intakeText);

  const resolved: ResolvedEntitySignerMetadata[] = [];
  for (let i = 0; i < partyCount; i++) {
    const entity = legalEntities[i] ?? "";
    let hit: ResolvedEntitySignerMetadata | undefined;
    for (const m of byEntity.values()) {
      if (entity && m.entity && entitiesMatchForSignerMetadata(entity, m.entity)) {
        hit = m;
        break;
      }
    }
    if ((!hit?.signerName || !hit?.signerTitle) && intakeRowsOrdered[i]) {
      const row = intakeRowsOrdered[i]!;
      const rowName = cleanSignerField(row.signerName, "signerName");
      const rowTitle = cleanSignerField(row.signerTitle, "signerTitle");
      if (rowName || rowTitle) {
        const entityOk =
          !entity ||
          !row.entity ||
          entitiesMatchForSignerMetadata(entity, sanitizePartyLegalNameFromIntakeFragment(row.entity));
        if (entityOk) {
          hit = {
            entity,
            signerName: rowName || hit?.signerName || "",
            signerTitle: rowTitle || hit?.signerTitle || "",
            source: "intake_natural_language",
            authorityRank: SIGNER_METADATA_AUTHORITY_RANK.intake_natural_language,
          };
        }
      }
    }
    if (!hit && indexOnly[i]) {
      hit = {
        entity,
        signerName: indexOnly[i]!.signerName,
        signerTitle: indexOnly[i]!.signerTitle,
        source: "intake_natural_language",
        authorityRank: SIGNER_METADATA_AUTHORITY_RANK.intake_natural_language,
      };
    }
    if (!hit) {
      hit = { entity, signerName: "", signerTitle: "", source: "draft_party", authorityRank: 99 };
    }
    resolved.push({
      entity,
      signerName: hit.signerName,
      signerTitle: hit.signerTitle,
      source: hit.source,
      authorityRank: hit.authorityRank,
    });
    if (devTelemetryEnabled() && (hit.signerName || hit.signerTitle)) {
      // eslint-disable-next-line no-console
      console.info("[signer-metadata-authority]", {
        source: hit.source,
        entity,
        signerName: hit.signerName || null,
        signerTitle: hit.signerTitle || null,
        authorityRank: hit.authorityRank,
      });
    }
  }
  return resolved;
}

export type SignerMetadataHandoffPresence = {
  stage: string;
  entities: string[];
  signerNamesPresent: boolean[];
  signerTitlesPresent: boolean[];
  /** Resolved signer names at this stage (for loss-detection telemetry). */
  signerNames: string[];
  signerTitles: string[];
};

export function logSignerMetadataHandoff(presence: SignerMetadataHandoffPresence): void {
  if (!devTelemetryEnabled()) return;
  // eslint-disable-next-line no-console
  console.info("[signer-metadata-handoff]", presence);
}

export type SignerMetadataHydrationLog = {
  stage: string;
  hydratedNames: string[];
  hydratedTitles: string[];
  preservedUserEdits: boolean;
};

export function logSignerMetadataHydration(log: SignerMetadataHydrationLog): void {
  if (!devTelemetryEnabled()) return;
  // eslint-disable-next-line no-console
  console.info("[signer-metadata-hydration]", log);
}

export type SignerMetadataLossEvent = {
  stage: string;
  entity: string;
  lostName: string | null;
  lostTitle: string | null;
  reason: string;
};

let previousStagePresence: SignerMetadataHandoffPresence | null = null;

export function detectAndLogSignerMetadataLoss(
  current: SignerMetadataHandoffPresence,
  reason = "authority_transition",
): void {
  const prev = previousStagePresence;
  previousStagePresence = current;
  if (!prev || !devTelemetryEnabled()) return;
  for (let i = 0; i < current.entities.length; i++) {
    const hadName = prev.signerNamesPresent[i];
    const hasName = current.signerNamesPresent[i];
    const hadTitle = prev.signerTitlesPresent[i];
    const hasTitle = current.signerTitlesPresent[i];
    if (hadName && !hasName) {
      const event: SignerMetadataLossEvent = {
        stage: current.stage,
        entity: current.entities[i] ?? "",
        lostName: prev.signerNames[i]?.trim() || null,
        lostTitle: null,
        reason,
      };
      // eslint-disable-next-line no-console
      console.warn("[signer-metadata-loss-detection]", event);
    }
    if (hadTitle && !hasTitle) {
      const event: SignerMetadataLossEvent = {
        stage: current.stage,
        entity: current.entities[i] ?? "",
        lostName: null,
        lostTitle: prev.signerTitles[i]?.trim() || null,
        reason,
      };
      // eslint-disable-next-line no-console
      console.warn("[signer-metadata-loss-detection]", event);
    }
  }
}

/** Non-destructive: only fill empty UI slots from resolved authority. */
export function hydrateSignerMetadataArraysNonDestructive(args: {
  currentNames: readonly string[];
  currentTitles: readonly string[];
  resolved: readonly ResolvedEntitySignerMetadata[];
  stage: string;
}): { names: string[]; titles: string[]; changed: boolean; preservedUserEdits: boolean } {
  const count = args.resolved.length;
  const names = args.currentNames.slice(0, count);
  const titles = args.currentTitles.slice(0, count);
  while (names.length < count) names.push("");
  while (titles.length < count) titles.push("");
  let changed = false;
  let preservedUserEdits = false;
  const hydratedNames: string[] = [];
  const hydratedTitles: string[] = [];
  for (let i = 0; i < count; i++) {
    const curName = (names[i] ?? "").trim();
    const curTitle = (titles[i] ?? "").trim();
    const nextName = args.resolved[i]?.signerName ?? "";
    const nextTitle = args.resolved[i]?.signerTitle ?? "";
    if (curName) preservedUserEdits = true;
    if (curTitle) preservedUserEdits = true;
    if (!curName && nextName) {
      names[i] = nextName;
      changed = true;
      hydratedNames.push(nextName);
    }
    if (!curTitle && nextTitle) {
      titles[i] = nextTitle;
      changed = true;
      hydratedTitles.push(nextTitle);
    }
  }
  if (changed) {
    logSignerMetadataHydration({
      stage: args.stage,
      hydratedNames,
      hydratedTitles,
      preservedUserEdits,
    });
  }
  return { names, titles, changed, preservedUserEdits };
}

export function mergeSignerMetadataIntoDraftParties<
  T extends {
    parties?: Array<{
      name?: string | null;
      signerName?: string | null;
      signerTitle?: string | null;
    }>;
  },
>(draft: T, resolved: readonly ResolvedEntitySignerMetadata[]): T {
  const parties = [...(draft.parties ?? [])];
  let changed = false;
  for (let i = 0; i < resolved.length; i++) {
    const r = resolved[i]!;
    while (parties.length <= i) parties.push({ name: r.entity || "" });
    const prev = parties[i] ?? {};
    const prevName = cleanSignerField(prev.signerName, "signerName");
    const prevTitle = cleanSignerField(prev.signerTitle, "signerTitle");
    const nextName = prevName || r.signerName;
    const nextTitle = prevTitle || r.signerTitle;
    if (nextName !== prevName || nextTitle !== prevTitle) changed = true;
    parties[i] = {
      ...prev,
      name: String(prev.name ?? r.entity).trim() || r.entity,
      signerName: nextName || undefined,
      signerTitle: nextTitle || undefined,
    };
  }
  if (!changed) return draft;
  return { ...draft, parties };
}

export function presenceFromResolved(
  stage: string,
  resolved: readonly ResolvedEntitySignerMetadata[],
): SignerMetadataHandoffPresence {
  return {
    stage,
    entities: resolved.map((r) => r.entity),
    signerNamesPresent: resolved.map((r) => Boolean(r.signerName.trim())),
    signerTitlesPresent: resolved.map((r) => Boolean(r.signerTitle.trim())),
    signerNames: resolved.map((r) => r.signerName),
    signerTitles: resolved.map((r) => r.signerTitle),
  };
}

export function resetSignerMetadataLossDetectionBaseline(): void {
  previousStagePresence = null;
}
