/**
 * TEST432 — Red Mesa / Harbor Peak 2-party Pro post-checkout (Oklahoma, $5k/mo).
 */

import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { buildNPartyPaidProServerCorpus } from "./paidProNPartyCorpusBuilder";
import { buildPaidProStructuralRecoveryBody } from "./paidProStructuralRecovery";

export const TEST432_MIN_SERVER_LEN = 9200;

function padCorpus(body: string, minLen = TEST432_MIN_SERVER_LEN): string {
  let t = body.trim();
  let section = 20;
  while (t.length < minLen) {
    t += `\n\n${section}. SUPPLEMENTAL OPERATIVE TERMS\nEach Party will cooperate in good faith on milestones, deliverables, reporting, and change orders under Oklahoma law. Section ${section} supplements the Services, Payment, and Confidentiality obligations without altering party identities or notice destinations.`;
    section += 1;
  }
  return t;
}

export const TEST432_RED_MESA = "Red Mesa Logistics LLC";
export const TEST432_HARBOR_PEAK = "Harbor Peak Automation LLC";

export const TEST432_INTAKE = [
  `Agreement between ${TEST432_RED_MESA} (Client) and ${TEST432_HARBOR_PEAK} (Service Provider).`,
  "Workflow automation consulting, systems integration, and related advisory services.",
  "Start date August 1, 2026. Term 12 months.",
  "Payment $5,000 per month, due within 15 days of invoice.",
  "Termination: 15 days notice for breach; 30 days without cause.",
  "Service Provider retains pre-existing tools; Client owns business data. Confidentiality 3 years.",
  "Governing law: Oklahoma.",
  `${TEST432_RED_MESA} signer: Alice Client, CEO, contracts@redmesa.example.com.`,
  `${TEST432_HARBOR_PEAK} signer: Bob Provider, President, legal@harborpeak.example.com.`,
].join("\n");

export function test432Draft(): ParsedDraftShape {
  return {
    title: "Services Agreement",
    jurisdiction: "Oklahoma",
    parties: [
      { name: TEST432_RED_MESA, role: "Client" },
      { name: TEST432_HARBOR_PEAK, role: "Service Provider" },
    ],
    purpose: "Workflow automation consulting and systems integration.",
    payment_terms: "$5,000 per month",
    duration: "12 months",
    due_date: null,
    effective_date: "August 1, 2026",
    payment: { amount: 5000, cadence: "monthly", valid: true },
  };
}

export function buildTest432PreparedAcceptCorpus(): string {
  const nParty = buildNPartyPaidProServerCorpus({
    parties: [TEST432_RED_MESA, TEST432_HARBOR_PEAK],
    intakeText: TEST432_INTAKE,
    draft: test432Draft(),
    title: "Services Agreement",
    minLen: 8600,
  });
  if (nParty.length >= TEST432_MIN_SERVER_LEN) return nParty;

  const built = buildPaidProStructuralRecoveryBody({
    intakeText: TEST432_INTAKE,
    draft: test432Draft(),
  });
  if (!built.ok) return padCorpus(nParty, TEST432_MIN_SERVER_LEN);
  const witnessIdx = built.body.search(/\nIN WITNESS WHEREOF/i);
  const head = witnessIdx >= 0 ? built.body.slice(0, witnessIdx) : built.body;
  const tail = witnessIdx >= 0 ? built.body.slice(witnessIdx) : "";
  let expanded = head;
  for (let i = 0; i < 10; i += 1) {
    expanded += `\n\n${20 + i}. DELIVERABLES AND REPORTING APPENDIX ${i + 1}\nEach Party will provide monthly status reports, integration checkpoints, and good-faith cooperation on workflow automation deliverables governed by Oklahoma law.`;
  }
  return padCorpus(`${expanded}\n\n${tail}`, TEST432_MIN_SERVER_LEN);
}

/** Server-style corpus with NOTICES heading but dangling/incomplete stanzas — freeze prep repairs. */
export function buildTest432ServerFullDraftWithIncompleteNotices(): string {
  const base = buildTest432PreparedAcceptCorpus();
  const stripped = base.replace(
    /(If to Red Mesa[\s\S]*?)(?=\n\d+\.\s+GOVERNING|\nGOVERNING LAW|\nIN WITNESS)/i,
    "If to\n",
  );
  return padCorpus(stripped, TEST432_MIN_SERVER_LEN);
}
