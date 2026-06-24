/**
 * TEST439 — Red Mesa / Harbor Peak Pro section heading title authority regression.
 */

import type { ParsedDraftShape } from "./intakeSmartDefaults";
import {
  TEST435_HARBOR_PEAK,
  TEST435_INTAKE,
  TEST435_INTAKE_WITH_SIGNERS,
  TEST435_MIN_SERVER_LEN,
  TEST435_RED_MESA,
  test435Draft,
} from "./paidProTest435Fixtures";

export const TEST439_RED_MESA = TEST435_RED_MESA;
export const TEST439_HARBOR_PEAK = TEST435_HARBOR_PEAK;
export const TEST439_INTAKE = TEST435_INTAKE;
export const TEST439_INTAKE_WITH_SIGNERS = TEST435_INTAKE_WITH_SIGNERS;
export const TEST439_MIN_SERVER_LEN = TEST435_MIN_SERVER_LEN;

export function test439Draft(): ParsedDraftShape {
  return test435Draft();
}

function padToLen(body: string, minLen = TEST439_MIN_SERVER_LEN): string {
  let t = body.trim();
  let section = 60;
  while (t.length < minLen) {
    t += `\n\n${section}. SUPPLEMENTAL OPERATIVE TERMS\nEach Party will cooperate in good faith on milestones, deliverables, reporting, and change orders under Oklahoma law. Section ${section} supplements the Services, Payment, and Confidentiality obligations without altering party identities or notice destinations.`;
    section += 1;
  }
  return t;
}

/**
 * Production-style server draft with split section titles, orphan heading fragments,
 * and truncated Harbor Peak entity labels in recital, notices, and signatures.
 */
export function buildTest439CorruptedServerDraft(): string {
  const body = [
    "CONSULTING SERVICES AGREEMENT",
    "",
    `This Consulting Services Agreement (this "Agreement") is entered into as of the Effective Date by and between ${TEST439_RED_MESA} ("Client") and Harbor Peak Automation ("Service Provider").`,
    "",
    "1. SCOPE OF SERVICES",
    "Service Provider will provide workflow automation consulting, systems integration support, reporting dashboards, and operational process optimization services.",
    "",
    "2. TERM",
    "The initial term is twelve (12) months unless terminated earlier in accordance with this Agreement.",
    "",
    "3. Fees,",
    "Invoicing and Expenses",
    "Client will pay Service Provider $5,000 per month. Payment is due within fifteen (15) days of invoice.",
    "",
    "Ownership, Licenses and",
    "Client Materials",
    "",
    "4. INTELLECTUAL PROPERTY",
    "Client retains ownership of Client Materials. Service Provider assigns work product to Client upon full payment.",
    "",
    "5. CONFIDENTIALITY",
    "Each party will protect the other party's confidential information for three (3) years.",
    "",
    "Responsibilities, Compliance and Relationship of the",
    "Parties",
    "",
    "6. REPRESENTATIONS, WARRANTIES AND COMPLIANCE",
    "Each party represents that it has authority to enter this Agreement and will comply with applicable law.",
    "",
    "7. LIMITATION OF LIABILITY",
    "Direct damages are limited to fees paid in the twelve (12) months preceding the claim.",
    "",
    "8. Term,",
    "Termination and Effect of Termination",
    "Either party may terminate for convenience on thirty (30) days written notice.",
    "",
    "9. GOVERNING LAW",
    "This Agreement is governed by the laws of Oklahoma.",
    "",
    "10. NOTICES",
    "Notices must be in writing and delivered to the addresses below.",
    "",
    `If to ${TEST439_RED_MESA}:`,
    TEST439_RED_MESA,
    "Attn: Alice Client, CEO",
    "Email: contracts@redmesa.example.com",
    "",
    "If to Harbor Peak Automation LLC:",
    "Harbor Peak Automation",
    "Attn: Bob Provider, President",
    "Email: legal@harborpeak.example.com",
    "",
    "IN WITNESS WHEREOF, the parties execute this Agreement.",
    "",
    "CLIENT:",
    TEST439_RED_MESA,
    "By: ______________________________",
    "Name: Alice Client",
    "Title: CEO",
    "",
    "SERVICE PROVIDER:",
    "Harbor Peak Automation",
    "By: ______________________________",
    "Name: Bob Provider",
    "Title: President",
  ].join("\n");

  return padToLen(body, TEST439_MIN_SERVER_LEN);
}
