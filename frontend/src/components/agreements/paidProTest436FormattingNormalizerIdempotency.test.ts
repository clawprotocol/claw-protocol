/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getOrInitSessionAgreementGenerationId } from "../../lib/agreementGenerationId";
import { preparePaidProServerDocumentForAcceptance } from "./paidProConciseServicesQuality";
import {
  markCurrentSessionProEntitlementComplete,
  markCurrentSessionProIntent,
} from "./paidProSessionEligibility";
import { normalizeNoticeStanzaLines } from "./paidProPartyNoticeDetails";
import {
  collapseDuplicatedLegalEntityPhrase,
  collapseDuplicatedIfToHeaderLines,
  collapseStandaloneDuplicatedEntityLines,
  collapseDuplicateNoticeEntityLines,
} from "./paidProPartyNamePreserve";
import { repairSplitPaidProHeadingFragments } from "./repairSplitPaidProHeadingFragments";
import { applyPaidProSectionHeadingTitleAuthority } from "./paidProSectionHeadingTitleAuthority";
import { resolvePaidProFreezeCommitText } from "./paidProFreezeCandidate";
import { latchAcceptedServerFullDraftAuthority } from "./premiumAcceptancePolicy";
import { hasPaidProPipelineValidationForCorpus } from "./paidProPostAcceptanceValidatorCache";
import { resetPaidProPipelineTestIsolation } from "./paidProPipelineTestIsolation";
import { TEST429_FOUR_PARTY_NORTH_STAR_INTAKE } from "./paidProTest429FourPartyNorthStarFixtures";
import {
  buildTest435NorthStarMalformedServerCorpus,
  test435NorthStarDraft,
} from "./paidProTest435NorthStarFormattingFixtures";
import {
  buildTest436MalformedNorthStarNoticeStanza,
  buildTest436MalformedSummitRidgeNoticeStanza,
  TEST436_DUPLICATED_ENTITY_LINE,
  TEST436_DUPLICATED_IF_TO_HEADER,
  TEST436_NORTH_STAR_PARTIES,
  TEST436_SPLIT_HEADING_FRAGMENTS_AUTHORITY,
  TEST436_SPLIT_HEADING_FRAGMENTS_REPAIR_SPLIT,
} from "./paidProTest436FormattingIdempotencyFixtures";

function assertIdempotent(fn: (input: string) => string, input: string): string {
  const once = fn(input);
  const twice = fn(once);
  expect(twice).toBe(once);
  return once;
}

describe("TEST436 — notice normalization idempotency", () => {
  it("normalizeNoticeStanzaLines is idempotent on malformed North Star notice stanza", () => {
    const input = buildTest436MalformedNorthStarNoticeStanza();
    const once = normalizeNoticeStanzaLines(input, TEST436_NORTH_STAR_PARTIES);
    const twice = normalizeNoticeStanzaLines(once, TEST436_NORTH_STAR_PARTIES);
    expect(twice).toBe(once);
    expect(once).toContain("If to North Star Manufacturing LLC:");
    expect(once).toMatch(/^North Star Manufacturing LLC$/m);
    expect(once).not.toMatch(/North Star Manufacturing LLC\s+North Star Manufacturing LLC/i);
    expect(once.split("\n").length).toBe(input.split("\n").length);
  });

  it("normalizeNoticeStanzaLines is idempotent on malformed Summit Ridge notice stanza", () => {
    const input = buildTest436MalformedSummitRidgeNoticeStanza();
    assertIdempotent((t) => normalizeNoticeStanzaLines(t, TEST436_NORTH_STAR_PARTIES), input);
  });
});

describe("TEST436 — party-name collapse idempotency", () => {
  const parties = TEST436_NORTH_STAR_PARTIES;

  it("collapseDuplicatedLegalEntityPhrase is idempotent on duplicated header phrase", () => {
    const input = TEST436_DUPLICATED_IF_TO_HEADER.replace(/^If to\s+/i, "").replace(/\s*:\s*$/, "").trim();
    const once = collapseDuplicatedLegalEntityPhrase(input, parties);
    expect(once).toBe("North Star Manufacturing LLC");
    expect(collapseDuplicatedLegalEntityPhrase(once, parties)).toBe(once);
  });

  it("collapseDuplicatedLegalEntityPhrase is idempotent on duplicated entity line", () => {
    const once = collapseDuplicatedLegalEntityPhrase(TEST436_DUPLICATED_ENTITY_LINE, parties);
    expect(once).toBe("North Star Manufacturing LLC");
    expect(collapseDuplicatedLegalEntityPhrase(once, parties)).toBe(once);
  });

  it("collapseDuplicatedIfToHeaderLines is idempotent", () => {
    const input = [
      TEST436_DUPLICATED_IF_TO_HEADER,
      TEST436_DUPLICATED_ENTITY_LINE,
      "Attn: Authorized Signer",
    ].join("\n");
    const once = collapseDuplicatedIfToHeaderLines(input, parties);
    expect(once).toMatch(/^If to North Star Manufacturing LLC:/m);
    assertIdempotent((t) => collapseDuplicatedIfToHeaderLines(t, parties), once);
  });

  it("collapseStandaloneDuplicatedEntityLines is idempotent", () => {
    const input = [
      "If to North Star Manufacturing LLC:",
      TEST436_DUPLICATED_ENTITY_LINE,
      "Attn: Authorized Signer",
    ].join("\n");
    const once = collapseStandaloneDuplicatedEntityLines(input, parties);
    expect(once).toMatch(/^North Star Manufacturing LLC$/m);
    assertIdempotent((t) => collapseStandaloneDuplicatedEntityLines(t, parties), once);
  });

  it("collapseDuplicateNoticeEntityLines is idempotent on malformed notice block", () => {
    const input = buildTest436MalformedNorthStarNoticeStanza();
    const once = collapseDuplicateNoticeEntityLines(input, parties);
    expect(once).not.toMatch(/North Star Manufacturing LLC\s+North Star Manufacturing LLC/i);
    assertIdempotent((t) => collapseDuplicateNoticeEntityLines(t, parties), once);
  });
});

