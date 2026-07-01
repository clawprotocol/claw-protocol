/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildHydratedAuthoritativeSigningCorpusFromAuthority } from "./authoritativeSignerHydration";
import {
  computeCanonicalPartyMetadataFieldCounts,
  establishCanonicalPartyMetadataAtStage,
  mutateCanonicalPartyMetadata,
  readCanonicalPartyMetadata,
  resetCanonicalPartyMetadataDiagnosticsForTests,
} from "./canonicalPartyMetadataAuthority";
import {
  alignIntakeSignerMetadataToLegalEntities,
  extractCanonicalIntakeSignerMetadata,
} from "./intakeSignerMetadataAuthority";
import { parseAllStructuredPartyContactBlocks } from "./labeledPartyBlockParse";
import { applyPaidProNoticeContactAuthority } from "./paidProNoticeContactAuthority";
import { extractIntakeContacts } from "./paidProIntakeContactSubstitution";
import {
  clearConsumedPaidProSignerMetadataAuthority,
  readConsumedPaidProSignerMetadataAuthority,
} from "./paidProSignerMetadataAuthority";
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
  PARTY_METADATA_LABEL_VALUES,
  TEST482_FOUR_PARTY,
  TEST482_FOUR_PARTY_INTAKE,
  TEST482_FOUR_PARTY_LEGAL_ENTITIES,
  test482Draft,
} from "./paidProTest482Fixtures";

function assertNoLabelContamination(values: readonly string[]) {
  for (const value of values) {
    for (const label of PARTY_METADATA_LABEL_VALUES) {
      expect(value.trim()).not.toBe(label);
    }
  }
}

