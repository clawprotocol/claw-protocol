/**
 * TEST432 — 4-party North Star live pipeline shrink fixture (~20k wire → ~19.7k document_text).
 */

import { applyAcceptedProCorpusSafeDisplay } from "./acceptedProCorpusSafeDisplay";
import { buildNPartyPaidProServerCorpus } from "./paidProNPartyCorpusBuilder";
import {
  BLUE_CANYON,
  DELTA_INTEGRATION,
  NORTH_STAR,
  SUMMIT_RIDGE,
  TEST429_FOUR_PARTY_NORTH_STAR_INTAKE,
  test429Draft,
} from "./paidProTest429FourPartyNorthStarFixtures";

export const TEST432_FOUR_PARTY_WIRE_TARGET_LEN = 20_433;
export const TEST432_FOUR_PARTY_SHRUNK_DOC_MIN = 18_000;
export const TEST432_FOUR_PARTY_SHRUNK_DOC_MAX = 19_800;

const ALL_PARTIES = [NORTH_STAR, SUMMIT_RIDGE, DELTA_INTEGRATION, BLUE_CANYON];

export function test432FourPartyStructuredDraft() {
  return {
    ...test429Draft(),
    purpose: "Manufacturing workflow modernization and ERP analytics.",
    parties: [
      { name: NORTH_STAR, role: "Client" },
      { name: SUMMIT_RIDGE, role: "Lead Consultant" },
      { name: DELTA_INTEGRATION, role: "Technology Integrator" },
      { name: BLUE_CANYON, role: "Data Analytics Provider" },
    ],
  };
}

function buildTest432FourPartySubstantiveBase(minLen = 20_000): string {
  return buildNPartyPaidProServerCorpus({
    parties: ALL_PARTIES,
    intakeText: TEST429_FOUR_PARTY_NORTH_STAR_INTAKE,
    draft: test432FourPartyStructuredDraft(),
    title: "Consulting and Implementation Agreement",
    minLen,
  });
}

function injectWireMalformations(corpus: string): string {
  let out = corpus;
  if (!/^\s*9\.\s+Revenue Allocation Among\s*$/m.test(out)) {
    out = out.replace(
      "\n1. SERVICES AND SCOPE",
      "\n9. Revenue Allocation Among\n\nService Providers\n\n1. SERVICES AND SCOPE",
    );
  }
  const witnessIdx = out.search(/\nIN WITNESS WHEREOF/i);
  if (witnessIdx > 0) {
    const duplicateMisc = [
      "",
      "14. Miscellaneous",
      "",
      "14.5 Counterparts",
      "This Agreement may be executed in counterparts.",
      "",
      "14.6 Electronic Signatures",
      "Electronic signatures are binding.",
      "",
      "[SIGNATURES FOLLOW]",
    ].join("\n");
    out = `${out.slice(0, witnessIdx)}\n${duplicateMisc}\n${out.slice(witnessIdx)}`;
  }
  return out;
}

/** Malformed substantive server_full_document_text (~20k) with split headings and duplicate misc. */
export function buildTest432FourPartyWireServerCorpus(): string {
  const base = buildTest432FourPartySubstantiveBase(TEST432_FOUR_PARTY_WIRE_TARGET_LEN - 500);
  const malformed = injectWireMalformations(base);
  if (malformed.length >= TEST432_FOUR_PARTY_WIRE_TARGET_LEN - 200) return malformed;
  return `${malformed}\n\nSupplemental operative detail for milestone reporting, integration checkpoints, and Oklahoma governing law cooperation among all Parties.`;
}

/** Shrunk document_text after premium_completion_pipeline local safe display (~19.7k, >85% of wire). */
export function buildTest432FourPartyShrunkDocumentText(): string {
  const clean = buildTest432FourPartySubstantiveBase(20_000);
  const safe = applyAcceptedProCorpusSafeDisplay(clean, {
    draft: test432FourPartyStructuredDraft(),
    intakeText: TEST429_FOUR_PARTY_NORTH_STAR_INTAKE,
    surface: "premium_completion_pipeline",
  });
  return safe.text.trim();
}

/** document_text with operative esign clauses stripped — triggers minimum-substance false negative on shrunk path. */
export function buildTest432FourPartyShrunkDocumentWithoutEsignClauses(): string {
  const shrunk = buildTest432FourPartyShrunkDocumentText();
  const witnessIdx = shrunk.search(/\nIN WITNESS WHEREOF/i);
  const head = witnessIdx >= 0 ? shrunk.slice(0, witnessIdx) : shrunk;
  const tail = witnessIdx >= 0 ? shrunk.slice(witnessIdx) : "";
  const stripped = head
    .replace(/\n\d+\.\d+\s+Counterparts[\s\S]*?(?=\n\d+\.|\n\[SIGNATURES|\nIN WITNESS)/gi, "\n")
    .replace(/\n\d+\.\d+\s+Electronic Signatures[\s\S]*?(?=\n\d+\.|\n\[SIGNATURES|\nIN WITNESS)/gi, "\n")
    .replace(/\bcounterparts?\b/gi, "copies")
    .replace(/\belectronic signatures?\b/gi, "digital signing");
  return `${stripped.trim()}\n\n${tail.trim()}`.trim();
}
