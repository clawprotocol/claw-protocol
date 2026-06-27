/**
 * TEST460 — Red Mesa / Blue Canyon / Harbor Peak / Iron Vale SoT establishment regression.
 */

import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { buildDeterministicQuadPartyMutualServicesProFallback } from "./deterministicQuadPartyProFallback";
import { padOperativeCorpusBeforeWitness } from "./paidProTestAcceptedQuadPartyCorpus";
import {
  TEST416_LEGAL_ENTITIES,
  test416Draft,
} from "./paidProTest416Fixtures";

export const TEST460_TARGET_SERVER_LEN = 19_841;

/** Exact live Red Mesa prompt (TEST460). */
export const TEST460_LIVE_INTAKE =
  "Red Mesa Logistics LLC and Blue Canyon Analytics LLC jointly engage Harbor Peak Automation LLC and Iron Vale Systems Inc.; warehouse automation/reporting platform; $185,000; $75,000 on execution; balance monthly over six months; 12-month term; confidentiality, IP, liability, IC status, mutual indemnification, notices, Oklahoma law, written amendment by all parties, electronic signatures.";

export function test460RedMesaDraft(): ParsedDraftShape {
  return test416Draft();
}

export function buildTest460SubstantiveServerBody(
  intake = TEST460_LIVE_INTAKE,
  draft = test460RedMesaDraft(),
): string {
  const fallback = buildDeterministicQuadPartyMutualServicesProFallback({
    rawIntake: intake,
    draft,
  });
  if (!fallback.ok) {
    throw new Error(`test460_fallback_failed:${fallback.reasons.join(",")}`);
  }
  let body = padOperativeCorpusBeforeWitness(fallback.body, TEST460_TARGET_SERVER_LEN);
  let padIdx = 0;
  while (body.length < TEST460_TARGET_SERVER_LEN) {
    padIdx += 1;
    body +=
      `\n\nSupplemental warehouse automation provision ${padIdx}. Each Party shall maintain reporting tier ${padIdx} under Oklahoma commercial standards.`;
  }
  if (body.length > TEST460_TARGET_SERVER_LEN) {
    body = body.slice(0, TEST460_TARGET_SERVER_LEN);
  }
  while (body.length < TEST460_TARGET_SERVER_LEN) {
    body += "\n";
  }
  return body.slice(0, TEST460_TARGET_SERVER_LEN);
}

/** Phantom fifth notice stanza observed in live notice repair (partyCount/stanzaCount 5). */
export function buildTest460PhantomFifthPartyNoticeStanza(): string {
  return [
    "If to Summit Outdoor Partners LLC:",
    "Summit Outdoor Partners LLC",
    "Attention: Authorized Signer",
    "Email: provided during signer setup",
    "Address: primary business address on file with the Party",
  ].join("\n");
}

/**
 * Live-style server draft: multiline title anomaly, notice signer-setup scaffolding,
 * and phantom fifth notice stanza before substantive freeze/SoT establishment.
 */
export function buildTest460LiveRegressionServerBody(
  intake = TEST460_LIVE_INTAKE,
  draft = test460RedMesaDraft(),
): string {
  const substantive = buildTest460SubstantiveServerBody(intake, draft);
  const sec1Idx = substantive.search(/\n\s*1\.\s+/);
  const operative = sec1Idx >= 0 ? substantive.slice(sec1Idx) : substantive;
  const [red, blue, harbor, iron] = TEST416_LEGAL_ENTITIES;
  const defectiveHead = [
    "MUTUAL CONSULTING AND",
    "WAREHOUSE AUTOMATION SERVICES AGREEMENT",
    "",
    `This Mutual Consulting and Warehouse Automation Services Agreement ("Agreement") is entered into by and among ${red}, ${blue}, ${harbor}, and ${iron} (each a "Party" and collectively the "Parties").`,
    "",
  ].join("\n");
  let body = `${defectiveHead}${operative}`;

  const witnessIdx = body.search(/\bIN WITNESS WHEREOF\b/i);
  if (witnessIdx >= 0) {
    const beforeWitness = body.slice(0, witnessIdx).trimEnd();
    const afterWitness = body.slice(witnessIdx);
    const phantom = buildTest460PhantomFifthPartyNoticeStanza();
    const noticeScaffold = [
      "",
      `If to ${red}:`,
      red,
      "Attn: Notice Contact",
      "Email: provided during signer setup",
      "Address: primary business address on file with the Party",
      "",
      phantom,
    ].join("\n");
    body = `${beforeWitness}${noticeScaffold}\n\n${afterWitness}`;
  }

  if (body.length > TEST460_TARGET_SERVER_LEN + 800) {
    body = body.slice(0, TEST460_TARGET_SERVER_LEN);
  }
  while (body.length < TEST460_TARGET_SERVER_LEN) {
    body += "\n";
  }
  return body.slice(0, TEST460_TARGET_SERVER_LEN);
}
