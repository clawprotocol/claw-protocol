/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildHydratedAuthoritativeSigningCorpusFromAuthority } from "./authoritativeSignerHydration";
import {
  computeCanonicalPartyMetadataFieldCounts,
  establishCanonicalPartyMetadataAtStage,
  readCanonicalPartyMetadata,
  resetCanonicalPartyMetadataDiagnosticsForTests,
} from "./canonicalPartyMetadataAuthority";
import { hydrateCanonicalPartyMetadataAfterCheckoutRestore } from "./paidProCheckoutRestoreMetadataHydrate";
import { persistStarterReviewBeforeCheckout } from "./checkoutBackRestore";
import { applyPaidProNoticeContactAuthority } from "./paidProNoticeContactAuthority";
import { normalizePaidProCopyQuality } from "./paidProCopyQualityNormalize";
import {
  clearConsumedPaidProSignerMetadataAuthority,
  readConsumedPaidProSignerMetadataAuthority,
} from "./paidProSignerMetadataAuthority";
import { resolvePartiesForReviewRender } from "./paidProReviewRenderParties";
import { resolvePaidProSignerDetailsGate } from "./signerSetupPartyIdentity";
import {
  clearPremiumPartyNamesHandoff,
  linearPremiumRecipientSlots,
  readPremiumRecipientHandoff,
  resetPremiumRecipientHandoffDedupForTests,
  writePremiumRecipientHandoffExact,
} from "./premiumPartyNamesHandoff";
import { runPaidProSignerMetadataAuthoritySeed } from "./paidProSignerMetadataSeed";
import {
  TEST479_FOUR_PARTY,
  TEST479_FOUR_PARTY_INTAKE,
  TEST479_FOUR_PARTY_LEGAL_ENTITIES,
  test479Draft,
} from "./paidProTest479Fixtures";

function quadDraft() {
  return {
    ...test479Draft(),
    parties: TEST479_FOUR_PARTY_LEGAL_ENTITIES.map((name, i) => ({
      name,
      role: i === 0 ? "Licensor" : i === 1 ? "Manufacturer" : "party",
    })) as never[],
  };
}

function placeholderCorpus() {
  return [
    "SERVICES AGREEMENT",
    "",
    `Among ${TEST479_FOUR_PARTY.map((p) => p.legalEntity).join(", ")}.`,
    "",
    "1. SERVICES AND SCOPE",
    "Consulting / advisory services",
    "",
    "3. PAYMENT AND CONSIDERATION",
    "Commission",
    "rate:",
    "8% referral commission applies to attributable sourced opportunities.",
    "Trigger:",
    "earned",
    "only on attributable sourced opportunities that close.",
    "",
    "11. GOVERNING LAW",
    "This Agreement is governed by the laws of (Delaware), without regard to its conflict of law rules.",
    "",
    "10. NOTICES",
    "",
    TEST479_FOUR_PARTY.map(
      (p) =>
        `If to ${p.legalEntity}:\nAttention: Authorized Signer\nEmail: provided during signer setup.\nAddress: provided during signer setup.`,
    ).join("\n\n"),
    "",
    "IN WITNESS WHEREOF",
    "",
    ...TEST479_FOUR_PARTY.flatMap((p) => [
      p.legalEntity,
      "By: ______________________________",
      "Name: ______________________________",
      "Title: ______________________________",
      "Date: ______________________________",
      "",
    ]),
  ].join("\n");
}

function assertStageCounts(
  stage: string,
  expected: { signerNameCount: number; emailCount: number; titleCount: number; addressCount: number },
) {
  const counts = computeCanonicalPartyMetadataFieldCounts(readCanonicalPartyMetadata());
  expect(counts.signerNameCount, `${stage} signerNameCount`).toBe(expected.signerNameCount);
  expect(counts.emailCount, `${stage} emailCount`).toBe(expected.emailCount);
  expect(counts.titleCount, `${stage} titleCount`).toBe(expected.titleCount);
  expect(counts.addressCount, `${stage} addressCount`).toBe(expected.addressCount);
  expect(counts.missingFields, `${stage} missingFields`).toEqual([]);
}

