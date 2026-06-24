/**
 * Paid Pro execution-block normalization — exactly one witness/signature tail rebuilt from
 * accepted SoT role map; strips fragment-derived duplicate blocks and suffix pollution.
 */

import {
  buildCorpusRoleIdentitiesForExecutionReconcile,
  resolvePaidProPartyRolesFromAcceptedCorpus,
  type AcceptedCorpusPartyRole,
  type AcceptedCorpusRoleAssignment,
} from "./paidProAcceptedCorpusPartyRoles";
import {
  isRecitalFragmentExecutionPartyLine,
  repairDuplicatedLegalEntitySuffixInCorpus,
  repairDuplicatedLegalEntitySuffixPhrase,
  repairOrphanedLegalEntitySuffixSpacingInCorpus,
} from "./paidProLegalEntityNameHygiene";
import { readFrozenCanonicalManifestPartyNames } from "./frozenCanonicalManifestAuthority";
import { consumeAuthoritativeSignerCount } from "./signerCountAuthority";
import { reconcileExecutionBlockToRoleIdentities } from "./paidProSignerMetadataMergeGate";
import type { CanonicalPartyIdentity } from "./guidedDealCompletion/signerPartyIdentity";
import { isStandaloneSignaturesHeadingLine } from "./paidProSignatureSectionOrdering";
import {
  logExecutionBlockCount,
  logExecutionBlockLocation,
} from "./paidProExecutionBlockInstrumentation";
import { stripInlineStaleServerSignatureTailBeforeWitness } from "./paidProFlattenedDocumentNormalize";
import { resolveCanonicalPartyIdentitiesFromIntake } from "./canonicalPartyIdentityResolver";
import {
  isQuadripartiteLabeledPartiesIntake,
  isTripartiteLabeledPartiesIntake,
  labeledPartyLegalEntities,
  multiPartyExecutionBlockHeading,
  tripartiteRoleLabelForPartyIndex,
} from "./labeledPartyBlockParse";

export {
  isRecitalFragmentExecutionPartyLine,
  repairDuplicatedLegalEntitySuffixInCorpus,
  repairDuplicatedLegalEntitySuffixPhrase,
} from "./paidProLegalEntityNameHygiene";

const EXECUTION_ROLE_HEADING_LINE_RE =
  /^\s*(?:CLIENT|SERVICE\s+PROVIDER|ANALYTICS\s+PROVIDER|CONSULTANT|PROVIDER|PARTY\s+\d+)\s*:?\s*$/i;

const NUMBERED_SECTION_HEADING_RE = /^\s*(\d+(?:\.\d+)*)\.\s+\S+/;
const EXECUTION_FIELD_LINE_RE = /^\s*(?:By|Name|Title|Date|Email|Signature)\s*:/i;
const IF_TO_NOTICE_STANZA_HEADER_RE = /^If to\s+/i;

/** True when lineIndex sits inside an operative If-to notice stanza (not execution block fields). */
function isWithinIfToNoticeStanza(lines: readonly string[], lineIndex: number): boolean {
  for (let j = lineIndex; j >= Math.max(0, lineIndex - 24); j -= 1) {
    const t = (lines[j] ?? "").trim();
    if (!t) continue;
    if (/^\s*IN WITNESS WHEREOF\b/i.test(t)) return false;
    if (EXECUTION_ROLE_HEADING_LINE_RE.test(t)) return false;
    if (IF_TO_NOTICE_STANZA_HEADER_RE.test(t)) return true;
    if (NUMBERED_SECTION_HEADING_RE.test(t) && !/\bnotices?\b/i.test(t)) return false;
  }
  return false;
}

function roleHeadingStartsExecutionCluster(lines: readonly string[], start: number): boolean {
  const trimmed = (lines[start] ?? "").trim();
  if (!EXECUTION_ROLE_HEADING_LINE_RE.test(trimmed)) return false;
  for (let j = start + 1; j < Math.min(start + 18, lines.length); j += 1) {
    const t = (lines[j] ?? "").trim();
    if (!t) continue;
    if (NUMBERED_SECTION_HEADING_RE.test(t)) return false;
    if (EXECUTION_FIELD_LINE_RE.test(t)) return true;
    if (EXECUTION_ROLE_HEADING_LINE_RE.test(t)) return false;
  }
  return true;
}

/**
 * Remove premature SIGNATURES sections, role execution clusters, and stray witness lines
 * from the operative prefix (everything before the canonical document-tail witness).
 */