describe("TEST436 — heading normalization idempotency", () => {
  for (const fragment of TEST436_SPLIT_HEADING_FRAGMENTS_REPAIR_SPLIT) {
    it(`repairSplitPaidProHeadingFragments is idempotent for ${fragment.label}`, () => {
      const once = repairSplitPaidProHeadingFragments(fragment.input);
      expect(once.text).toMatch(fragment.merged);
      const twice = repairSplitPaidProHeadingFragments(once.text);
      expect(twice.text).toBe(once.text);
      expect(twice.repairs).toHaveLength(0);
    });
  }

  for (const fragment of TEST436_SPLIT_HEADING_FRAGMENTS_AUTHORITY) {
    it(`applyPaidProSectionHeadingTitleAuthority is idempotent for ${fragment.label}`, () => {
      const once = applyPaidProSectionHeadingTitleAuthority(fragment.input);
      const twice = applyPaidProSectionHeadingTitleAuthority(once.text);
      expect(twice.text).toBe(once.text);
      expect(twice.repairs).toHaveLength(0);
    });
  }

  it("applyPaidProSectionHeadingTitleAuthority is idempotent on combined split fragments", () => {
    const input = [
      ...TEST436_SPLIT_HEADING_FRAGMENTS_REPAIR_SPLIT,
      ...TEST436_SPLIT_HEADING_FRAGMENTS_AUTHORITY,
    ]
      .map((f) => f.input)
      .join("\n\n");
    const once = applyPaidProSectionHeadingTitleAuthority(input);
    const twice = applyPaidProSectionHeadingTitleAuthority(once.text);
    expect(twice.text).toBe(once.text);
    expect(twice.repairs).toHaveLength(0);
  });
});

describe("TEST436 — freeze-path idempotency", () => {
  const storage = new Map<string, string>();

  beforeEach(() => {
    resetPaidProPipelineTestIsolation();
    vi.stubGlobal("sessionStorage", {
      getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => storage.set(k, v),
      removeItem: (k: string) => storage.delete(k),
    });
    markCurrentSessionProIntent();
    markCurrentSessionProEntitlementComplete();
    getOrInitSessionAgreementGenerationId();
  });

  afterEach(() => {
    resetPaidProPipelineTestIsolation();
    storage.clear();
    vi.unstubAllGlobals();
  });

  function runFreezePath(input: string, latchInput = false): string {
    if (latchInput) latchAcceptedServerFullDraftAuthority(input, "server_full_draft");
    const prepared = preparePaidProServerDocumentForAcceptance(
      input,
      test435NorthStarDraft(),
      TEST429_FOUR_PARTY_NORTH_STAR_INTAKE,
      { surface: "test436_freeze" },
    );
    const freeze = resolvePaidProFreezeCommitText({
      text: prepared.text,
      draft: test435NorthStarDraft(),
      intakeText: TEST429_FOUR_PARTY_NORTH_STAR_INTAKE,
      source: "server_full_draft",
      surface: "test436_freeze",
    });
    expect(freeze.ok, freeze.rejectReason ?? "freeze_failed").toBe(true);
    return freeze.text;
  }

  it("resolvePaidProFreezeCommitText is idempotent on malformed TEST435 corpus", () => {
    const server = buildTest435NorthStarMalformedServerCorpus();
    const freeze1 = runFreezePath(server, true);
    expect(
      hasPaidProPipelineValidationForCorpus({ text: freeze1, source: "server_full_draft" }),
    ).toBe(true);
    const freeze2 = runFreezePath(freeze1, false);
    expect(freeze2).toBe(freeze1);
    expect(freeze1.length).toBeGreaterThan(18_000);
  });
});
