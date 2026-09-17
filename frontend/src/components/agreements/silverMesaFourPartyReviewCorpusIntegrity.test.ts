import { afterEach, describe, expect, it } from "vitest";
import type { AgreementDraft } from "../../agreement/agreementTypes";
import { repairMalformedPaidProAgreementRecital } from "./paidProAgreementRecitalRepair";
import {
  detectPaidProMalformedMultiPartyOpening,
  ensurePaidProMultiPartyAgreementOpening,
} from "./paidProOpeningRecitalGuard";
import { repairOpeningRecitalRoleLabelsFromManifest } from "./paidProOpeningRoleLabelConsistency";
import {
  clearPaidProSourceOfTruth,
} from "./paidProSourceOfTruth";
import { resolveReviewFirstDisplayCorpus } from "../../launch/simpleProduct/reviewFirstDisplayCorpus";

const IRON = "Ironclad Systems Group LLC";
const HARBOR = "Harborline Data Solutions Inc.";
const NORTH = "Northwind Automation Partners LLC";
const SILVER = "Silver Mesa Analytics LP";
const FORBIDDEN_EXECUTION_EFFECTIVE_DATE =
  /The "Effective Date" is the date on which the Agreement has been fully executed/;

function pad(core: string, minLen = 1_200): string {
  const filler =
    " Additional operative clause text continues the same four-party rollout without inventing terms. ";
  let t = core;
  while (t.length < minLen) t += filler;
  return t;
}

function silverMesaAuthorOpening(extraRecital = ""): string {
  return pad(
    [
      "JOINT AI SOFTWARE AND INFRASTRUCTURE ROLLOUT AGREEMENT",
      "",
      `This Agreement is among ${IRON} ("Sponsor"), ${HARBOR} ("Vendor"), ${NORTH} ("Integrator"), and ${SILVER} ("Analyst").`,
      extraRecital,
      "",
      "1. PARTIES AND ROLES",
      `${IRON} is the Sponsor and shall fund the rollout. ${HARBOR} is the Vendor and shall deliver the white-label platform.`,
      `${NORTH} is the Integrator. ${SILVER} is the Analyst.`,
      "Ironclad Systems Group LLC pays the $187,500 contract value. The initial term is 24 months.",
      "This Agreement is governed by the laws of the State of Texas.",
      `If to ${SILVER}: Email: olivia.hart@silvermesaanalytics.com`,
    ].join("\n"),
  );
}

function entityNamedRecords(names: readonly string[]) {
  return names.map((fullLegalName) => ({
    fullLegalName,
    roleLabel: fullLegalName,
    displayAlias: fullLegalName,
    signerName: null,
    signerTitle: null,
  }));
}

function fourPartySignerParties() {
  return [IRON, HARBOR, NORTH, SILVER].map((name, partyIndex) => ({
    partyIndex,
    partyLegalName: name,
    signerEmail: "",
    signerName: "",
    signerTitle: "",
    partyAddress: "",
  }));
}

function assertSilverMesaRoles(text: string): void {
  expect(text).toContain(`${IRON} ("Sponsor")`);
  expect(text).toContain(`${HARBOR} ("Vendor")`);
  expect(text).toContain(`${NORTH} ("Integrator")`);
  expect(text).toContain(`${SILVER} ("Analyst")`);
  expect(text).not.toContain(`${IRON} ("${IRON}")`);
  expect(text).not.toMatch(/This Services Agreement \(the "Agreement"\) is entered into as of the Effective Date/i);
  expect(text).not.toMatch(FORBIDDEN_EXECUTION_EFFECTIVE_DATE);
}