export function stripPreWitnessExecutionPollutionFromPrefix(prefix: string): {
  text: string;
  repairs: string[];
} {
  const repairs: string[] = [];
  const lines = (prefix || "").replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i] ?? "";
    const trimmed = line.trim();

    if (!trimmed) {
      out.push(line);
      i += 1;
      continue;
    }

    if (/IN WITNESS WHEREOF/i.test(trimmed) && !/^\s*IN WITNESS WHEREOF\b/i.test(trimmed)) {
      const cleaned = trimmed.replace(/\s*IN WITNESS WHEREOF[\s\S]*$/i, "").trim();
      if (cleaned) out.push(cleaned);
      repairs.push("execution_block:defuse_entity_witness_fusion");
      i += 1;
      continue;
    }

    if (/^\s*IN WITNESS WHEREOF\b/i.test(trimmed)) {
      repairs.push("execution_block:strip_pre_witness_witness_clause");
      i += 1;
      while (i < lines.length && (lines[i] ?? "").trim()) i += 1;
      continue;
    }

    if (isStandaloneSignaturesHeadingLine(line)) {
      repairs.push("execution_block:strip_pre_witness_signatures_section");
      i += 1;
      while (i < lines.length) {
        const t = (lines[i] ?? "").trim();
        if (!t) {
          i += 1;
          continue;
        }
        if (NUMBERED_SECTION_HEADING_RE.test(t)) break;
        if (IF_TO_NOTICE_STANZA_HEADER_RE.test(t)) break;
        if (roleHeadingStartsExecutionCluster(lines, i)) break;
        if (isStandaloneSignaturesHeadingLine(lines[i] ?? "")) break;
        if (EXECUTION_FIELD_LINE_RE.test(t)) {
          if (isWithinIfToNoticeStanza(lines, i)) break;
          i += 1;
          continue;
        }
        i += 1;
      }
      continue;
    }

    if (roleHeadingStartsExecutionCluster(lines, i)) {
      repairs.push("execution_block:strip_pre_witness_role_execution_cluster");
      i += 1;
      while (i < lines.length) {
        const t = (lines[i] ?? "").trim();
        if (!t) {
          i += 1;
          continue;
        }
        if (NUMBERED_SECTION_HEADING_RE.test(t)) break;
        if (roleHeadingStartsExecutionCluster(lines, i)) break;
        if (isStandaloneSignaturesHeadingLine(lines[i] ?? "")) break;
        i += 1;
      }
      continue;
    }

    if (EXECUTION_FIELD_LINE_RE.test(trimmed)) {
      if (isWithinIfToNoticeStanza(lines, i)) {
        out.push(line);
        i += 1;
        continue;
      }
      repairs.push("execution_block:strip_pre_witness_orphan_execution_field");
      i += 1;
      continue;
    }

    out.push(line);
    i += 1;
  }

  const text = out
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trimEnd();
  return { text, repairs };
}

function executionBlockHeadingFromRoleLabel(roleLabel: string, index: number, intakeText?: string | null): string {
  if (intakeText) {
    return multiPartyExecutionBlockHeading(index, intakeText);
  }
  const r = roleLabel.replace(/\s+/g, " ").trim().toLowerCase();
  if (r === "client") return "CLIENT";
  if (r.includes("service") && r.includes("provider")) return "SERVICE PROVIDER";
  if (r.includes("analytics") && r.includes("provider")) return "ANALYTICS PROVIDER";
  if (index === 0) return "CLIENT";
  if (index === 1) return "SERVICE PROVIDER";
  return `PARTY ${index + 1}`;
}

type ManifestExecutionRole = {
  legalName: string;
  roleLabel: string;
  role: AcceptedCorpusPartyRole;
};

function manifestRolesFromLegalNames(
  names: readonly string[],
  intakeText?: string | null,
): ManifestExecutionRole[] {
  const quad = Boolean(
    (intakeText && isQuadripartiteLabeledPartiesIntake(intakeText)) || names.length >= 4,
  );
  const tripartite = !quad && names.length >= 3 && isTripartiteLabeledPartiesIntake(intakeText ?? "");
  return names.map((legalName, index) => {
    const roleLabel = quad
      ? `Party ${index + 1}`
      : tripartite
        ? tripartiteRoleLabelForPartyIndex(index)
        : index === 0
          ? "Client"
          : index === 1
            ? "Service Provider"
            : `Party ${index + 1}`;
    const role: AcceptedCorpusPartyRole = quad
      ? "service_provider"
      : index === 0
        ? "client"
        : "service_provider";
    return { role, legalName, roleLabel };
  });
}

