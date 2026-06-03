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

export {
  isRecitalFragmentExecutionPartyLine,
  repairDuplicatedLegalEntitySuffixInCorpus,
  repairDuplicatedLegalEntitySuffixPhrase,
} from "./paidProLegalEntityNameHygiene";

const EXECUTION_ROLE_HEADING_LINE_RE =
  /^\s*(?:CLIENT|SERVICE\s+PROVIDER|CONSULTANT|PROVIDER|PARTY\s+\d+)\s*:?\s*$/i;

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
  if (firstWitness >= 0) return text.slice(0, firstWitness).trimEnd();
  const sigStart = text.search(/\n\s*(?:CLIENT|SERVICE\s+PROVIDER)\s*:\s*(?:\n|$)/i);
  if (sigStart >= 0) return text.slice(0, sigStart).trimEnd();
  return text.trimEnd();
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

  return { text, repairs: [...new Set(repairs)] };
}
