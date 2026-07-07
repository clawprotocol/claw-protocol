/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from "vitest";
import {
  buildAcceptedProCorpusSafeDisplayCacheKey,
  clearAcceptedProCorpusSafeDisplayCache,
  clearAcceptedProCorpusSafeDisplayCacheForTests,
  evictAcceptedProCorpusSafeDisplayCacheEntry,
  paidProSafeDisplayCacheBuildId,
  readAcceptedProCorpusSafeDisplayCache,
  readAcceptedProCorpusSafeDisplayCacheSizeForTests,
  writeAcceptedProCorpusSafeDisplayCache,
  PAID_PRO_SAFE_DISPLAY_CACHE_SCHEMA_VERSION,
} from "./paidProAcceptedCorpusSafeDisplayCache";
import { clearPartialPaidProAuthoritativeState } from "./paidProFreezeCandidate";
import { validateNoticesClauseFamilyStructuralIntegrity } from "./clauseFamilyStructuralIntegrity";
import {
  setConsumedPaidProSignerMetadataAuthority,
  clearConsumedPaidProSignerMetadataAuthority,
  type PaidProSignerMetadataParty,
} from "./paidProSignerMetadataAuthority";

/**
 * TEST541 — the blank-review loop is no longer a party-count/identity bug. Counts read 4/4/4 yet
 * validation rejects with `excess_party_notice_stanzas`. Root cause: the paid Pro safe-display memo
 * (`applyAcceptedProCorpusSafeDisplay`) keyed only on corpus/intake/draft/surface. It ignored:
 *   (a) a build/schema version — so a long-lived tab could replay bytes produced by older code, and
 *   (b) the MUTABLE authority state the transform actually reads (frozen canonical manifest +
 *       consumed signer-metadata authority) — so a corpus repaired under a contaminated authority
 *       state (an extra "If to" stanza) was replayed verbatim after the authority was corrected.
 * The rejected candidate was also never evicted, so retry replayed the same failed corpus.
 */

const FOUR = [
  "Redwood Biologics Inc",
  "Summit AI Consulting LLC",
  "Blue Harbor Systems LLC",
  "Iron Gate Security LLC",
];

const INTAKE = "Create a services agreement between Redwood Biologics Inc, Summit AI Consulting LLC, Blue Harbor Systems LLC, and Iron Gate Security LLC.";

function reviewParties(names: readonly string[]): PaidProSignerMetadataParty[] {
  return names.map((name, i) => ({
    partyIndex: i,
    partyLegalName: name,
    signerEmail: "",
    signerName: "",
    signerTitle: "",
    partyAddress: "",
  }));
}

function noticesCorpus(names: readonly string[]): string {
  const stanza = (name: string, i: number) =>
    [`If to ${name}:`, name, `${100 + i} Main Street, Wilmington, DE 19801`, `Email: contact${i}@example.com`].join("\n");
  return [
    "PROFESSIONAL SERVICES AGREEMENT",
    "",
    "10. NOTICES",
    "All notices under this Agreement shall be in writing and delivered to the following:",
    "",
    ...names.flatMap((n, i) => [stanza(n, i), ""]),
    "IN WITNESS WHEREOF, the parties have executed this Agreement.",
  ].join("\n");
}

