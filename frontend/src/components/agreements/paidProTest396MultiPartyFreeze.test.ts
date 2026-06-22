import { afterEach, describe, expect, it } from "vitest";
import { assessStarterComplexityGate } from "./starterMultiPartyProGate";
import { applyAcceptedProCorpusSafeDisplay } from "./acceptedProCorpusSafeDisplay";
import { validateClauseFamilyStructuralIntegrity } from "./clauseFamilyStructuralIntegrity";
import { extractOperativeIfToNoticeStanzas } from "./paidProPartyNoticeDetails";
import {
  buildLivePaidProSignerMetadataAuthority,
  clearConsumedPaidProSignerMetadataAuthority,
  mergeLabeledPartyAuthorityIntoParties,
  setConsumedPaidProSignerMetadataAuthority,
} from "./paidProSignerMetadataAuthority";
import { resolvePartiesForReviewRender } from "./paidProReviewRenderParties";
import {
  consumeAuthoritativeSignerCount,
  resolveAuthoritativeSignerCount,
} from "./signerCountAuthority";
import {
  clearPaidProPostAcceptanceValidatorCache,
  markPaidProPipelineValidationPassed,
} from "./paidProPostAcceptanceValidatorCache";
import {
  clearPaidProSourceOfTruth,
  establishPaidProSourceOfTruth,
  getPaidProSourceOfTruthText,
} from "./paidProSourceOfTruth";
import { collectForbiddenTemplateFragments } from "./agreementTemplatePlaceholderSafety";
import type { ParsedDraftShape } from "./intakeSmartDefaults";

const RED = "Red Mesa Logistics LLC";
const BLUE = "Blue Canyon Analytics LLC";
const HARBOR = "Harbor Peak Automation LLC";
const IRON = "Iron Vale Systems Inc.";

export const TEST396_QUAD_PARTY_INTAKE = [
  "Create a multi-party revenue sharing agreement.",
  "",
  "Party 1",
  `Legal Entity: ${RED}`,
  "Signer Name: Sarah Mitchell",
  "Signer Title: CEO",
  "Signer Email: contracts@redmesa-logistics.com",
  "Address: 100 Commerce Way, Tulsa, OK 74103",
  "",
  "Party 2",
  `Legal Entity: ${BLUE}`,
  "Signer Name: Dana Chen",
  "Signer Title: President",
  "Signer Email: legal@bluecanyonanalytics.com",
  "",
  "Party 3",
  `Legal Entity: ${HARBOR}`,
  "Signer Name: Michael Torres",
  "Signer Title: President",
  "Signer Email: legal@harborpeakautomation.com",
  "",
  "Party 4",
  `Legal Entity: ${IRON}`,
  "Signer Name: Rebecca Stone",
  "Signer Title: Managing Partner",
  "Signer Email: rstone@ironvale.com",
  "",
  "Oklahoma law governs. Provider fees and revenue sharing among the parties.",
].join("\n");

export function test396Draft(): ParsedDraftShape {
  return {
    title: "Multi-Party Revenue Sharing Agreement",
    jurisdiction: "Oklahoma",
    agreement_family: "consulting_agreement",
    parties: [
      { name: RED, role: "Party 1", email: "contracts@redmesa-logistics.com" } as never,
      { name: BLUE, role: "Party 2", email: "legal@bluecanyonanalytics.com" } as never,
      { name: HARBOR, role: "Party 3", email: "legal@harborpeakautomation.com" } as never,
      { name: IRON, role: "Party 4", email: "rstone@ironvale.com" } as never,
    ],
    purpose: "Revenue sharing and provider fees.",
    payment_terms: "Provider fees.",
    duration: "24 months",
    due_date: null,
    effective_date: null,
    payment: { amount: 1, cadence: "monthly", valid: true },
  };
}

export function test396Parties() {
  return buildLivePaidProSignerMetadataAuthority({
    partyCount: 4,
    recipient1Name: RED,
    recipient2Name: BLUE,
    recipient1Email: "contracts@redmesa-logistics.com",
    recipient2Email: "legal@bluecanyonanalytics.com",
    extraPartyReviewEmails: ["legal@harborpeakautomation.com", "rstone@ironvale.com"],
    partySignerNames: ["Sarah Mitchell", "Dana Chen", "Michael Torres", "Rebecca Stone"],
    partySignerTitles: ["CEO", "President", "President", "Managing Partner"],
    partyAddresses: ["100 Commerce Way, Tulsa, OK 74103", "", "", ""],
  }).parties;
}

/** Simulates premium server output with fused notices and signature placeholders. */
function buildTest396ServerDraft(): string {
  return [
    "MULTI-PARTY REVENUE SHARING AGREEMENT",
    "",
    `This Agreement is among ${RED}, ${BLUE}, ${HARBOR}, and ${IRON}.`,
    "",
    "1. Services",
    "The parties will collaborate on logistics automation and analytics services.",
    "",
    "2. Revenue Sharing",
    "Licensing revenue will be shared among the parties as set forth herein.",
    "",
    "3. Payment",
    "Provider fees are payable monthly.",
    "",
    "4. Confidentiality",
    "Each party shall protect confidential information received from the other parties.",
    "",
    "5. Notices",
    "Notices must be in writing and may be delivered by email or certified mail.",
    `If to ${RED} : ${RED} If to ${BLUE} : ${BLUE} If to ${HARBOR} : If to ${IRON} :`,
    "",
    "6. Governing Law",
    "This Agreement is governed by Oklahoma law.",
    "",
    "IN WITNESS WHEREOF, the Parties execute this Agreement.",
    "",
    `${RED}:`,
    RED,
    "By: _________________________________",
    "Name: Sarah Mitchell",
    "Title: [Title]",
    "",
    `${BLUE}:`,
    BLUE,
    "By: _________________________________",
    "Name: [Name]",
    "Title: [Title]",
    "",
    `${HARBOR}:`,
    HARBOR,
    "By: _________________________________",
    "",
    `${IRON}:`,
    IRON,
    "By: _________________________________",
  ].join("\n");
}