describe("TEST480 — live-path four-party metadata + copy quality", () => {
  const storage = new Map<string, string>();

  beforeEach(() => {
    vi.stubGlobal("sessionStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
      clear: () => storage.clear(),
    });
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
      clear: () => storage.clear(),
    });
  });

  afterEach(() => {
    storage.clear();
    clearPremiumPartyNamesHandoff();
    resetPremiumRecipientHandoffDedupForTests();
    resetCanonicalPartyMetadataDiagnosticsForTests();
    clearConsumedPaidProSignerMetadataAuthority();
    vi.unstubAllGlobals();
  });

  it("simulates intake → pro gate → checkout restore → premium → signer setup with 4/4 metadata", () => {
    const intake = TEST479_FOUR_PARTY_INTAKE;
    const draft = quadDraft();

    establishCanonicalPartyMetadataAtStage({
      stage: "created",
      legalEntities: TEST479_FOUR_PARTY_LEGAL_ENTITIES,
      intakeText: intake,
      mutationSource: "structured_intake",
    });
    assertStageCounts("pro-gate", {
      signerNameCount: 4,
      emailCount: 4,
      titleCount: 4,
      addressCount: 4,
    });

    persistStarterReviewBeforeCheckout({ intakeText: intake, draft });
    storage.clear();
    const restored = hydrateCanonicalPartyMetadataAfterCheckoutRestore({ intakeText: intake, draft });
    expect(restored.seed?.uiChanged).toBe(true);
    expect(restored.seed?.contactFieldsChanged).toBe(true);
    assertStageCounts("checkout-restore", {
      signerNameCount: 4,
      emailCount: 4,
      titleCount: 4,
      addressCount: 4,
    });

    establishCanonicalPartyMetadataAtStage({
      stage: "after-premium",
      legalEntities: TEST479_FOUR_PARTY_LEGAL_ENTITIES,
      intakeText: intake,
      mutationSource: "structured_intake",
    });
    writePremiumRecipientHandoffExact(
      { name: TEST479_FOUR_PARTY[0]!.legalEntity, email: "", role: "party" },
      { name: TEST479_FOUR_PARTY[1]!.legalEntity, email: "", role: "party" },
      TEST479_FOUR_PARTY.slice(2).map((p) => ({ name: p.legalEntity, email: "", role: "party" })),
      4,
    );
    const seed = runPaidProSignerMetadataAuthoritySeed({
      stage: "test480_signer_setup",
      legalEntities: TEST479_FOUR_PARTY_LEGAL_ENTITIES,
      intakeText: intake,
      draft,
      uiSignerNames: ["", "", "", ""],
      uiSignerTitles: ["", "", "", ""],
      uiSignerEmails: ["", "", "", ""],
      uiPartyAddresses: ["", "", "", ""],
      authoritativePartyCount: 4,
    });
    assertStageCounts("after-premium", {
      signerNameCount: 4,
      emailCount: 4,
      titleCount: 4,
      addressCount: 4,
    });

    expect(seed.names).toEqual(TEST479_FOUR_PARTY.map((p) => p.signerName));
    expect(seed.emails).toEqual(TEST479_FOUR_PARTY.map((p) => p.email));
    expect(seed.titles).toEqual(TEST479_FOUR_PARTY.map((p) => p.signerTitle));
    expect(seed.addresses.every(Boolean)).toBe(true);

    const gate = resolvePaidProSignerDetailsGate({
      partyCount: 4,
      intakeText: intake,
      draftPartyNames: TEST479_FOUR_PARTY_LEGAL_ENTITIES,
      partySignerNames: seed.names,
      recipient1Name: TEST479_FOUR_PARTY[0]!.legalEntity,
      recipient2Name: TEST479_FOUR_PARTY[1]!.legalEntity,
      recipient1Email: seed.emails[0] ?? "",
      recipient2Email: seed.emails[1] ?? "",
      extraPartyReviewEmails: seed.emails.slice(2),
      extraPartyLegalNames: TEST479_FOUR_PARTY_LEGAL_ENTITIES.slice(2),
    });
    expect(gate.complete).toBe(true);

    const parties = resolvePartiesForReviewRender({ draft, intakeText: intake });
    expect(parties.filter((p) => p.signerName.trim()).length).toBe(4);
    expect(parties.filter((p) => p.signerEmail.trim()).length).toBe(4);

    const noticeHydrated = applyPaidProNoticeContactAuthority(placeholderCorpus(), {
      draft,
      intakeText: intake,
    }).text;
    for (const party of TEST479_FOUR_PARTY) {
      expect(noticeHydrated).toContain(party.signerName);
      expect(noticeHydrated).toContain(party.email);
      expect(noticeHydrated).not.toMatch(/provided during signer setup/i);
    }

    const authority = readConsumedPaidProSignerMetadataAuthority();
    const executionHydrated = buildHydratedAuthoritativeSigningCorpusFromAuthority({
      rawCorpus: placeholderCorpus(),
      authority: authority!,
      intakeRaw: intake,
      surface: "test480_execution",
      signatureRegionOnly: true,
      repairRecital: false,
    }).corpus;
    for (const party of TEST479_FOUR_PARTY) {
      expect(executionHydrated).toContain(`Name: ${party.signerName}`);
      expect(executionHydrated).toContain(`Title: ${party.signerTitle}`);
    }

    const handoff = readPremiumRecipientHandoff();
    const slots = linearPremiumRecipientSlots(handoff, 4);
    expect(slots.filter((s) => s.signerName?.trim()).length).toBe(4);
  });

  it("repairs malformed premium copy fragments", () => {
    const raw = placeholderCorpus();
    const normalized = normalizePaidProCopyQuality(raw).text;
    expect(normalized).not.toMatch(/\blaws of \(Delaware\)/i);
    expect(normalized).toMatch(/\blaws of Delaware\b/i);
    expect(normalized).not.toMatch(/^\s*Commission\s*$/m);
    expect(normalized).not.toMatch(/^\s*rate:\s*$/m);
    expect(normalized).not.toMatch(/^\s*Trigger:\s*$/m);
    expect(normalized).not.toMatch(/^\nCONFIDENTIALITY\n/m);
  });
});
