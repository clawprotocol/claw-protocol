/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getOrInitSessionAgreementGenerationId } from "../../lib/agreementGenerationId";
import {
  clearPaidProSourceOfTruth,
  hydratePaidProSourceOfTruth,
  hasPaidProSourceOfTruth,
} from "./paidProSourceOfTruth";
import {
  clearCurrentSessionProEntitlementMarkers,
  markCurrentSessionProEntitlementComplete,
  markCurrentSessionProIntent,
} from "./paidProSessionEligibility";
import { markPaidProPipelineValidationPassed } from "./paidProPostAcceptanceValidatorCache";
import {
  clearPremiumPartyNamesHandoff,
  readPremiumRecipientHandoff,
  resetPremiumRecipientHandoffDedupForTests,
  writePremiumRecipientHandoffExact,
  writePremiumRecipientHandoffSignerMetadata,
} from "./premiumPartyNamesHandoff";
import {
  buildPaidProFreezeCandidate,
  previewRecoverPaidProFreezeCandidate,
} from "./paidProFreezeCandidate";
import {
  detectProfessionalCorpusContamination,
  repairProfessionalCorpusContamination,
} from "./paidProProfessionalCorpusContamination";
import {
  setConsumedPaidProSignerMetadataAuthority,
  type PaidProSignerMetadataParty,
} from "./paidProSignerMetadataAuthority";
import { runPaidProSignerMetadataAuthoritySeed } from "./paidProSignerMetadataSeed";
import {
  readSignerMetadataEffectiveMax,
  resetSignerMetadataEffectiveMaxForTests,
} from "./signerMetadataEffective";
import { findNoticesSectionStart } from "./paidProPartyNoticeDetails";
import {
  buildTest422CorruptedCorpus,
  TEST422_PARTY_NAMES,
  TEST422_PRODUCTION_INTAKE,
  TEST422_SIGNER_NAMES,
  TEST422_SIGNER_TITLES,
  test422Draft,
} from "./paidProTest422Fixtures";

function fourPartyAuthority(): PaidProSignerMetadataParty[] {
  return TEST422_PARTY_NAMES.map((name, i) => ({
    partyIndex: i,
    partyLegalName: name,
    signerEmail: Object.values({
      red: "joe.redmesa@example.com",
      blue: "mary.bluecanyon@example.com",
      harbor: "hen.harborpeak@example.com",
      iron: "ira.ironvale@example.com",
    })[i],
    signerName: TEST422_SIGNER_NAMES[i],
    signerTitle: TEST422_SIGNER_TITLES[i],
    partyAddress: "123 Sample St.",
  }));
}

