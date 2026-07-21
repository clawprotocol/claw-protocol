/**
 * Node-safe four-party E2E corpus — no Vite import.meta or production env imports.
 * Party names align with RC paid Pro parse mock and quad-party intake.
 */
import {
  SHARED_ACCEPTED_PAID_BODY,
  SHARED_HARBOR_PEAK,
  SHARED_RED_MESA,
} from "../../src/components/agreements/paidProSharedFixtureSystem";
export const RC_QUAD_PARTY_ENTITIES = [
  "Redwood Biologics, Inc.",
  "Summit AI Consulting LLC",
  "Blue Harbor Systems LLC",
  "Iron Gate Security LLC",
] as const;

export const RC_QUAD_PARTY_ROLES = [
  "Client",
  "Lead Provider",
  "Implementation Partner",
  "Cybersecurity Auditor",
] as const;

export const RC_QUAD_PARTY_INTAKE = [
  "Draft a four-party Professional Services Agreement among:",
  "",
  `* ${RC_QUAD_PARTY_ENTITIES[0]} (${RC_QUAD_PARTY_ROLES[0]})`,
  `* ${RC_QUAD_PARTY_ENTITIES[1]} (${RC_QUAD_PARTY_ROLES[1]})`,
  `* ${RC_QUAD_PARTY_ENTITIES[2]} (${RC_QUAD_PARTY_ROLES[2]})`,
  `* ${RC_QUAD_PARTY_ENTITIES[3]} (${RC_QUAD_PARTY_ROLES[3]})`,
  "",
  "Summit AI leads software delivery; Blue Harbor implements integrations; Iron Gate audits security controls.",
  "Total fees: $450,000 across milestone installments. Term: twelve (12) months. Delaware law governs.",
  "",
  "Include confidentiality, intellectual property, limitation of liability, termination, notices, and four execution blocks.",
].join("\n");

/** Substantive four-party paid Pro body derived from accepted two-party frozen corpus. */
export function buildRcQuadPartyPaidBody(): string {
  const [redwood, summit, blueHarbor, ironGate] = RC_QUAD_PARTY_ENTITIES;
  let body = SHARED_ACCEPTED_PAID_BODY.replaceAll(SHARED_RED_MESA, redwood).replaceAll(
    SHARED_HARBOR_PEAK,
    summit,
  );
  if (!body.includes(blueHarbor)) {
    body = body.replace(
      summit,
      `${summit}, ${blueHarbor}, and ${ironGate}`,
    );
  }
  if (!body.includes(blueHarbor)) {
    body += `\n\nAdditional parties: ${blueHarbor} and ${ironGate}.`;
  }
  return body;
}

export const RC_QUAD_PENDING_DRAFT = {
  title: "Multi-Party Professional Services Agreement",
  jurisdiction: "Delaware",
  parties: RC_QUAD_PARTY_ENTITIES.map((name, i) => ({
    name,
    role: RC_QUAD_PARTY_ROLES[i] ?? "party",
  })),
  purpose: "Enterprise technology delivery with security audit oversight.",
  payment_terms: "$450,000 milestone installments",
  duration: "12 months",
  due_date: null,
  effective_date: "2026-01-01",
  agreement_family: "services_agreement",
};
