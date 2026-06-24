import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { buildDeterministicQuadPartyMutualServicesProFallback } from "./deterministicQuadPartyProFallback";
import {
  TEST420_BLUE,
  TEST420_HARBOR,
  TEST420_IRON,
  TEST420_PRODUCTION_INTAKE,
  TEST420_RED,
  test420Draft,
} from "./paidProTest420Fixtures";

export const TEST422_PARTY_NAMES = [TEST420_RED, TEST420_BLUE, TEST420_HARBOR, TEST420_IRON] as const;
export const TEST422_SIGNER_NAMES = ["Joe Doe", "Mary Jay", "Hen Park", "Ira Vale"] as const;
export const TEST422_SIGNER_TITLES = ["CEO", "COO", "CFO", "CTO"] as const;

export const TEST422_PRODUCTION_INTAKE = TEST420_PRODUCTION_INTAKE;

export function test422Draft(): ParsedDraftShape {
  return test420Draft();
}

/** Corpus with production-class contamination patterns observed in live TEST421 follow-up. */
export function buildTest422CorruptedCorpus(): string {
  const fallback = buildDeterministicQuadPartyMutualServicesProFallback({
    rawIntake: TEST422_PRODUCTION_INTAKE,
    draft: test422Draft(),
  });
  if (!fallback.ok) return "";
  const witnessIdx = fallback.body.search(/\nIN WITNESS WHEREOF/i);
  const head = witnessIdx >= 0 ? fallback.body.slice(0, witnessIdx).trimEnd() : fallback.body.trimEnd();
  const tail = witnessIdx >= 0 ? fallback.body.slice(witnessIdx) : "";
  const injection = [
    "",
    "RED MESA BLUE CANYON HARBOR IRON",
    "",
    "Joe Doe is an independent contractor and not an employee of any Party.",
    "",
    "If to Red Mesa Logistics LLC:",
    "Red Mesa Logistics LLC",
    "Attn: Joe Doe, CEO",
    "Email: joe.redmesa@example.com",
    "",
  ].join("\n");
  return tail ? `${head}${injection}\n\n${tail}` : `${head}${injection}`;
}

export function buildTest422CleanRecoveryCorpus(): string {
  const fallback = buildDeterministicQuadPartyMutualServicesProFallback({
    rawIntake: TEST422_PRODUCTION_INTAKE,
    draft: test422Draft(),
  });
  return fallback.ok ? fallback.body : "";
}
