/**
 * Paid Pro execution-block normalization — exactly one witness/signature tail rebuilt from
 * accepted SoT role map; strips fragment-derived duplicate blocks and suffix pollution.
 */

import {
  buildCorpusRoleIdentitiesForExecutionReconcile,
  resolvePaidProPartyRolesFromAcceptedCorpus,
  type AcceptedCorpusRoleAssignment,
} from "./paidProAcceptedCorpusPartyRoles";
import {
  isRecitalFragmentExecutionPartyLine,
  repairDuplicatedLegalEntitySuffixInCorpus,
  repairDuplicatedLegalEntitySuffixPhrase,
  repairOrphanedLegalEntitySuffixSpacingInCorpus,
} from "./paidProLegalEntityNameHygiene";
import { reconcileExecutionBlockToRoleIdentities } from "./paidProSignerMetadataMergeGate";
import { isStandaloneSignaturesHeadingLine } from "./paidProSignatureSectionOrdering";
import {
  logExecutionBlockCount,
  logExecutionBlockLocation,
} from "./paidProExecutionBlockInstrumentation";

export {
  isRecitalFragmentExecutionPartyLine,
  repairDuplicatedLegalEntitySuffixInCorpus,
  repairDuplicatedLegalEntitySuffixPhrase,
} from "./paidProLegalEntityNameHygiene";

const EXECUTION_ROLE_HEADING_LINE_RE =
  /^\s*(?:CLIENT|SERVICE\s+PROVIDER|CONSULTANT|PROVIDER|PARTY\s+\d+)\s*:?\s*$/i;

const NUMBERED_SECTION_HEADING_RE = /^\s*(\d+(?:\.\d+)*)\.\s+\S+/;
const EXECUTION_FIELD_LINE_RE = /^\s*(?:By|Name|Title|Date|Email|Signature)\s*:/i;

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
        if (roleHeadingStartsExecutionCluster(lines, i)) break;
        if (isStandaloneSignaturesHeadingLine(lines[i] ?? "")) break;
        if (EXECUTION_FIELD_LINE_RE.test(t)) {
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

function sanitizeRoleAssignments(corpus: string): AcceptedCorpusRoleAssignment[] {
  return resolvePaidProPartyRolesFromAcceptedCorpus(corpus)
    .map((role) => ({
      ...role,
      legalName: repairDuplicatedLegalEntitySuffixPhrase(role.legalName),
    }))
    .filter((role) => role.legalName.length >= 3 && !isRecitalFragmentExecutionPartyLine(role.legalName));
}

function operativeBodyWithoutExecutionTails(text: string): string {
  const firstWitness = text.search(/\bIN WITNESS WHEREOF\b/i);
  let prefix = firstWitness >= 0 ? text.slice(0, firstWitness) : text;
  const stripped = stripPreWitnessExecutionPollutionFromPrefix(prefix);
  prefix = stripped.text;
  if (firstWitness >= 0) return prefix.trimEnd();
  const sigStart = prefix.search(/\n\s*(?:CLIENT|SERVICE\s+PROVIDER)\s*:\s*(?:\n|$)/i);
  if (sigStart >= 0) return prefix.slice(0, sigStart).trimEnd();
  return prefix.trimEnd();
}

/** Hard invariant: no duplicate role headings after the first CLIENT / SERVICE PROVIDER pair. */
export function truncatePostCanonicalExecutionPollution(text: string): { text: string; repairs: string[] } {
  const repairs: string[] = [];
  const witnessIdx = text.search(/\bIN WITNESS WHEREOF\b/i);
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
export function enforcePaidProSingleExecutionBlock(corpus: string): { text: string; repairs: string[] } {
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

  const witnessIdx = text.search(/\bIN WITNESS WHEREOF\b/i);
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

  const roles = sanitizeRoleAssignments(text);
  const client = roles.find((r) => r.role === "client");
  const provider = roles.find((r) => r.role === "service_provider");
  if (!client || !provider) {
    text = stripRecitalFragmentExecutionLinesFromTail(text, repairs);
    const truncated = truncatePostCanonicalExecutionPollution(text);
    if (truncated.text !== text) {
      repairs.push(...truncated.repairs);
      text = truncated.text;
    }
    return { text, repairs: [...new Set(repairs)] };
  }

  const body = operativeBodyWithoutExecutionTails(text);

  const identities = buildCorpusRoleIdentitiesForExecutionReconcile(
    `${body}\n\nThis Agreement is between ${client.legalName} ("Client") and ${provider.legalName} ("Service Provider").`,
  );
  const stub = [
    body,
    "",
    "IN WITNESS WHEREOF, the Parties execute this Agreement.",
    "",
    "CLIENT:",
    client.legalName,
    "",
    "SERVICE PROVIDER:",
    provider.legalName,
  ].join("\n");
  const reconciled = reconcileExecutionBlockToRoleIdentities(stub, identities);
  if (reconciled.text !== text) {
    repairs.push("execution_block:single_canonical_rebuilt");
  }
  text = reconciled.text;

  text = stripRecitalFragmentExecutionLinesFromTail(text, repairs);
  const truncated = truncatePostCanonicalExecutionPollution(text);
  if (truncated.text !== text) {
    repairs.push(...truncated.repairs);
    text = truncated.text;
  }

  logExecutionBlockLocation(text, "enforcePaidProSingleExecutionBlock");
  logExecutionBlockCount(text, "enforcePaidProSingleExecutionBlock");
  return { text, repairs: [...new Set(repairs)] };
}