function buildManifestExecutionIdentities(
  names: readonly string[],
  roles: readonly ManifestExecutionRole[],
  intakeText?: string | null,
  useEntityHeadings = false,
): CanonicalPartyIdentity[] {
  return names.map((name, index) => ({
    index,
    partyDisplayName: name,
    blockHeading: useEntityHeadings
      ? name.toUpperCase()
      : executionBlockHeadingFromRoleLabel(roles[index]?.roleLabel ?? "", index, intakeText),
    email: "",
    partyAddress: null,
    representativeName: null,
    title: null,
    isIndividual: false,
  }));
}

function sanitizeRoleAssignments(corpus: string): AcceptedCorpusRoleAssignment[] {
  return resolvePaidProPartyRolesFromAcceptedCorpus(corpus)
    .map((role) => ({
      ...role,
      legalName: repairDuplicatedLegalEntitySuffixPhrase(role.legalName),
    }))
    .filter((role) => role.legalName.length >= 3 && !isRecitalFragmentExecutionPartyLine(role.legalName));
}

/**
 * Last canonical witness index — premature witness clauses inside Notices must not bound the operative body.
 */
export function resolveAuthoritativeWitnessIndex(text: string): number {
  let last = -1;
  const re = /\bIN WITNESS WHEREOF\b/gi;
  for (const m of (text || "").matchAll(re)) {
    if (m.index != null) last = m.index;
  }
  return last;
}

function operativeBodyWithoutExecutionTails(text: string): string {
  const inlineStripped = stripInlineStaleServerSignatureTailBeforeWitness(text);
  const lastWitness = resolveAuthoritativeWitnessIndex(inlineStripped.text);
  const operativePrefix =
    lastWitness >= 0 ? inlineStripped.text.slice(0, lastWitness) : inlineStripped.text;
  const pollutionStripped = stripPreWitnessExecutionPollutionFromPrefix(operativePrefix);
  return pollutionStripped.text.trimEnd();
}

/** Hard invariant: no duplicate role headings after the canonical party signature sections. */
export function truncatePostCanonicalExecutionPollution(
  text: string,
  opts?: { expectedPartyCount?: number },
): { text: string; repairs: string[] } {
  const repairs: string[] = [];
  const expectedPartyCount = opts?.expectedPartyCount ?? 2;
  const witnessIdx = resolveAuthoritativeWitnessIndex(text);
  if (witnessIdx < 0) return { text, repairs };

  const prefix = text.slice(0, witnessIdx).trimEnd();
  const tail = text.slice(witnessIdx);
  const lines = tail.split("\n");
  let clientHeadings = 0;
  let serviceProviderHeadings = 0;
  let cutAt = lines.length;

  for (let i = 0; i < lines.length; i += 1) {
    const trimmed = (lines[i] ?? "").trim();
    if (/^\s*CLIENT\s*:?\s*$/i.test(trimmed)) {
      clientHeadings += 1;
      if (clientHeadings > 1) {
        cutAt = i;
        repairs.push("execution_block:strip_duplicate_client_heading");
        break;
      }
      continue;
    }
    if (/^\s*SERVICE\s+PROVIDER\s*:?\s*$/i.test(trimmed)) {
      serviceProviderHeadings += 1;
      if (serviceProviderHeadings > 1) {
        cutAt = i;
        repairs.push("execution_block:strip_duplicate_service_provider_heading");
        break;
      }
      continue;
    }
    if (
      expectedPartyCount <= 2 &&
      (clientHeadings > 0 || serviceProviderHeadings > 0) &&
      /^\s*(?:CONSULTANT|PROVIDER|PARTY\s+\d+)\s*:?\s*$/i.test(trimmed)
    ) {
      cutAt = i;
      repairs.push("execution_block:strip_extra_role_heading");
      break;
    }
  }

  if (cutAt >= lines.length) {
    return { text, repairs };
  }

  const keptTail = lines.slice(0, cutAt).join("\n").trimEnd();
  return {
    text: `${prefix}\n\n${keptTail}\n`,
    repairs,
  };
}

