/**
 * TEST435 — Red Mesa / Harbor Peak manual QA prompt (2-party Oklahoma consulting).
 */

import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { buildTest432PreparedAcceptCorpus } from "./paidProTest432Fixtures";

export const TEST435_RED_MESA = "Red Mesa Logistics LLC";
export const TEST435_HARBOR_PEAK = "Harbor Peak Automation LLC";

/** Exact sanitized manual QA prompt from TEST435. */
export const TEST435_INTAKE = [
  "Client: Red Mesa Logistics LLC",
  "Service Provider: Harbor Peak Automation LLC",
  "Workflow automation consulting, systems integration support, reporting dashboards, operational process optimization services.",
  "Term: 12 months",
  "Fee: $5,000 per month",
  "Payment due within 15 days of invoice.",
  "Governing law: Oklahoma.",
].join("\n");

export const TEST435_INTAKE_WITH_SIGNERS = [
  TEST435_INTAKE,
  "",
  `${TEST435_RED_MESA} signer: Alice Client, CEO, contracts@redmesa.example.com.`,
  `${TEST435_HARBOR_PEAK} signer: Bob Provider, President, legal@harborpeak.example.com.`,
].join("\n");

export const TEST435_MIN_SERVER_LEN = 15000;

function padToLen(body: string, minLen = TEST435_MIN_SERVER_LEN): string {
  let t = body.trim();
  let section = 60;
  while (t.length < minLen) {
    t += `\n\n${section}. SUPPLEMENTAL OPERATIVE TERMS\nEach Party will cooperate in good faith on milestones, deliverables, reporting, and change orders under Oklahoma law. Section ${section} supplements the Services, Payment, and Confidentiality obligations without altering party identities or notice destinations.`;
    section += 1;
  }
  return t;
}

export function test435Draft(): ParsedDraftShape {
  return {
    title: "Consulting Services Agreement",
    jurisdiction: "Oklahoma",
    parties: [
      { name: TEST435_RED_MESA, role: "Client" },
      { name: TEST435_HARBOR_PEAK, role: "Service Provider" },
    ],
    purpose:
      "Workflow automation consulting, systems integration support, reporting dashboards, and operational process optimization services.",
    payment_terms: "$5,000 per month. Payment due within 15 days of invoice.",
    duration: "12 months",
    due_date: null,
    effective_date: null,
    payment: { amount: 5000, cadence: "monthly", valid: true },
  };
}

/**
 * Production-style ~17k server corpus: repairable orphan subsection (10.1 without parent 10),
 * glued mid-hierarchy break (6.2 without 6.1), and incomplete notice stanzas.
 */
export function buildTest435ServerFullDraftWithRepairableStructureBreaks(): string {
  let base = padToLen(buildTest432PreparedAcceptCorpus(), TEST435_MIN_SERVER_LEN);
  base = base.replace(/\n10\. NOTICES\b[^\n]*/i, "\n10.1 Notice Delivery Requirements");
  base = base.replace(
    /\n6\. LIMITATION OF LIABILITY/i,
    "\n6.2 Service Warranty\nServices will be performed in a professional manner consistent with industry standards.\n\n6. LIMITATION OF LIABILITY",
  );
  base = base.replace(
    /(If to Red Mesa[\s\S]*?)(?=\n\d+\.\s+GOVERNING|\nGOVERNING LAW|\nIN WITNESS)/i,
    "If to\n",
  );
  return padToLen(base, TEST435_MIN_SERVER_LEN);
}