describe("TEST541 — safe-display cache lineage & stale-corpus replay", () => {
  afterEach(() => {
    clearAcceptedProCorpusSafeDisplayCacheForTests();
    clearConsumedPaidProSignerMetadataAuthority();
  });

  // 1. The recovery/safe-display cache key carries a version + build discriminator.
  it("1. cache key includes a schema version and build discriminator", () => {
    const key = buildAcceptedProCorpusSafeDisplayCacheKey("some corpus body text here", {
      intakeText: INTAKE,
      surface: "validatePaidProOutput",
    });
    expect(key).toContain(`${PAID_PRO_SAFE_DISPLAY_CACHE_SCHEMA_VERSION}:`);
    expect(key).toContain(paidProSafeDisplayCacheBuildId());
    expect(key.startsWith(`${PAID_PRO_SAFE_DISPLAY_CACHE_SCHEMA_VERSION}:`)).toBe(true);
  });

  // 2. The key changes when the mutable authority state changes (same corpus/intake/opts).
  it("2. cache key changes when authority state changes (frozen/consumed authority)", () => {
    const corpus = "same corpus body text used for both keys";
    const opts = { intakeText: INTAKE, surface: "validatePaidProOutput" };
    const before = buildAcceptedProCorpusSafeDisplayCacheKey(corpus, opts);
    setConsumedPaidProSignerMetadataAuthority({
      parties: reviewParties(FOUR),
      source: "authoritative_snapshot",
      hash: "test541",
      updatedAt: Date.now(),
    } as never);
    const after = buildAcceptedProCorpusSafeDisplayCacheKey(corpus, opts);
    expect(after).not.toBe(before);
  });

  // 3. A new generation with the same intake cannot reuse a stale failed safe-display corpus once
  //    the authority state differs — the old key no longer resolves.
  it("3. stale failed corpus is not reused after authority correction", () => {
    const corpus = "server full draft corpus with excess stanzas";
    const opts = { intakeText: INTAKE, surface: "validatePaidProOutput" };

    // First attempt cached under a CONTAMINATED authority state (5 slots).
    setConsumedPaidProSignerMetadataAuthority({
      parties: reviewParties([...FOUR, "Party 5"]),
      source: "authoritative_snapshot",
      hash: "test541-bad",
      updatedAt: Date.now(),
    } as never);
    const staleKey = buildAcceptedProCorpusSafeDisplayCacheKey(corpus, opts);
    writeAcceptedProCorpusSafeDisplayCache(staleKey, { text: "STALE_5_STANZA_BYTES", repairs: [] });

    // Authority corrected to the real 4-party manifest.
    setConsumedPaidProSignerMetadataAuthority({
      parties: reviewParties(FOUR),
      source: "authoritative_snapshot",
      hash: "test541-good",
      updatedAt: Date.now(),
    } as never);
    const freshKey = buildAcceptedProCorpusSafeDisplayCacheKey(corpus, opts);

    expect(freshKey).not.toBe(staleKey);
    expect(readAcceptedProCorpusSafeDisplayCache(freshKey)).toBeNull();
  });

  // 4a. Retry path (clearPartialPaidProAuthoritativeState) evicts the memo so retry recomputes.
  it("4a. retry/clear path clears the safe-display memo", () => {
    const key = buildAcceptedProCorpusSafeDisplayCacheKey("failed candidate bytes", {
      intakeText: INTAKE,
      surface: "validatePaidProOutput",
    });
    writeAcceptedProCorpusSafeDisplayCache(key, { text: "FAILED_BYTES", repairs: [] });
    expect(readAcceptedProCorpusSafeDisplayCacheSizeForTests()).toBeGreaterThan(0);
    clearPartialPaidProAuthoritativeState();
    expect(readAcceptedProCorpusSafeDisplayCacheSizeForTests()).toBe(0);
  });

  // 4b. Explicit clear + single-entry eviction APIs.
  it("4b. clear + eviction remove rejected candidate bytes", () => {
    const opts = { intakeText: INTAKE, surface: "validatePaidProOutput_recovery" };
    const key = buildAcceptedProCorpusSafeDisplayCacheKey("rejected recovery bytes", opts);
    writeAcceptedProCorpusSafeDisplayCache(key, { text: "REJECTED", repairs: [] });
    expect(evictAcceptedProCorpusSafeDisplayCacheEntry("rejected recovery bytes", opts)).toBe(true);
    expect(readAcceptedProCorpusSafeDisplayCache(key)).toBeNull();

    writeAcceptedProCorpusSafeDisplayCache(key, { text: "REJECTED2", repairs: [] });
    clearAcceptedProCorpusSafeDisplayCache();
    expect(readAcceptedProCorpusSafeDisplayCacheSizeForTests()).toBe(0);
  });

  // 5. Evidence (task 6): show the exact excess stanza headings — not counts only. A 5-stanza corpus
  //    validated against a 4-party authority fires excess_party_notice_stanzas; a 4-stanza corpus
  //    (what a correct recompute produces) does not.
  it("5. excess_party_notice_stanzas fires on a 5-stanza corpus and names the excess heading", () => {
    const fivePartyCorpus = noticesCorpus([...FOUR, "Phantom Holdings LLC"]);
    const headings = (fivePartyCorpus.match(/^If to .+:$/gim) ?? []).map((h) => h.trim());
    expect(headings).toEqual([
      "If to Redwood Biologics Inc:",
      "If to Summit AI Consulting LLC:",
      "If to Blue Harbor Systems LLC:",
      "If to Iron Gate Security LLC:",
      "If to Phantom Holdings LLC:",
    ]);

    const excessViolations = validateNoticesClauseFamilyStructuralIntegrity(fivePartyCorpus, {
      parties: reviewParties(FOUR),
      surface: "validatePaidProOutput_recovery_freeze_finalize",
      phase: "post_acceptance",
    });
    expect(excessViolations.map((v) => v.code)).toContain("excess_party_notice_stanzas");

    // The correctly recomputed 4-stanza corpus passes (no missing/excess).
    const fourPartyCorpus = noticesCorpus(FOUR);
    const okViolations = validateNoticesClauseFamilyStructuralIntegrity(fourPartyCorpus, {
      parties: reviewParties(FOUR),
      surface: "validatePaidProOutput_recovery_freeze_finalize",
      phase: "post_acceptance",
    });
    expect(okViolations.map((v) => v.code)).not.toContain("excess_party_notice_stanzas");
    expect(okViolations.map((v) => v.code)).not.toContain("missing_party_notice_stanzas");
  });
});