function stripRecitalFragmentExecutionLinesFromTail(text: string, repairs: string[]): string {
  const witnessIdx = text.search(/\bIN WITNESS WHEREOF\b/i);
  if (witnessIdx < 0) return text;

  const prefix = text.slice(0, witnessIdx).trimEnd();
  const tailLines = text.slice(witnessIdx).split("\n");
  const out: string[] = [];
  let skipUntilBlank = false;

  for (let i = 0; i < tailLines.length; i += 1) {
    const line = tailLines[i] ?? "";
    const trimmed = line.trim();
    if (skipUntilBlank) {
      if (!trimmed) {
        skipUntilBlank = false;
      }
      continue;
    }
    if (EXECUTION_ROLE_HEADING_LINE_RE.test(trimmed)) {
      out.push(line);
      const next = (tailLines[i + 1] ?? "").trim();
      if (next && isRecitalFragmentExecutionPartyLine(next)) {
        repairs.push("execution_block:strip_recital_fragment_party_line");
        skipUntilBlank = true;
      }
      continue;
    }
    if (isRecitalFragmentExecutionPartyLine(trimmed)) {
      repairs.push("execution_block:strip_recital_fragment_party_line");
      skipUntilBlank = true;
      continue;
    }
    out.push(line);
  }

  return `${prefix}\n\n${out.join("\n").trimEnd()}\n`;
}

/**
 * Collapse duplicate witness / fragment-derived execution blocks to one canonical tail from SoT roles.
 * Operative body before the first IN WITNESS WHEREOF is preserved unchanged.
 */
export type EnforcePaidProSingleExecutionBlockOpts = {
  /** User-finalized signer authority overrides corpus-derived role labels. */
  authorityParties?: readonly { legalName?: string | null; partyLegalName?: string | null }[];
  intakeText?: string | null;
  draftPartyNames?: readonly string[] | null;
};

