/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assessStarterComplexityGate,
  formatStarterMultiPartyGatePartyLines,
} from "./starterMultiPartyProGate";
import { resolveStarterGatePartyLegalEntities } from "./labeledPartyBlockParse";
import {
  TEST490_CLEARSPRING,
  TEST490_FOUR_PARTY_INTAKE,
  TEST490_NOVAPATH,
  TEST490_STONEBRIDGE,
  TEST490_THREE_PARTY_REVENUE_SHARE_INTAKE,
  TEST490_TWO_PARTY_INTAKE,
} from "./paidProTest490Fixtures";
import {
  ensureCanonicalNoticesSectionHeadingForFreeze,
  removeMisplacedNoticesHeadingBeforeSubsection,
} from "./paidProPartyNoticeDetails";
import { resolveAuthoritativeSignerCount } from "./signerCountAuthority";
import {
  clearPaidProSourceOfTruth,
  establishPaidProSourceOfTruth,
  getPaidProSourceOfTruth,
  hashPaidProCorpus,
  hydratePaidProSourceOfTruth,
} from "./paidProSourceOfTruth";
import {
  clearConsumedPaidProSignerMetadataAuthority,
  setConsumedPaidProSignerMetadataAuthority,
} from "./paidProSignerMetadataAuthority";
import { applyPaidProNoticeContactAuthority } from "./paidProNoticeContactAuthority";
import {
  evaluatePaidProFreezeCandidateGates,
  preparePaidProFreezeCandidateText,
} from "./paidProFreezeCandidate";
import { markCurrentSessionProEntitlementComplete } from "./paidProSessionEligibility";
import { markPaidProPipelineValidationPassed } from "./paidProPostAcceptanceValidatorCache";

const TEST491_SIGNERS = [
  {
    partyLegalName: TEST490_STONEBRIDGE,
    signerName: "Sandra Wells",
    signerTitle: "Managing Member",
    signerEmail: "cryptocurated21+s@gmail.com",
    partyAddress: "710 Meadow Birch Rd.\nNorman, OK 73069",
  },
  {
    partyLegalName: TEST490_NOVAPATH,
    signerName: "Caleb Price",
    signerTitle: "Chief Product Officer",
    signerEmail: "cryptocurated21+nova@gmail.com",
    partyAddress: "2841 Foundry Ave.\nRaleigh, NC 27601",
  },
  {
    partyLegalName: TEST490_CLEARSPRING,
    signerName: "Maya Coleman",
    signerTitle: "President",
    signerEmail: "cryptocurated21+cs@gmail.com",
    partyAddress: "903 Harbor Mill Dr.\nTampa, FL 33602",
  },
];

function padCorpus(base: string, minLen = 2500): string {
  if (base.length >= minLen) return base;
  let pad = "";
  let i = 0;
  while (base.length + pad.length < minLen) {
    pad += `14.${i + 1} Supplemental clause ${i + 1}. Each party will continue cooperating in good faith.\n\n`;
    i += 1;
  }
  const witnessIdx = base.search(/\bIN WITNESS WHEREOF\b/i);
  const insertAt = witnessIdx >= 0 ? witnessIdx : base.length;
  return `${base.slice(0, insertAt)}${pad}${base.slice(insertAt)}`;
}

function buildThreePartyNoticeCorpus(): string {
  const stanzas = TEST491_SIGNERS.map(
    (party) =>
      `If to ${party.partyLegalName}:\nAttention: Authorized Signer\nEmail: provided during signer setup.\nAddress: provided during signer setup.`,
  ).join("\n\n");
  return padCorpus(
    [
      "TRIPARTITE INTELLECTUAL PROPERTY LICENSE AND ROYALTY AGREEMENT",
      "",
      `This Agreement is among ${TEST490_STONEBRIDGE}, ${TEST490_NOVAPATH}, and ${TEST490_CLEARSPRING}.`,
      "",
      "1. LICENSE GRANT",
      "Stonebridge grants NovaPath a license to adapt and host the original materials.",
      "",
      "2. REVENUE SHARING",
      "Subscription revenue is split 45%, 35%, and 20% among the Parties.",
      "",
      "3. CONFIDENTIALITY",
      "Each Party will protect confidential information.",
      "",
      "4. GOVERNING LAW",
      "Oklahoma law governs.",
      "",
      "5. NOTICES",
      "",
      stanzas,
      "",
      "IN WITNESS WHEREOF, the Parties have executed this Agreement.",
      "",
      "PARTY 1: STONEBRIDGE WELLNESS LLC",
      "",
      "PARTY 2: NOVAPATH LEARNING INC.",
      "",
      "PARTY 3: CLEARSPRING DISTRIBUTION LLC",
    ].join("\n"),
  );
}

