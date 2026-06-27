/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import { repairKnownPartyPlaceholders } from "../../agreement/partyPlaceholderDisplay";
import { applyAcceptedProCorpusSafeDisplay } from "./acceptedProCorpusSafeDisplay";
import { buildPaidProFreezeCandidate } from "./paidProFreezeCandidate";
import {
  buildTest432FourPartyWireServerCorpus,
  test432FourPartyStructuredDraft,
} from "./paidProTest432FourPartyNorthStarPipelineFixtures";
import { TEST429_FOUR_PARTY_NORTH_STAR_INTAKE } from "./paidProTest429FourPartyNorthStarFixtures";

const MEDIUM_BODY_INTAKE =
  "Create a professional services agreement between Blue Canyon Analytics LLC and Iron Vale Systems Inc. for AI workflow setup in Texas.";

function buildPlaceholderPartyServicesBody(targetLen: number): string {
  const header = [
    "PROFESSIONAL SERVICES AGREEMENT",
    "",
    'This Professional Services Agreement (the "Agreement") is entered into by and between ' +
      '[ORG_1] ("Client") and [ORG_2] ("Service Provider").',
    "",
    "1. Scope of Services. [ORG_2] shall perform the professional services described in this services " +
      "agreement, including the AI workflow setup and integration tasks defined by the parties.",
    "2. Payment. [ORG_1] shall pay [ORG_2] $5,000 for the services, payable within thirty (30) days of invoice.",
    "3. Acceptance Review. [ORG_1] shall have a review period to evaluate each deliverable for material " +
      "conformity and to report any nonconformity or defect during the acceptance review.",
    "4. Ownership of Work Product. Upon full payment, [ORG_1] owns all final deliverables and work product, " +
      "and [ORG_2] assigns all related intellectual property to [ORG_1].",
    "5. Confidentiality. Each party shall protect the other party's confidential and proprietary information and trade secrets.",
    "6. Term and Termination. This Agreement continues until completion and is subject to termination for cause upon written notice.",
    "7. Governing Law. This Agreement is governed by the laws of the State of Texas.",
    "8. Electronic Signatures. The parties agree that electronic signatures and counterparts are valid and binding.",
    "",
  ].join("\n");
  let body = header;
  let i = 9;
  while (body.length < targetLen) {
    body +=
      `\n${i}. Additional Provision. The parties acknowledge that the obligations under section ${i} are ` +
      "commercially reasonable and shall be performed diligently, with each party bearing responsibility for its own " +
      "personnel, equipment, records, insurance, and compliance with applicable law in connection with the engagement.";
    i += 1;
  }
  return body;
}

describe("TEST455 — collateral regression repair after TEST454 filler gate", () => {
  it("placeholder-repaired body passes freeze and retains every canonical party occurrence", () => {
    const NAMES = ["Blue Canyon Analytics LLC", "Iron Vale Systems Inc."];
    let body = buildPlaceholderPartyServicesBody(3000);
    const repair = repairKnownPartyPlaceholders(body, NAMES, MEDIUM_BODY_INTAKE);
    body = repair.text;
    const freeze = buildPaidProFreezeCandidate({
      text: body,
      source: "server_full_draft",
      draft: {
        title: "Professional Services Agreement",
        jurisdiction: "Texas",
        parties: [
          { name: NAMES[0], role: "Client" },
          { name: NAMES[1], role: "Service Provider" },
        ],
        purpose: "AI workflow setup.",
        payment_terms: "$5,000",
        duration: "12 months",
        due_date: null,
        effective_date: null,
        payment: { amount: 5000, cadence: null, valid: true },
      },
      intakeText: MEDIUM_BODY_INTAKE,
      agreementGenerationId: "gen-test455-ph",
      generationOutcome: "needs_details",
      surface: "test455_placeholder_freeze",
    });
    expect(freeze.ok, freeze.rejectReason ?? "").toBe(true);
    expect((freeze.text.match(/Iron Vale Systems Inc\./g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(freeze.text).not.toMatch(/\[ORG_1\]|\[ORG_2\]/);
  });

  it("TEST432 wire retains Revenue Allocation through safe display and freeze prep", () => {
    const wire = buildTest432FourPartyWireServerCorpus();
    const draft = test432FourPartyStructuredDraft();
    const safe = applyAcceptedProCorpusSafeDisplay(wire, {
      draft,
      intakeText: TEST429_FOUR_PARTY_NORTH_STAR_INTAKE,
      surface: "test455",
    });
    expect(safe.text.length).toBeGreaterThan(18_000);
    expect(safe.text).toMatch(/Revenue Allocation Among Service Providers/i);
    const freeze = buildPaidProFreezeCandidate({
      text: safe.text,
      source: "server_full_draft",
      draft,
      intakeText: TEST429_FOUR_PARTY_NORTH_STAR_INTAKE,
      agreementGenerationId: "gen-test455-432",
      generationOutcome: "ok",
      surface: "test455_wire_freeze",
    });
    expect(freeze.ok, freeze.rejectReason ?? "").toBe(true);
    expect(freeze.text).toMatch(/Revenue Allocation Among Service Providers/i);
  });
});