export function enforcePaidProSingleExecutionBlock(
  corpus: string,
  opts?: EnforcePaidProSingleExecutionBlockOpts,
): { text: string; repairs: string[] } {
  const repairs: string[] = [];
  let text = String(corpus || "").replace(/\r\n/g, "\n").trim();
  if (!text) return { text, repairs };

  const suffixRepair = repairDuplicatedLegalEntitySuffixInCorpus(text);
  if (suffixRepair.repairs > 0) {
    text = suffixRepair.text;
    repairs.push(`execution_block:suffix_dedupe:${suffixRepair.repairs}`);
  }
  const spacingRepair = repairOrphanedLegalEntitySuffixSpacingInCorpus(text);
  if (spacingRepair.repairs > 0) {
    text = spacingRepair.text;
    repairs.push(`execution_block:orphan_suffix_spacing:${spacingRepair.repairs}`);
  }

  const inlineStaleStrip = stripInlineStaleServerSignatureTailBeforeWitness(text);
  if (inlineStaleStrip.text !== text) {
    text = inlineStaleStrip.text;
    repairs.push(...inlineStaleStrip.repairs);
  }

  const witnessIdx = resolveAuthoritativeWitnessIndex(text);
  if (witnessIdx >= 0) {
    const preWitnessStrip = stripPreWitnessExecutionPollutionFromPrefix(text.slice(0, witnessIdx));
    if (preWitnessStrip.repairs.length > 0) {
      text = `${preWitnessStrip.text}\n\n${text.slice(witnessIdx).trimStart()}`;
      repairs.push(...preWitnessStrip.repairs);
    }
  } else {
    const preWitnessStrip = stripPreWitnessExecutionPollutionFromPrefix(text);
    if (preWitnessStrip.repairs.length > 0) {
      text = preWitnessStrip.text;
      repairs.push(...preWitnessStrip.repairs);
    }
  }

  const authorityParties = (opts?.authorityParties ?? [])
    .map((p) => String(p.partyLegalName ?? p.legalName ?? "").replace(/\s+/g, " ").trim())
    .filter((n) => n.length >= 3);
  const frozenNames = readFrozenCanonicalManifestPartyNames()
    .map((n) => n.replace(/\s+/g, " ").trim())
    .filter((n) => n.length >= 3);
  const labeledNames = labeledPartyLegalEntities(String(opts?.intakeText ?? ""));
  const explicitDraftNames = (opts?.draftPartyNames ?? [])
    .map((n) => String(n ?? "").trim())
    .filter((n) => n.length >= 3);
  const authoritativePartyCount = consumeAuthoritativeSignerCount(
    "enforcePaidProSingleExecutionBlock",
    {
      intakeText: opts?.intakeText ?? null,
      draftPartyNames: opts?.draftPartyNames ?? authorityParties,
      manifestPartyCount: frozenNames.length >= 2 ? frozenNames.length : undefined,
    },
    Math.max(authorityParties.length, frozenNames.length, labeledNames.length, 2),
  );
  const intakeManifest =
    authorityParties.length < labeledNames.length && (opts?.intakeText || "").trim()
      ? resolveCanonicalPartyIdentitiesFromIntake(
          opts?.intakeText ?? "",
          opts?.draftPartyNames ?? labeledNames,
        )
      : authorityParties.length < 2 && (opts?.intakeText || "").trim()
        ? resolveCanonicalPartyIdentitiesFromIntake(
            opts?.intakeText ?? "",
            opts?.draftPartyNames ?? null,
          )
        : [];
  const manifestLegalNames =
    frozenNames.length >= authoritativePartyCount &&
    frozenNames.length >= 2 &&
    authorityParties.length >= 2
      ? frozenNames.slice(0, authoritativePartyCount)
      : authorityParties.length >= authoritativePartyCount && authorityParties.length >= 2
        ? authorityParties.slice(0, authoritativePartyCount)
        : explicitDraftNames.length >= authoritativePartyCount && explicitDraftNames.length >= 2
          ? explicitDraftNames.slice(0, authoritativePartyCount)
          : authorityParties.length >= 3
            ? authorityParties
            : labeledNames.length >= authorityParties.length && labeledNames.length >= 2
              ? labeledNames
              : intakeManifest.length >= authorityParties.length && intakeManifest.length >= 2
                ? intakeManifest.map((rec) => rec.fullLegalName.trim()).filter((n) => n.length >= 3)
                : authorityParties;
  const manifestRoles =
    manifestLegalNames.length >= 2
      ? manifestRolesFromLegalNames(manifestLegalNames, opts?.intakeText ?? null)
      : null;
  const roles = manifestRoles ?? sanitizeRoleAssignments(text);
  const client = roles.find((r) => r.role === "client");
  const provider = roles.find((r) => r.role === "service_provider");
  const quadLabeled = Boolean(opts?.intakeText && isQuadripartiteLabeledPartiesIntake(opts.intakeText));
  const quadParty =
    quadLabeled || authorityParties.length >= 4 || manifestLegalNames.length >= 4;
  if ((!client || !provider) && !quadParty && manifestLegalNames.length < 3) {
    text = stripRecitalFragmentExecutionLinesFromTail(text, repairs);
    const truncated = truncatePostCanonicalExecutionPollution(text, {
      expectedPartyCount: manifestLegalNames.length >= 2 ? manifestLegalNames.length : 2,
    });
    if (truncated.text !== text) {
      repairs.push(...truncated.repairs);
      text = truncated.text;
    }
    return { text, repairs: [...new Set(repairs)] };
  }

  const body = operativeBodyWithoutExecutionTails(text);
  const expectedPartyCount = Math.max(manifestLegalNames.length, authoritativePartyCount, roles.length);
  const useEntityHeadings = manifestLegalNames.length >= 3;

  const identities: CanonicalPartyIdentity[] =
    manifestRoles && manifestLegalNames.length >= 2
      ? buildManifestExecutionIdentities(
          manifestLegalNames,
          manifestRoles,
          opts?.intakeText ?? null,
          useEntityHeadings,
        )
      : client && provider
        ? buildCorpusRoleIdentitiesForExecutionReconcile(
            `${body}\n\nThis Agreement is between ${client.legalName} ("Client") and ${provider.legalName} ("Service Provider").`,
          )
        : [];
  if (!identities.length) {
    text = stripRecitalFragmentExecutionLinesFromTail(text, repairs);
    const truncated = truncatePostCanonicalExecutionPollution(text, {
      expectedPartyCount: manifestLegalNames.length >= 2 ? manifestLegalNames.length : 2,
    });
    if (truncated.text !== text) {
      repairs.push(...truncated.repairs);
      text = truncated.text;
    }
    return { text, repairs: [...new Set(repairs)] };
  }
  const stubLines = [
    body,
    "",
    "IN WITNESS WHEREOF, the Parties execute this Agreement.",
    "",
  ];
  for (const id of identities) {
    stubLines.push(`${id.blockHeading}:`, id.partyDisplayName.trim(), "");
  }
  const stub = stubLines.join("\n");
  const reconciled = reconcileExecutionBlockToRoleIdentities(stub, identities);
  if (reconciled.text !== text) {
    repairs.push("execution_block:single_canonical_rebuilt");
  }
  text = reconciled.text;

  text = stripRecitalFragmentExecutionLinesFromTail(text, repairs);
  const truncated = truncatePostCanonicalExecutionPollution(text, { expectedPartyCount });
  if (truncated.text !== text) {
    repairs.push(...truncated.repairs);
    text = truncated.text;
  }

  logExecutionBlockLocation(text, "enforcePaidProSingleExecutionBlock");
  logExecutionBlockCount(text, "enforcePaidProSingleExecutionBlock");
  return { text, repairs: [...new Set(repairs)] };
}