describe("TEST422 — professional corpus contamination gate + signer metadata monotonic", () => {
  const storage = new Map<string, string>();

  beforeEach(() => {
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
    clearPaidProSourceOfTruth();
    clearPremiumPartyNamesHandoff();
    clearCurrentSessionProEntitlementMarkers();
    resetPremiumRecipientHandoffDedupForTests();
    resetSignerMetadataEffectiveMaxForTests();
    storage.clear();
    vi.unstubAllGlobals();
  });

  it("detects bare party-label fragments and operative signer/contact leakage", () => {
    const corrupted = buildTest422CorruptedCorpus();
    expect(corrupted.length).toBeGreaterThan(4000);
    const issues = detectProfessionalCorpusContamination(corrupted, {
      partyNames: TEST422_PARTY_NAMES,
      partyCount: 4,
      signerNames: TEST422_SIGNER_NAMES,
    });
    expect(issues.some((i) => i.code === "bare_party_label_fragment")).toBe(true);
    expect(issues.some((i) => i.code === "notice_stanza_outside_notices")).toBe(true);
    expect(issues.some((i) => i.code === "signer_name_operative_leak")).toBe(true);

    const repaired = repairProfessionalCorpusContamination(corrupted, {
      partyNames: TEST422_PARTY_NAMES,
      partyCount: 4,
      signerNames: TEST422_SIGNER_NAMES,
    });
    expect(repaired.text).not.toMatch(/RED MESA BLUE CANYON HARBOR IRON/);
    expect(repaired.text).not.toMatch(/Joe Doe is an independent contractor/i);
    const postIssues = detectProfessionalCorpusContamination(repaired.text, {
      partyNames: TEST422_PARTY_NAMES,
      partyCount: 4,
      signerNames: TEST422_SIGNER_NAMES,
    });
    expect(postIssues.filter((i) => i.code === "bare_party_label_fragment")).toHaveLength(0);
    expect(postIssues.filter((i) => i.code === "signer_name_operative_leak")).toHaveLength(0);
  });

  it("freeze candidate rejects corrupted corpus and accepts clean recovery path", () => {
    const corrupted = buildTest422CorruptedCorpus();
    const preIssues = detectProfessionalCorpusContamination(corrupted, {
      partyNames: TEST422_PARTY_NAMES,
      partyCount: 4,
      signerNames: TEST422_SIGNER_NAMES,
    });
    expect(preIssues.length).toBeGreaterThan(0);

    const corruptCandidate = buildPaidProFreezeCandidate({
      text: corrupted,
      draft: test422Draft(),
      intakeText: TEST422_PRODUCTION_INTAKE,
      source: "server_full_draft",
    });
    expect(corruptCandidate.text).not.toMatch(/RED MESA BLUE CANYON HARBOR IRON/);

    const recovery = previewRecoverPaidProFreezeCandidate({
      draft: test422Draft(),
      intakeText: TEST422_PRODUCTION_INTAKE,
    });
    expect(recovery.ok).toBe(true);
    if (!recovery.ok) return;

    const cleanCandidate = buildPaidProFreezeCandidate({
      text: recovery.text,
      draft: test422Draft(),
      intakeText: TEST422_PRODUCTION_INTAKE,
      source: "server_full_draft",
    });
    expect(cleanCandidate.ok).toBe(true);
    expect(cleanCandidate.text).not.toMatch(/RED MESA BLUE CANYON HARBOR IRON/);

    const noticesIdx = findNoticesSectionStart(cleanCandidate.text);
    expect(noticesIdx).toBeGreaterThan(0);
    const noticesRegion = cleanCandidate.text.slice(noticesIdx);
    const ifToCount = (noticesRegion.match(/^If to\s+/gim) || []).length;
    expect(ifToCount).toBeGreaterThanOrEqual(4);
  });

  it("clean recovery corpus has no party fragments between numbered sections", () => {
    const recovery = previewRecoverPaidProFreezeCandidate({
      draft: test422Draft(),
      intakeText: TEST422_PRODUCTION_INTAKE,
    });
    expect(recovery.ok).toBe(true);
    if (!recovery.ok) return;
    const clean = recovery.text;
    expect(clean).not.toMatch(/RED MESA BLUE CANYON HARBOR IRON/);
    const numberedSections = clean.match(/^\d+\.\s+[A-Z]/gm) ?? [];
    expect(numberedSections.length).toBeGreaterThan(5);
    for (const email of ["joe.redmesa@example.com", "mary.bluecanyon@example.com"]) {
      const idx = clean.indexOf(email);
      if (idx < 0) continue;
      const noticesIdx = findNoticesSectionStart(clean);
      expect(idx).toBeGreaterThanOrEqual(noticesIdx);
    }
  });

  it("blocks handoff write that downgrades signer metadata after frozen SoT", () => {
    const authority = fourPartyAuthority();
    const recovery = previewRecoverPaidProFreezeCandidate({
      draft: test422Draft(),
      intakeText: TEST422_PRODUCTION_INTAKE,
    });
    expect(recovery.ok).toBe(true);
    if (!recovery.ok) return;
    markPaidProPipelineValidationPassed({ text: recovery.text, source: "server_full_draft" });
    hydratePaidProSourceOfTruth({
      text: recovery.text,
      source: "server_full_draft",
      agreementGenerationId: "gen-test422-handoff",
    });
    expect(hasPaidProSourceOfTruth()).toBe(true);

    writePremiumRecipientHandoffExact(
      {
        name: TEST422_PARTY_NAMES[0],
        email: "joe.redmesa@example.com",
        role: "party",
        signerName: "Joe Doe",
        signerTitle: "CEO",
        partyAddress: "",
      },
      {
        name: TEST422_PARTY_NAMES[1],
        email: "mary.bluecanyon@example.com",
        role: "party",
        signerName: "Mary Jay",
        signerTitle: "COO",
        partyAddress: "",
      },
      [
        {
          name: TEST422_PARTY_NAMES[2],
          email: "hen.harborpeak@example.com",
          role: "party",
          signerName: "Hen Park",
          signerTitle: "CFO",
          partyAddress: "",
        },
        {
          name: TEST422_PARTY_NAMES[3],
          email: "ira.ironvale@example.com",
          role: "party",
          signerName: "Ira Vale",
          signerTitle: "CTO",
          partyAddress: "",
        },
      ],
      4,
    );
    expect(readSignerMetadataEffectiveMax().slotsWithSignerName).toBe(4);

    setConsumedPaidProSignerMetadataAuthority({
      parties: authority,
      source: "live_ui",
      hash: "test",
      updatedAt: Date.now(),
    });

    writePremiumRecipientHandoffSignerMetadata({
      signerNames: ["Joe Doe", "Mary Jay", "", ""],
      signerTitles: ["CEO", "COO", "", ""],
      partyLegalNames: TEST422_PARTY_NAMES,
      authoritativePartyCount: 4,
    });

    const handoff = readPremiumRecipientHandoff();
    expect(handoff).not.toBeNull();
    const slotsWithName = [
      handoff!.party1.signerName,
      handoff!.party2.signerName,
      ...(handoff!.partyIndexSlots ?? []).map((s) => s.signerName),
    ].filter((n) => (n || "").trim().length > 0);
    expect(slotsWithName.length).toBeGreaterThanOrEqual(4);
    expect(readSignerMetadataEffectiveMax().slotsWithSignerName).toBe(4);
  });

  it("seed preserves 4/4 signer names from consumed authority when UI only has 2", () => {
    setConsumedPaidProSignerMetadataAuthority({
      parties: fourPartyAuthority(),
      source: "live_ui",
      hash: "test",
      updatedAt: Date.now(),
    });
    writePremiumRecipientHandoffExact(
      {
        name: TEST422_PARTY_NAMES[0],
        email: "joe.redmesa@example.com",
        role: "party",
        signerName: "Joe Doe",
        signerTitle: "CEO",
        partyAddress: "",
      },
      {
        name: TEST422_PARTY_NAMES[1],
        email: "mary.bluecanyon@example.com",
        role: "party",
        signerName: "Mary Jay",
        signerTitle: "COO",
        partyAddress: "",
      },
      [
        {
          name: TEST422_PARTY_NAMES[2],
          email: "hen.harborpeak@example.com",
          role: "party",
          signerName: "Hen Park",
          signerTitle: "CFO",
          partyAddress: "",
        },
        {
          name: TEST422_PARTY_NAMES[3],
          email: "ira.ironvale@example.com",
          role: "party",
          signerName: "Ira Vale",
          signerTitle: "CTO",
          partyAddress: "",
        },
      ],
      4,
    );

    const seed = runPaidProSignerMetadataAuthoritySeed({
      stage: "test422_seed",
      legalEntities: [...TEST422_PARTY_NAMES],
      intakeText: TEST422_PRODUCTION_INTAKE,
      draft: test422Draft(),
      handoff: readPremiumRecipientHandoff(),
      uiSignerNames: ["Joe Doe", "Mary Jay"],
      uiSignerTitles: ["CEO", "COO"],
      authoritativePartyCount: 4,
    });
    expect(seed.names.filter((n) => n.trim().length > 0).length).toBe(4);
    expect(seed.titles.filter((t) => t.trim().length > 0).length).toBe(4);
    expect(seed.emails.filter((e) => e.trim().length > 0).length).toBe(4);
  });
});
