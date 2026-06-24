/**
 * TEST427 — Red Mesa / Harbor Peak orphan subsection fragment defect (5. / Service / Provider…).
 * Exact manual QA prompt from production defect report.
 */

import { buildTest432PreparedAcceptCorpus, TEST432_MIN_SERVER_LEN } from "./paidProTest432Fixtures";
import {
  TEST435_HARBOR_PEAK,
  TEST435_RED_MESA,
  test435Draft,
} from "./paidProTest435Fixtures";

export const TEST435_MIN_SERVER_LEN = TEST432_MIN_SERVER_LEN;
export const TEST427_RED_MESA_INTAKE = [
  TEST435_RED_MESA,
  TEST435_HARBOR_PEAK,
  "Workflow automation consulting",
  "$5,000/month",
  "12 months",
  "Oklahoma law",
].join("\n");

export const TEST427_RED_MESA_INTAKE_WITH_SIGNERS = [
  TEST427_RED_MESA_INTAKE,
  "",
  `${TEST435_RED_MESA} signer: Alice Client, CEO, contracts@redmesa.example.com.`,
  `${TEST435_HARBOR_PEAK} signer: Bob Provider, President, legal@harborpeak.example.com.`,
].join("\n");

export const TEST427_RESUME_PHRASE =
  "Service Provider will resume performance promptly after the issue is resolved.";

const ORPHAN_FRAGMENT_TAIL = [
  "Service Provider may suspend performance under this Agreement when required by law, regulatory action, or a force majeure event beyond its reasonable control.",
  "",
  "5.",
  "",
  "Service",
  "",
  "Provider will resume performance promptly after the issue is resolved.",
].join("\n");

function nextMajorSectionNumber(head: string): number {
  const nums = [...head.matchAll(/^\s*(\d{1,2})\.\s+[A-Z]/gm)]
    .map((m) => Number(m[1]))
    .filter(Number.isFinite);
  return nums.length ? Math.max(...nums) + 1 : 10;
}

function injectOrphanFragmentBeforeWitness(base: string): string {
  const witnessIdx = base.search(/\nIN WITNESS WHEREOF/i);
  const head = witnessIdx >= 0 ? base.slice(0, witnessIdx).trimEnd() : base.trimEnd();
  const tail = witnessIdx >= 0 ? base.slice(witnessIdx) : "";
  const major = nextMajorSectionNumber(head);
  const block = [
    `${major}. Suspension, Force Majeure and Transition`,
    "",
    ORPHAN_FRAGMENT_TAIL,
  ].join("\n");
  return tail ? `${head}\n\n${block}\n\n${tail}` : `${head}\n\n${block}`;
}

function padToLen(body: string, minLen = TEST435_MIN_SERVER_LEN): string {
  let t = body.trim();
  let section = 60;
  while (t.length < minLen) {
    t += `\n\n${section}. SUPPLEMENTAL OPERATIVE TERMS\nEach Party will cooperate in good faith on milestones, deliverables, reporting, and change orders under Oklahoma law. Section ${section} supplements the Services, Payment, and Confidentiality obligations without altering party identities or notice destinations.`;
    section += 1;
  }
  return t;
}

/**
 * ~17k server corpus with orphan `5.` + fragment `Service` + continuation `Provider will resume…`
 * under Section 10 — mirrors accepted Pro SoT defect before repair.
 */
export function buildTest427RedMesaOrphanSectionFragmentCorpus(): string {
  const base = padToLen(buildTest432PreparedAcceptCorpus(), TEST435_MIN_SERVER_LEN);
  return injectOrphanFragmentBeforeWitness(base);
}

export { TEST435_RED_MESA, TEST435_HARBOR_PEAK, test435Draft };
