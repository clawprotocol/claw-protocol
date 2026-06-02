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
  isCanonicalPaidProOpeningRecitalLine,
  isRecitalFragmentExecutionPartyLine,
  repairDuplicatedLegalEntitySuffixInCorpus,
  repairDuplicatedLegalEntitySuffixPhrase,
} from "./paidProLegalEntityNameHygiene";
import { reconcileExecutionBlockToRoleIdentities } from "./paidProSignerMetadataMergeGate";

export {
  isRecitalFragmentExecutionPartyLine,
  repairDuplicatedLegalEntitySuffixInCorpus,
  repairDuplicatedLegalEntitySuffixPhrase,
} from "./paidProLegalEntityNameHygiene";

function sanitizeRoleAssignments(corpus: string): AcceptedCorpusRoleAssignment[] {
  return resolvePaidProPartyRolesFromAcceptedCorpus(corpus)
    .map((role) => ({
      ...role,
      legalName: repairDuplicatedLegalEntitySuffixPhrase(role.legalName),
    }))
    .filter((role) => role.legalName.length >= 3 && !isRecitalFragmentExecutionPartyLine(role.legalName));
}

function stripPrematureExecutionBlocksFromOperativeBody(body: string, repairs: string[]): string {
  const lines = body.split("\n");
  const out: string[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    const trimmed = line.trim();
    if (/^\s*(?:CLIENT|SERVICE\s+PROVIDER)\s*:?\s*$/i.test(trimmed)) {
      const next = (lines[i + 1] ?? "").trim();
      if (!next || isRecitalFragmentExecutionPartyLine(next) || isRecitalFragmentExecutionPartyLine(trimmed)) {
        repairs.push("execution_block:strip_premature_heading");
        i += 1;
        while (i < lines.length) {
          const probe = (lines[i] ?? "").trim();
          if (!probe) break;
          if (/^\d+\.(\d+\.)?\s+[A-Z]/.test(probe)) break;
          if (/^\s*(?:CLIENT|SERVICE\s+PROVIDER|IN WITNESS)\b/i.test(probe)) break;
          i += 1;
        }
        continue;
      }
    }
    if (
      isRecitalFragmentExecutionPartyLine(trimmed) &&
      !isCanonicalPaidProOpeningRecitalLine(trimmed)
    ) {
      repairs.push("execution_block:strip_recital_fragment_line");
      continue;
    }
    out.push(line);
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd();
}

function operativeBodyWithoutExecutionTails(text: string): string {
  const firstWitness = text.search(/\bIN WITNESS WHEREOF\b/i);
  if (firstWitness >= 0) return text.slice(0, firstWitness).trimEnd();
  const sigStart = text.search(/\n\s*(?:CLIENT|SERVICE\s+PROVIDER)\s*:\s*(?:\n|$)/i);
  if (sigStart >= 0) return text.slice(0, sigStart).trimEnd();
  return text.trimEnd();
}

/**
 * Collapse duplicate witness / fragment-derived execution blocks to one canonical tail from SoT roles.
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

  const roles = sanitizeRoleAssignments(text);
  const client = roles.find((r) => r.role === "client");
  const provider = roles.find((r) => r.role === "service_provider");
  if (!client || !provider) return { text, repairs };

  let body = operativeBodyWithoutExecutionTails(text);
  body = stripPrematureExecutionBlocksFromOperativeBody(body, repairs);

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

  return { text, repairs: [...new Set(repairs)] };
}