function countNoticeHeadings(text: string): number {
  return (text.match(/(?:^|\n)\s*\d+(?:\.\d+)?(?:\.\s*|\s+)NOTICES\b/gim) || []).length;
}

function countIfToStanzas(text: string): number {
  const noticesIdx = text.search(/\bNOTICES\b/i);
  const witnessIdx = text.search(/\bIN WITNESS WHEREOF\b/i);
  const region = witnessIdx >= 0 ? text.slice(noticesIdx, witnessIdx) : text.slice(noticesIdx);
  return (region.match(/^If to\s+/gim) || []).length;
}

afterEach(() => {
  clearPaidProSourceOfTruth();
  clearConsumedPaidProSignerMetadataAuthority();
  vi.restoreAllMocks();
});

describe("TEST490 — 3-party revenue-share pre-payment Pro gate", () => {
  it("shows all 3 legal parties before checkout", () => {
    const gate = assessStarterComplexityGate(TEST490_THREE_PARTY_REVENUE_SHARE_INTAKE);
    expect(gate.required).toBe(true);
    expect(gate.partyCount).toBe(3);
    expect(gate.parties).toHaveLength(3);
    expect(gate.parties).toEqual([
      TEST490_STONEBRIDGE,
      TEST490_NOVAPATH,
      TEST490_CLEARSPRING,
    ]);
    expect(formatStarterMultiPartyGatePartyLines(gate.parties)).toEqual([
      `1. ${TEST490_STONEBRIDGE}`,
      `2. ${TEST490_NOVAPATH}`,
      `3. ${TEST490_CLEARSPRING}`,
    ]);
    expect(gate.parties.some((p) => /:\s*\d+\s*%/.test(p))).toBe(false);
  });

  it("does not regress 2-party, 4-party, or coordinator-exclusion flows", () => {
    expect(assessStarterComplexityGate(TEST490_TWO_PARTY_INTAKE).parties).toHaveLength(2);
    expect(
      assessStarterComplexityGate(TEST490_FOUR_PARTY_INTAKE).parties.length,
    ).toBeGreaterThanOrEqual(4);
    expect(
      resolveStarterGatePartyLegalEntities(TEST490_THREE_PARTY_REVENUE_SHARE_INTAKE),
    ).not.toContain("I am not a party");
  });
});

describe("TEST491 — 3-party freeze notices integrity", () => {
  it("has exactly one Notices section and 3 operative stanzas after freeze prep", () => {
    const intake = TEST490_THREE_PARTY_REVENUE_SHARE_INTAKE;
    const raw = buildThreePartyNoticeCorpus();
    setConsumedPaidProSignerMetadataAuthority({
      parties: TEST491_SIGNERS.map((party, partyIndex) => ({ ...party, partyIndex })),
      source: "live_ui",
      hash: "test490",
      updatedAt: Date.now(),
    });
    const prep = preparePaidProFreezeCandidateText({
      text: raw,
      intakeText: intake,
      draft: {
        title: "Tripartite IP License",
        jurisdiction: "Oklahoma",
        parties: TEST491_SIGNERS.map((party, i) => ({
          name: party.partyLegalName,
          role: i === 0 ? "Licensor" : i === 1 ? "Platform" : "Distributor",
        })),
        purpose: "",
        payment_terms: "",
        duration: null,
        due_date: null,
        effective_date: null,
        payment: { amount: null, cadence: null, valid: false },
      },
      source: "server_full_draft",
    });
    const gated = evaluatePaidProFreezeCandidateGates(prep, {
      text: raw,
      intakeText: intake,
      source: "server_full_draft",
    });
    expect(gated.ok).toBe(true);
    expect(countNoticeHeadings(gated.text)).toBe(1);
    expect(countIfToStanzas(gated.text)).toBe(3);
  });

  it("removes misplaced standalone NOTICES inserted before a subsection", () => {
    const corpus = [
      "10. TERMINATION AND TRANSITION ASSISTANCE",
      "",
      "11. NOTICES",
      "",
      "10.1 Assignment",
      "No Party may assign without consent.",
      "",
      "If to Stonebridge Wellness LLC:",
      "Attention: Authorized Signer",
    ].join("\n");
    const repaired = removeMisplacedNoticesHeadingBeforeSubsection(corpus);
    expect(repaired.repairs).toContain("notice:remove_misplaced_notices_before_subsection");
    expect(repaired.text).not.toMatch(/11\.\s+NOTICES[\s\S]*10\.1 Assignment/);
  });

  it("does not insert NOTICES inside an open section before its first subsection", () => {
    const corpus = [
      "10. TERMINATION AND TRANSITION ASSISTANCE",
      "",
      "10.1 Assignment",
      "No Party may assign without consent.",
      "",
      "If to Stonebridge Wellness LLC:",
      "Attention: Authorized Signer",
      "",
      "If to NovaPath Learning Inc.:",
      "Attention: Authorized Signer",
      "",
      "If to ClearSpring Distribution LLC:",
      "Attention: Authorized Signer",
    ].join("\n");
    const repaired = ensureCanonicalNoticesSectionHeadingForFreeze(corpus);
    expect(repaired.text).not.toMatch(/10\.\s+TERMINATION[\s\S]*\n\n\d+\.\s+NOTICES\s*\n\n10\.1/);
  });
});

