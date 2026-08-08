/**
 * Fail-closed detection when a painted corpus clearly belongs to a different intake
 * (e.g. Alex Rivera / PixelForge $4,500 design body under a SaaS pilot negotiation prompt).
 */

export type PaidProIntakeCorpusFidelityResult = {
  contaminated: boolean;
  reasons: string[];
};

const PLACEHOLDER_PARTY_RE = /^(?:party\s*\d+|client|service\s+provider|designer|provider)$/i;

function normalizeBlob(s: string): string {
  return (s || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function extractCorpusPartyHints(corpus: string): string[] {
  const out: string[] = [];
  const notice = corpus.matchAll(/If to\s+([^:\n]{2,80}):/gi);
  for (const m of notice) {
    const name = (m[1] || "").trim();
    if (name && !PLACEHOLDER_PARTY_RE.test(name)) out.push(name);
  }
  const client = corpus.match(/^\s*CLIENT:\s*(.+)$/im)?.[1]?.trim();
  if (client && !PLACEHOLDER_PARTY_RE.test(client)) out.push(client);
  const provider = corpus.match(/^\s*SERVICE PROVIDER:\s*(.+)$/im)?.[1]?.trim();
  if (provider && !PLACEHOLDER_PARTY_RE.test(provider)) out.push(provider);
  return [...new Set(out.map((n) => n.replace(/\s+/g, " ").trim()).filter((n) => n.length >= 4))];
}

/**
 * Returns contaminated=true when multiple independent signals show the corpus
 * is from a prior/unrelated deal relative to the current intake.
 */
export function detectPaidProCorpusIntakeContamination(args: {
  intakeText: string;
  corpusText: string;
}): PaidProIntakeCorpusFidelityResult {
  const intake = normalizeBlob(args.intakeText);
  const corpus = args.corpusText || "";
  const reasons: string[] = [];
  if (intake.length < 40 || corpus.trim().length < 200) {
    return { contaminated: false, reasons };
  }

  const parties = extractCorpusPartyHints(corpus);
  let absentParties = 0;
  for (const party of parties) {
    const low = party.toLowerCase();
    if (low.length < 5) continue;
    if (!intake.includes(low)) {
      absentParties += 1;
      reasons.push(`corpus_party_absent_from_intake:${party}`);
    }
  }
  if (absentParties >= 2) {
    // Strong enough alone — two named parties from another deal.
    return { contaminated: true, reasons };
  }

  const intakePilotSaas =
    /\b(?:60[-\s]?day|saas|\$15k|\$15,?000|150k|pilot\s+agreement)\b/.test(intake);
  const corpusDesignFreelance =
    /\b(?:mobile app UI|six-week|\$4,?500|Designer will provide product design)\b/i.test(corpus);
  if (intakePilotSaas && corpusDesignFreelance) {
    reasons.push("economics_scope_mismatch:pilot_saas_vs_design_freelance");
  }

  const intakeCounselPrep =
    /\b(?:help me figure out|negotiation plan|what positions|law school memo)\b/.test(intake);
  const corpusHasExecution =
    /\bIN WITNESS WHEREOF\b/i.test(corpus) && /\bCLIENT:\s*/i.test(corpus);
  if (intakeCounselPrep && corpusHasExecution && corpusDesignFreelance) {
    reasons.push("counsel_prep_intake_with_unrelated_executed_design_corpus");
  }

  return {
    contaminated: reasons.length >= 2 || (absentParties >= 1 && reasons.length >= 2),
    reasons,
  };
}
