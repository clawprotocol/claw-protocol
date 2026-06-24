/**
 * TEST444 — Railway QA short line-separated intake (Red Mesa / Harbor Peak).
 */

import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { buildNPartyPaidProServerCorpus } from "./paidProNPartyCorpusBuilder";
import { buildTest432PreparedAcceptCorpus } from "./paidProTest432Fixtures";

export const TEST444_RED_MESA = "Red Mesa Logistics LLC";
export const TEST444_HARBOR_PEAK = "Harbor Peak Automation LLC";

/** Exact Railway QA short prompt — unlabeled line-separated intake. */
export const TEST444_INTAKE = [
  TEST444_RED_MESA,
  TEST444_HARBOR_PEAK,
  "Workflow automation consulting",
  "$5,000/month",
  "12 months",
  "Oklahoma law",
].join("\n");

export const TEST444_MIN_SERVER_LEN = 17000;
export const TEST444_TARGET_SERVER_LEN = 17021;

export function test444Draft(): ParsedDraftShape {
  return {
    title: "Consulting Services Agreement",
    jurisdiction: "Oklahoma",
    parties: [
      { name: TEST444_RED_MESA, role: "Client" },
      { name: TEST444_HARBOR_PEAK, role: "Service Provider" },
    ],
    purpose: "Workflow automation consulting",
    payment_terms: "$5,000/month",
    duration: "12 months",
    due_date: null,
    effective_date: null,
    payment: { amount: 5000, cadence: "monthly", valid: true },
  };
}

function padToLen(body: string, minLen = TEST444_MIN_SERVER_LEN): string {
  let t = body.trim();
  let section = 60;
  while (t.length < minLen) {
    t += `\n\n${section}. SUPPLEMENTAL OPERATIVE TERMS\nEach Party will cooperate in good faith on milestones, deliverables, reporting, and change orders under Oklahoma law. Section ${section} supplements the Services, Payment, and Confidentiality obligations without altering party identities or notice destinations.`;
    section += 1;
  }
  return t;
}

/** Production-style ~17k server draft with repairable section-structure breaks. */
export function buildTest444ServerFullDraft(): string {
  let base = padToLen(buildTest432PreparedAcceptCorpus(), TEST444_MIN_SERVER_LEN);
  base = base.replace(/\n10\. NOTICES\b[^\n]*/i, "\n10.1 Notice Delivery Requirements");
  base = base.replace(
    /\n6\. LIMITATION OF LIABILITY/i,
    "\n6.2 Service Warranty\nServices will be performed in a professional manner consistent with industry standards.\n\n6. LIMITATION OF LIABILITY",
  );
  base = base.replace(
    /(If to Red Mesa[\s\S]*?)(?=\n\d+\.\s+GOVERNING|\nGOVERNING LAW|\nIN WITNESS)/i,
    "If to\n",
  );
  return padToLen(base, TEST444_MIN_SERVER_LEN);
}

/** Alternate builder from N-party corpus for notice-heading regression coverage. */
export function buildTest444NPartyServerFullDraft(): string {
  return padToLen(
    buildNPartyPaidProServerCorpus({
      parties: [TEST444_RED_MESA, TEST444_HARBOR_PEAK],
      intakeText: TEST444_INTAKE,
      draft: test444Draft(),
      title: "Consulting Services Agreement",
      minLen: TEST444_MIN_SERVER_LEN,
    }),
    TEST444_MIN_SERVER_LEN,
  );
}