describe("TEST492 — post-signer hydration preserves frozen SoT", () => {
  it("preserves SoT hash except allowed signer/contact hydration and no standalone NOTICES heading", () => {
    markCurrentSessionProEntitlementComplete();
    const intake = TEST490_THREE_PARTY_REVENUE_SHARE_INTAKE;
    const raw = buildThreePartyNoticeCorpus();
    const parties = TEST491_SIGNERS.map((party, partyIndex) => ({ ...party, partyIndex }));
    setConsumedPaidProSignerMetadataAuthority({
      parties,
      source: "live_ui",
      hash: "test492",
      updatedAt: Date.now(),
    });
    markPaidProPipelineValidationPassed({ text: raw, source: "server_full_draft" });
    establishPaidProSourceOfTruth({
      text: raw,
      source: "server_full_draft",
      intakeText: intake,
      generationOutcome: "ok",
    });
    const before = getPaidProSourceOfTruth()!.text;
    const beforeHash = hashPaidProCorpus(before);
    const hydrated = applyPaidProNoticeContactAuthority(before, {
      intakeText: intake,
      draft: {
        title: "Tripartite IP License",
        jurisdiction: "Oklahoma",
        parties: TEST491_SIGNERS.map((party) => ({
          name: party.partyLegalName,
          role: "party",
          email: party.signerEmail,
          partyAddress: party.partyAddress,
        })),
        purpose: "",
        payment_terms: "",
        duration: null,
        due_date: null,
        effective_date: null,
        payment: { amount: null, cadence: null, valid: false },
      },
    });
    expect(hydrated.ok).toBe(true);
    expect(hydrated.text).toMatch(/Attention:\s*Sandra Wells|Managing Member/i);
    expect(hydrated.text).not.toMatch(/\n\n\d+\.\s+NOTICES\s*\n\n10\./);
    expect(countNoticeHeadings(hydrated.text)).toBeLessThanOrEqual(1);
    expect(beforeHash).toBeTruthy();
    expect(hashPaidProCorpus(hydrated.text)).not.toBe(beforeHash);
  });
});

describe("TEST493 — hydrate path party count diagnostic", () => {
  it("resolves canonical authority party count from intake when manifest parties are absent", () => {
    const intake = TEST490_THREE_PARTY_REVENUE_SHARE_INTAKE;
    expect(
      resolveAuthoritativeSignerCount({
        intakeText: intake,
        draftPartyNames: [TEST490_STONEBRIDGE, TEST490_NOVAPATH, TEST490_CLEARSPRING],
      }).count,
    ).toBe(3);
  });

  it("hydrate rebuild skips clause-family placeholder rejection for established corpus", () => {
    markCurrentSessionProEntitlementComplete();
    const raw = buildThreePartyNoticeCorpus();
    markPaidProPipelineValidationPassed({ text: raw, source: "server_full_draft" });
    establishPaidProSourceOfTruth({
      text: raw,
      source: "server_full_draft",
      intakeText: TEST490_THREE_PARTY_REVENUE_SHARE_INTAKE,
      generationOutcome: "ok",
    });
    clearPaidProSourceOfTruth();
    const hydrated = hydratePaidProSourceOfTruth({
      text: raw,
      hash: hashPaidProCorpus(raw),
      source: "server_full_draft",
    });
    expect(hydrated?.text.length).toBeGreaterThan(2000);
  });
});
