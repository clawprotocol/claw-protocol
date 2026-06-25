/**
 * TEST434 — degraded json_parse HTTP 200 with no server_full_document_text (~11.7k document_text).
 */

import {
  BLUE_CANYON,
  DELTA_INTEGRATION,
  NORTH_STAR,
  SUMMIT_RIDGE,
  TEST429_FOUR_PARTY_NORTH_STAR_INTAKE,
  test429Draft,
} from "./paidProTest429FourPartyNorthStarFixtures";

export const TEST434_TARGET_DEGRADED_LEN = 11_786;

const ALL_PARTIES = [NORTH_STAR, SUMMIT_RIDGE, DELTA_INTEGRATION, BLUE_CANYON];

/** Degraded document_text missing NOTICES heading — fails client gates / freeze, no server full. */
export function buildTest434DegradedJsonParseDocumentText(): string {
  const header = [
    "CONSULTING AND IMPLEMENTATION AGREEMENT",
    "",
    `This Consulting and Implementation Agreement is entered into by and among ${NORTH_STAR} ("Client"), ${SUMMIT_RIDGE} ("Lead Consultant"), ${DELTA_INTEGRATION} ("Technology Integrator"), and ${BLUE_CANYON} ("Data Analytics Provider").`,
    "",
    "1. SERVICES AND SCOPE. Lead Consultant shall manage manufacturing workflow modernization, ERP analytics, and executive reporting.",
    "2. PAYMENT. Client shall pay a total project fee of $240,000 pursuant to the payment schedule in the intake.",
    "3. REVENUE ALLOCATION. Lead Consultant 40%, Technology Integrator 35%, Data Analytics Provider 25%.",
    "4. CONFIDENTIALITY. Mutual confidentiality obligations apply to all parties.",
    "5. LIABILITY. Aggregate liability is capped at fees actually received except for fraud or willful misconduct.",
    "6. TERM. Eighteen months unless earlier terminated.",
    "7. GOVERNING LAW. Oklahoma.",
    "8. COMMUNICATIONS. Notices may be delivered by email (degraded stub — not operative NOTICES family).",
    "",
    "IN WITNESS WHEREOF, the parties execute this Agreement.",
    "",
    "CLIENT: " + NORTH_STAR,
    "By: ______________________________",
    "",
    "LEAD CONSULTANT: " + SUMMIT_RIDGE,
    "By: ______________________________",
    "",
    "TECHNOLOGY INTEGRATOR: " + DELTA_INTEGRATION,
    "By: ______________________________",
    "",
    "DATA ANALYTICS PROVIDER: " + BLUE_CANYON,
    "By: ______________________________",
    "",
  ].join("\n");

  let body = header;
  let i = 9;
  while (body.length < TEST434_TARGET_DEGRADED_LEN) {
    body +=
      `\n${i}. Supplemental Deliverable ${i}. Each service provider shall document milestone ${i} deliverables, ` +
      `coordinate integration workstream ${i}, maintain insurance tier ${i}, and comply with Oklahoma commercial standards ` +
      `for engagement phase ${i} including records retention and confidentiality controls for operational segment ${i}.`;
    i += 1;
  }
  return body.slice(0, TEST434_TARGET_DEGRADED_LEN);
}

export function test434FourPartyDraft() {
  return test429Draft();
}

export function test434Intake() {
  return TEST429_FOUR_PARTY_NORTH_STAR_INTAKE;
}

export function test434AllParties() {
  return ALL_PARTIES;
}