describe("Silver Mesa four-party review corpus integrity", () => {
  afterEach(() => {
    clearPaidProSourceOfTruth();
  });

  const names = [IRON, HARBOR, NORTH, SILVER] as const;
  const entityRecords = entityNamedRecords(names);

  it("does not treat a valid Sponsor/Vendor/Integrator/Analyst opening as malformed", () => {
    const corpus = silverMesaAuthorOpening();
    expect(detectPaidProMalformedMultiPartyOpening(corpus, entityRecords)).toBe(false);
    const ensured = ensurePaidProMultiPartyAgreementOpening(corpus, entityRecords);
    assertSilverMesaRoles(ensured.text);
    expect(ensured.text).toContain("JOINT AI SOFTWARE AND INFRASTRUCTURE ROLLOUT AGREEMENT");
  });

  it("keeps declared roles when signer metadata labels are the legal entity names", () => {
    const corpus = silverMesaAuthorOpening();
    const repaired = repairMalformedPaidProAgreementRecital(corpus, fourPartySignerParties());
    assertSilverMesaRoles(repaired.text);
    const again = repairMalformedPaidProAgreementRecital(repaired.text, fourPartySignerParties());
    expect(again.text).toBe(repaired.text);
  });

  it("does not overwrite declared roles with entity-name canonical labels", () => {
    const corpus = silverMesaAuthorOpening();
    const { text, repairs } = repairOpeningRecitalRoleLabelsFromManifest(corpus, entityRecords);
    assertSilverMesaRoles(text);
    expect(repairs).toEqual([]);
  });

  it("preserves an author-supplied Effective Date clause", () => {
    const supplied = "The Effective Date is January 15, 2026.";
    const corpus = silverMesaAuthorOpening(supplied);
    const repaired = repairMalformedPaidProAgreementRecital(corpus, fourPartySignerParties());
    expect(repaired.text).toContain(supplied);
    expect(repaired.text).not.toMatch(FORBIDDEN_EXECUTION_EFFECTIVE_DATE);
    assertSilverMesaRoles(repaired.text);
  });

  it("leaves a two-party Client/Service Provider opening intact", () => {
    const blue = "Blue Canyon Analytics LLC";
    const iron = "Iron Vale Systems Inc";
    const two = pad(
      [
        "SERVICES AGREEMENT",
        "",
        `This Services Agreement (this "Agreement") is entered into by and between ${blue} ("Client") and ${iron} ("Service Provider").`,
        "",
        "1. SCOPE OF SERVICES",
        "Provider shall deliver reporting workflows for Client for a fee of $8,500.",
      ].join("\n"),
    );
    const parties = [
      {
        partyIndex: 0,
        partyLegalName: blue,
        signerEmail: "a@blue.test",
        signerName: "Ann Blue",
        signerTitle: "Member",
        partyAddress: "",
      },
      {
        partyIndex: 1,
        partyLegalName: iron,
        signerEmail: "b@iron.test",
        signerName: "Ian Iron",
        signerTitle: "CEO",
        partyAddress: "",
      },
    ];
    const repaired = repairMalformedPaidProAgreementRecital(two, parties);
    expect(repaired.text).toContain(`${blue} ("Client")`);
    expect(repaired.text).toContain(`${iron} ("Service Provider")`);
    expect(repaired.text).toContain("SERVICES AGREEMENT");
  });

  it("leaves a three-party Licensor/Platform/Distributor opening intact", () => {
    const stone = "Stonebridge Wellness LLC";
    const nova = "NovaPath Learning Inc.";
    const clear = "ClearSpring Distribution LLC";
    const three = pad(
      [
        "LICENSE AGREEMENT",
        "",
        `This Agreement is among ${stone} ("Licensor"), ${nova} ("Platform"), and ${clear} ("Distributor").`,
        "",
        "1. LICENSE",
        "Licensor shall grant a nonexclusive license. Distributor shall pay $1,000 upon delivery.",
      ].join("\n"),
    );
    const parties = [stone, nova, clear].map((name, partyIndex) => ({
      partyIndex,
      partyLegalName: name,
      signerEmail: "",
      signerName: "",
      signerTitle: "",
      partyAddress: "",
    }));
    const repaired = repairMalformedPaidProAgreementRecital(three, parties);
    expect(repaired.text).toContain(`${stone} ("Licensor")`);
    expect(repaired.text).toContain(`${nova} ("Platform")`);
    expect(repaired.text).toContain(`${clear} ("Distributor")`);
    expect(repaired.text).not.toMatch(FORBIDDEN_EXECUTION_EFFECTIVE_DATE);
  });

  it("reviewer display keeps the same Silver Mesa opening through repeated resolve", () => {
    const corpus = silverMesaAuthorOpening();
    const draft = {
      id: "ag-silver-mesa",
      title: "Joint AI Software and Infrastructure Rollout Agreement",
      jurisdiction: "TX",
      parties: names.map((name, i) => ({
        id: `p${i}`,
        name,
        role: name,
        email: "",
      })),
      purpose: corpus,
      payment_terms: "premium",
      duration: null,
      due_date: null,
      effective_date: null,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
      versions: [],
      audit_log: [],
      server_full_document_text: corpus,
      premium_full_document_text: corpus,
    } as AgreementDraft;
    const first = resolveReviewFirstDisplayCorpus(draft, "reviewer");
    const second = resolveReviewFirstDisplayCorpus(draft, "reviewer");
    expect(first?.text).toBeTruthy();
    assertSilverMesaRoles(first!.text);
    expect(second?.text).toBe(first?.text);
  });
});