describe("TEST482 — stacked Represented by / title / address field contamination", () => {
  const storage = new Map<string, string>();

  beforeEach(() => {
    vi.stubGlobal("sessionStorage", {
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

  it("parses stacked party blocks without label contamination", () => {
    const blocks = parseAllStructuredPartyContactBlocks(TEST482_FOUR_PARTY_INTAKE);
    expect(blocks).toHaveLength(4);
    for (let i = 0; i < TEST482_FOUR_PARTY.length; i += 1) {
      const expected = TEST482_FOUR_PARTY[i]!;
      const block = blocks[i]!;
      expect(block.legalEntity).toBe(expected.legalEntity);
      expect(block.signerName).toBe(expected.signerName);
      expect(block.signerTitle).toBe(expected.signerTitle);
      expect(block.signerEmail).toBe(expected.email);
      expect(block.address).toContain(expected.address.split(",")[0]!.trim());
      expect(block.address).toContain(expected.address.split(",").slice(-1)[0]!.trim());
      assertNoLabelContamination([block.signerName, block.signerTitle, block.address]);
    }

    const contacts = extractIntakeContacts(TEST482_FOUR_PARTY_INTAKE);
    expect(contacts.every((c) => c.name !== "Email:")).toBe(true);
    expect(contacts.filter((c) => c.email.trim()).length).toBe(4);
  });

  it("canonical metadata, handoff, signer setup, notices, and execution hydrate 4/4 fields", () => {
    const intake = TEST482_FOUR_PARTY_INTAKE;
    const legalEntities = TEST482_FOUR_PARTY_LEGAL_ENTITIES;
    const draft = {
      ...test482Draft(),
      parties: legalEntities.map((name, i) => ({
        name,
        role: i === 0 ? "Licensor" : "party",
      })) as never[],
    };

    establishCanonicalPartyMetadataAtStage({
      stage: "created",
      legalEntities,
      intakeText: intake,
      mutationSource: "structured_intake",
    });

    let counts = computeCanonicalPartyMetadataFieldCounts(readCanonicalPartyMetadata());
    expect(counts.signerNameCount).toBe(4);
    expect(counts.titleCount).toBe(4);
    expect(counts.emailCount).toBe(4);
    expect(counts.addressCount).toBe(4);

    writePremiumRecipientHandoffExact(
      { name: legalEntities[0]!, email: "", role: "party" },
      { name: legalEntities[1]!, email: "", role: "party" },
      legalEntities.slice(2).map((name) => ({ name, email: "", role: "party" })),
      4,
    );

    const seed = runPaidProSignerMetadataAuthoritySeed({
      stage: "test482_signer_setup",
      legalEntities,
      intakeText: intake,
      draft,
      uiSignerNames: ["", "", "", ""],
      uiSignerTitles: ["", "", "", ""],
      uiSignerEmails: TEST482_FOUR_PARTY.map((p) => p.email),
      uiPartyAddresses: ["", "", "", ""],
      authoritativePartyCount: 4,
    });

    for (let i = 0; i < TEST482_FOUR_PARTY.length; i += 1) {
      const expected = TEST482_FOUR_PARTY[i]!;
      expect(seed.names[i]).toBe(expected.signerName);
      expect(seed.titles[i]).toBe(expected.signerTitle);
      expect(seed.emails[i]).toBe(expected.email);
      expect(seed.addresses[i]).toContain(expected.address.split(",")[0]!.trim());
      assertNoLabelContamination([seed.names[i]!, seed.titles[i]!, seed.addresses[i]!]);
    }

    counts = computeCanonicalPartyMetadataFieldCounts(readCanonicalPartyMetadata());
    expect(counts.signerNameCount).toBe(4);
    expect(counts.titleCount).toBe(4);
    expect(counts.emailCount).toBe(4);
    expect(counts.addressCount).toBe(4);

    const canonical = readCanonicalPartyMetadata()!;
    for (const party of canonical.parties) {
      assertNoLabelContamination([
        party.signerName,
        party.signerTitle,
        party.partyAddress,
      ]);
    }

    const handoff = readPremiumRecipientHandoff();
    const slots = linearPremiumRecipientSlots(handoff, 4);
    expect(slots.filter((s) => s.signerName?.trim()).length).toBe(4);
    expect(slots.filter((s) => s.signerTitle?.trim()).length).toBe(4);
    expect(slots.filter((s) => s.email?.trim()).length).toBe(4);
    expect(slots.every((s) => s.signerName !== "Email:")).toBe(true);

    const consumed = readConsumedPaidProSignerMetadataAuthority();
    expect(consumed?.parties.filter((p) => p.signerName.trim()).length).toBe(4);
    expect(consumed?.parties.filter((p) => p.signerTitle.trim()).length).toBe(4);

    const gate = resolvePaidProSignerDetailsGate({
      partyCount: 4,
      intakeText: intake,
      draftPartyNames: legalEntities,
      partySignerNames: seed.names,
      recipient1Name: legalEntities[0]!,
      recipient2Name: legalEntities[1]!,
      recipient1Email: seed.emails[0] ?? "",
      recipient2Email: seed.emails[1] ?? "",
      extraPartyReviewEmails: seed.emails.slice(2),
      extraPartyLegalNames: legalEntities.slice(2),
    });
    expect(gate.complete).toBe(true);

    const noticeCorpus = [
      "10. NOTICES",
      "",
      TEST482_FOUR_PARTY.map(
        (p) =>
          `If to ${p.legalEntity}:\nAttention: Authorized Signer\nEmail: provided during signer setup.\nAddress: provided during signer setup.`,
      ).join("\n\n"),
    ].join("\n");
    const noticeHydrated = applyPaidProNoticeContactAuthority(noticeCorpus, {
      draft,
      intakeText: intake,
    }).text;
    for (const party of TEST482_FOUR_PARTY) {
      expect(noticeHydrated).toContain(party.signerName);
      expect(noticeHydrated).toContain(party.email);
      expect(noticeHydrated).toContain(party.address.split(",")[0]!.trim());
      expect(noticeHydrated).not.toMatch(/provided during signer setup/i);
    }

    const executionCorpus = [
      "IN WITNESS WHEREOF",
      "",
      ...TEST482_FOUR_PARTY.flatMap((p) => [
        p.legalEntity,
        "By: ______________________________",
        "Name: ______________________________",
        "Title: ______________________________",
        "",
      ]),
    ].join("\n");
    const executionHydrated = buildHydratedAuthoritativeSigningCorpusFromAuthority({
      rawCorpus: executionCorpus,
      authority: consumed!,
      intakeRaw: intake,
      surface: "test482_execution",
      signatureRegionOnly: true,
      repairRecital: false,
    }).corpus;
    for (const party of TEST482_FOUR_PARTY) {
      expect(executionHydrated).toContain(`Name: ${party.signerName}`);
      expect(executionHydrated).toContain(`Title: ${party.signerTitle}`);
    }
  });

  it("preserves manual signer edits and never overwrites populated canonical fields with blanks", () => {
    const intake = TEST482_FOUR_PARTY_INTAKE;
    const legalEntities = TEST482_FOUR_PARTY_LEGAL_ENTITIES;
    const manualName = "Custom Signer Override";

    runPaidProSignerMetadataAuthoritySeed({
      stage: "test482_manual_seed",
      legalEntities,
      intakeText: intake,
      uiSignerNames: [manualName, "", "", ""],
      uiSignerTitles: ["", "", "", ""],
      uiSignerEmails: TEST482_FOUR_PARTY.map((p) => p.email),
      authoritativePartyCount: 4,
    });

    mutateCanonicalPartyMetadata({
      stage: "review",
      legalEntities,
      intakeText: intake,
      uiParties: legalEntities.map((entity, i) => ({
        partyIndex: i,
        partyLegalName: entity,
        signerName: i === 0 ? "" : "",
        signerTitle: "",
        signerEmail: TEST482_FOUR_PARTY[i]!.email,
        partyAddress: "",
      })),
      mutationSource: "structured_intake",
    });

    const bundle = readCanonicalPartyMetadata()!;
    expect(bundle.parties[0]!.signerName).toBe(manualName);
    expect(bundle.parties[0]!.signerEmail).toBe(TEST482_FOUR_PARTY[0]!.email);
    expect(bundle.parties[1]!.signerName).toBe(TEST482_FOUR_PARTY[1]!.signerName);

    const aligned = alignIntakeSignerMetadataToLegalEntities(intake, legalEntities);
    expect(aligned[0]!.signerName).toBe(TEST482_FOUR_PARTY[0]!.signerName);
    expect(extractCanonicalIntakeSignerMetadata(intake).every((r) => r.signerName !== "Email:")).toBe(
      true,
    );
  });
});
