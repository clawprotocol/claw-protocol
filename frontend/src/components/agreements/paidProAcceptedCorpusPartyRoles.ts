/**
 * Resolve party roles from the accepted Pro corpus opening (first Client / Service Provider
 * parentheticals win over later inverted recitals or recipient slot order).
 */

import type { CanonicalPartyIdentity } from "./guidedDealCompletion/signerPartyIdentity";
import { sortIdentitiesForExecutionBlockOrder } from "./paidProSignerMetadataMergeGate";

export function partyLegalNamesMatch(a: string, b: string): boolean {
  const na = a
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/[.,;:]+$/g, "");
  const nb = b
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/[.,;:]+$/g, "");
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.startsWith(nb) || nb.startsWith(na)) return true;
  return na.startsWith(`${nb} `) || nb.startsWith(`${na} `);
}

export type AcceptedCorpusPartyRole = "client" | "service_provider";

export type AcceptedCorpusRoleAssignment = {
  legalName: string;
  role: AcceptedCorpusPartyRole;
  roleLabel: "Client" | "Service Provider";
};

const ROLE_PAREN_RE =
  /([A-Za-z0-9][^("\n]{2,140}?)\s*\(\s*["']?(Client|Service\s+Provider)["']?\s*\)/gi;

/** Entity line in execution tail: `Blue Canyon Analytics LLC (Service Provider)`. */
const EXECUTION_ENTITY_PAREN_ROLE_RE =
  /^([A-Za-z0-9][^(\n]{2,140}?)\s*\(\s*(Client|Service\s+Provider)\s*\)\s*$/i;

const BETWEEN_CLIENT_PROVIDER_RE =
  /(?:\bbetween|\bby\s+and\s+between)\s+(.+?)\s*\(\s*["']?Client["']?\s*\)\s+and\s+(.+?)\s*\(\s*["']?Service\s+Provider["']?\s*\)/i;

function normalizedKey(name: string): string {
  return name
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/[.,;:]+$/g, "");
}

/**
 * Parse role assignments from the corpus head (before execution). First mention per legal name wins.
 */
export function resolvePaidProPartyRolesFromAcceptedCorpus(
  corpus: string,
): AcceptedCorpusRoleAssignment[] {
  const body = (corpus || "").replace(/\r\n/g, "\n");
  const witnessIdx = body.search(/\bIN WITNESS WHEREOF\b/i);
  const head = witnessIdx >= 0 ? body.slice(0, witnessIdx) : body.slice(0, 12_000);
  const seen = new Set<string>();
  const out: AcceptedCorpusRoleAssignment[] = [];

  const betweenMatch = head.match(BETWEEN_CLIENT_PROVIDER_RE);
  if (betweenMatch?.[1] && betweenMatch?.[2]) {
    const clientLegal = betweenMatch[1].trim().replace(/[.,;]+$/, "");
    const providerLegal = betweenMatch[2].trim().replace(/[.,;]+$/, "");
    if (clientLegal) {
      seen.add(normalizedKey(clientLegal));
      out.push({
        legalName: clientLegal,
        role: "client",
        roleLabel: "Client",
      });
    }
    if (providerLegal) {
      seen.add(normalizedKey(providerLegal));
      out.push({
        legalName: providerLegal,
        role: "service_provider",
        roleLabel: "Service Provider",
      });
    }
  }

  for (const match of head.matchAll(ROLE_PAREN_RE)) {
    const legal = (match[1] ?? "").trim().replace(/[.,;]+$/, "");
    const roleRaw = (match[2] ?? "").trim().toLowerCase();
    if (!legal || legal.length < 3) continue;
    const key = normalizedKey(legal);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const role: AcceptedCorpusPartyRole =
      roleRaw === "client" ? "client" : "service_provider";
    out.push({
      legalName: legal,
      role,
      roleLabel: role === "client" ? "Client" : "Service Provider",
    });
  }
  return out;
}

export function resolveAcceptedCorpusRoleLabelForLegalName(
  legalName: string,
  corpus: string | null | undefined,
): string | null {
  const trimmed = legalName.trim();
  if (!trimmed || !(corpus || "").trim()) return null;
  const hit = resolvePaidProPartyRolesFromAcceptedCorpus(corpus ?? "").find((a) =>
    partyLegalNamesMatch(trimmed, a.legalName),
  );
  return hit?.roleLabel ?? null;
}

function roleLabelToBlockHeading(roleLabel: string): string {
  const r = roleLabel.trim().toLowerCase();
  if (r === "client") return "CLIENT";
  if (r.includes("service") && r.includes("provider")) return "SERVICE PROVIDER";
  return roleLabel.trim().toUpperCase();
}

/** Build execution identities ordered CLIENT then SERVICE PROVIDER from corpus role parentheticals. */
export function buildCorpusRoleIdentitiesForExecutionReconcile(
  corpus: string,
): CanonicalPartyIdentity[] {
  const assignments = resolvePaidProPartyRolesFromAcceptedCorpus(corpus);
  const identities: CanonicalPartyIdentity[] = assignments.map((a, index) => ({
    index,
    partyDisplayName: a.legalName,
    blockHeading: roleLabelToBlockHeading(a.roleLabel),
    email: "",
    partyAddress: null,
    representativeName: null,
    title: null,
    isIndividual: false,
  }));
  return sortIdentitiesForExecutionBlockOrder(identities);
}

function executionTailRoleParentheticalInversion(
  tail: string,
  corpus: string,
): boolean {
  for (const match of tail.matchAll(new RegExp(EXECUTION_ENTITY_PAREN_ROLE_RE.source, "gim"))) {
    const entity = (match[1] ?? "").trim().replace(/[.,;]+$/, "");
    const labeledRole = (match[2] ?? "").trim().toLowerCase();
    if (!entity) continue;
    const expected = resolveAcceptedCorpusRoleLabelForLegalName(entity, corpus);
    if (!expected) continue;
    const expectedNorm = expected.toLowerCase();
    const labeledNorm = labeledRole === "client" ? "client" : "service provider";
    if (expectedNorm !== labeledNorm) return true;
  }
  return false;
}

/** True when execution block roles disagree with accepted corpus recital roles. */
export function detectExecutionBlockRoleInversion(corpus: string): boolean {
  const assignments = resolvePaidProPartyRolesFromAcceptedCorpus(corpus);
  const client = assignments.find((a) => a.role === "client");
  const provider = assignments.find((a) => a.role === "service_provider");
  if (!client || !provider) return false;

  const witnessIdx = corpus.search(/\bIN WITNESS WHEREOF\b/i);
  if (witnessIdx < 0) return false;
  const tail = corpus.slice(witnessIdx);

  const clientBlock = tail.match(/^\s*CLIENT\s*:\s*\n([^\n]+)/im);
  const providerBlock = tail.match(/^\s*SERVICE\s+PROVIDER\s*:\s*\n([^\n]+)/im);
  if (clientBlock?.[1] && providerBlock?.[1]) {
    const underClient = clientBlock[1].trim();
    const underProvider = providerBlock[1].trim();
    const clientOk = partyLegalNamesMatch(underClient, client.legalName);
    const providerOk = partyLegalNamesMatch(underProvider, provider.legalName);
    if (!clientOk || !providerOk) return true;
  }

  return executionTailRoleParentheticalInversion(tail, corpus);
}
