/**
 * Recipient review and send-for-review must keep the bound Apply/pending snapshot
 * when a later guided display corpus shrinks it or drops confirmed facts.
 * Display-only execution Name fill is allowed; notice Attn is not inferred here.
 */

import { fillBlankPreservedAddedPartySignerNames } from "../components/agreements/paidProDeclaredConsultantClientPaper";
import { shouldRejectSignerIdentityCorpusShrink } from "../components/agreements/guidedDealCompletion/signerPartyIdentity";

export function displayCorpusDropsBoundCommercialFacts(bound: string, display: string): boolean {
  const applied = (bound || "").trim();
  const shown = (display || "").trim();
  if (applied.length < 80) return false;
  if (shown.length < 80) return true;
  if (/\(\s*["']Advisor["']\s*\)/i.test(applied) && !/\(\s*["']Advisor["']\s*\)/i.test(shown)) {
    return true;
  }
  const law = applied.match(
    /\b(?:Delaware|Oklahoma|Massachusetts|Texas|California|New York|Florida|Illinois)\b/i,
  );
  if (law && !shown.toLowerCase().includes(law[0].toLowerCase())) {
    return true;
  }
  return false;
}

export function preferBoundReviewRevisionOverDisplayCorpus(args: {
  boundRevisionPlain?: string | null;
  displayCorpus?: string | null;
}): string {
  const bound = (args.boundRevisionPlain || "").trim();
  const display = (args.displayCorpus || "").trim();
  if (bound.length >= 500 && shouldRejectSignerIdentityCorpusShrink(bound.length, display.length || 0)) {
    return bound;
  }
  if (bound.length >= 500 && displayCorpusDropsBoundCommercialFacts(bound, display)) {
    return bound;
  }
  if (display.length >= 80) return display;
  return bound;
}

export function resolveRecipientVisibleReviewPlain(args: {
  boundRevisionPlain?: string | null;
  displayCorpus?: string | null;
  parties?: readonly { name?: string | null; signerName?: string | null; signer_name?: string | null }[];
}): string {
  const preferred = preferBoundReviewRevisionOverDisplayCorpus({
    boundRevisionPlain: args.boundRevisionPlain,
    displayCorpus: args.displayCorpus,
  });
  if (!preferred) return "";
  return fillBlankPreservedAddedPartySignerNames(
    preferred,
    (args.parties ?? []).map((party) => ({
      name: String(party.name || ""),
      signerName: String(party.signerName || party.signer_name || ""),
    })),
  );
}