function countIfToStanzas(corpus: string): number {
  const witness = corpus.search(/\bIN WITNESS WHEREOF\b/i);
  const noticesIdx = corpus.search(/\bNotices\b/i);
  if (noticesIdx < 0) return 0;
  const region = corpus.slice(noticesIdx, witness >= 0 ? witness : corpus.length);
  const blob = extractOperativeIfToNoticeStanzas(region);
  if (!blob.trim()) return 0;
  return blob.split(/\n\n(?=If to\s+)/i).filter((s) => s.trim()).length;
}

afterEach(() => {
  clearPaidProSourceOfTruth();
  clearConsumedPaidProSignerMetadataAuthority();
  clearPaidProPostAcceptanceValidatorCache();
});

describe("TEST396 — multi-party Pro freeze failure regression", () => {
  it("Free routes to Pro when intake has 4 legal parties", () => {
    const gate = assessStarterComplexityGate(TEST396_QUAD_PARTY_INTAKE);
    expect(gate.required).toBe(true);
    expect(gate.partyCount).toBe(4);
    expect(gate.reasons).toContain("three_plus_legal_parties");
  });

  it("signer count authority stays at 4 through manifest and VS01 gate surfaces", () => {
    const parties = test396Parties();
    setConsumedPaidProSignerMetadataAuthority({
      parties,
      source: "live_ui",
      hash: "test396",
      updatedAt: 0,
    });
    const resolution = resolveAuthoritativeSignerCount({
      intakeText: TEST396_QUAD_PARTY_INTAKE,
      draftParties: test396Draft().parties,
      manifestPartyCount: 4,
    });
    expect(resolution.count).toBe(4);

    const vs01Count = consumeAuthoritativeSignerCount(
      "vs01_corpus_gate",
      {
        intakeText: TEST396_QUAD_PARTY_INTAKE,
        draftParties: test396Draft().parties.slice(0, 2),
        manifestPartyCount: 4,
      },
      2,
    );
    expect(vs01Count).toBe(4);
  });

  it("notice authority rebuilds exactly 4 stanzas — never 11/12 from corpus inflation", () => {
    const server = buildTest396ServerDraft();
    const accepted = applyAcceptedProCorpusSafeDisplay(server, {
      draft: test396Draft(),
      intakeText: TEST396_QUAD_PARTY_INTAKE,
    }).text;
    const reviewParties = resolvePartiesForReviewRender({
      draft: test396Draft(),
      intakeText: TEST396_QUAD_PARTY_INTAKE,
    });
    expect(reviewParties.length).toBe(4);
    expect(countIfToStanzas(accepted)).toBe(4);
    expect(accepted).not.toMatch(/If to.*If to.*If to/i);
  });

  it("establishes frozen SoT with 4 parties and no fatal placeholders", () => {
    const parties = test396Parties();
    setConsumedPaidProSignerMetadataAuthority({
      parties,
      source: "live_ui",
      hash: "test396",
      updatedAt: 0,
    });
    const server = buildTest396ServerDraft();
    const accepted = applyAcceptedProCorpusSafeDisplay(server, {
      draft: test396Draft(),
      intakeText: TEST396_QUAD_PARTY_INTAKE,
    }).text;
    markPaidProPipelineValidationPassed({ text: accepted, source: "server_full_draft" });

    const record = establishPaidProSourceOfTruth({
      text: server,
      source: "server_full_draft",
      draft: test396Draft(),
      intakeText: TEST396_QUAD_PARTY_INTAKE,
    });
    const sot = getPaidProSourceOfTruthText();
    expect(record).toBeTruthy();
    expect(sot.length).toBeGreaterThan(500);

    const structural = validateClauseFamilyStructuralIntegrity(sot, { parties });
    expect(structural.ok).toBe(true);
    expect(countIfToStanzas(sot)).toBe(4);

    const fatalPlaceholders = collectForbiddenTemplateFragments(sot, TEST396_QUAD_PARTY_INTAKE, {
      partyNames: [RED, BLUE, HARBOR, IRON],
    });
    expect(fatalPlaceholders).not.toContain("[Title]");
    expect(fatalPlaceholders).not.toContain("[Name]");
    expect(fatalPlaceholders.filter((t) => /\[EMAIL|\[ADDRESS|party_a/i.test(t))).toHaveLength(0);

    const signerCount = resolveAuthoritativeSignerCount({
      intakeText: TEST396_QUAD_PARTY_INTAKE,
      draftParties: mergeLabeledPartyAuthorityIntoParties([], TEST396_QUAD_PARTY_INTAKE).map((p) => ({
        name: p.partyLegalName,
      })),
      manifestPartyCount: 4,
    }).count;
    expect(signerCount).toBe(4);
  });
});
