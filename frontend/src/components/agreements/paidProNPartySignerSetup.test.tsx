/** @vitest-environment jsdom */
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PaidProCoordinatorToggle } from "./PaidProCoordinatorToggle";
import {
  PAID_PRO_SIGNER_SETUP_MAX_UI_PARTIES,
  applySignerSetupGeneratedPartyGuardToGate,
  buildLegalPartiesFromSignerSetupState,
  buildVs01PrepareSigningRolesForBridge,
  canAddAnotherSignerParty,
  canRemoveSignerSetupParty,
  evaluateSignerSetupGeneratedPartyGuard,
  formatSignerSetupBeyondGeneratedWarning,
  formatSignerSetupBeyondGeneratedWarningBody,
  formatSignerSetupBeyondGeneratedWarningTitle,
  isSignerSetupBeyondGeneratedPartyCount,
  removeAddedSignerPartyState,
  resolveGeneratedAgreementPartyCount,
  resolveSignerSetupUiPartyCount,
} from "./paidProNPartySignerSetup";
import {
  PAID_PRO_SIGNER_DETAILS_COMPLETE_CTA,
  PAID_PRO_SIGNER_DETAILS_INCOMPLETE_CTA,
  resolvePaidProSignerDetailsGate,
} from "./signerSetupPartyIdentity";
import { resolveAuthoritativePartySlotCount } from "./partySlotIdentityNormalize";

const baseTwoPartyState = {
  creatorCoordinatorOnly: false,
  signerSetupUiPartyCount: 2,
  draftParties: [
    { id: "p1", name: "Alpha LLC", role: "owner" },
    { id: "p2", name: "Beta Inc", role: "party" },
  ],
  recipient1Name: "Alpha LLC",
  recipient2Name: "Beta Inc",
  extraPartyLegalNames: [] as string[],
  recipient1Email: "a@example.test",
  recipient2Email: "b@example.test",
  extraPartyReviewEmails: [] as string[],
  partySignerNames: ["Alice Admin", "Bob Beta"],
  partySignerTitles: ["CEO", "President"],
  partyAddresses: [] as string[],
};

const twoPartyCorpus = `${"Operational clause with duties and payment mechanics. ".repeat(90)}

IN WITNESS WHEREOF, the Parties execute this Agreement.

PARTY 1:
Alpha LLC
By: ______________________

PARTY 2:
Beta Inc
By: ______________________`;

const threePartyCorpus = `${twoPartyCorpus}

PARTY 3:
Gamma Corp
By: ______________________`;

describe("paidProNPartySignerSetup", () => {
  it("defaults to two-party slot count without user expansion", () => {
    expect(
      resolveAuthoritativePartySlotCount({
        intakeText: "between Alpha LLC and Beta Inc",
        draftPartyNames: ["Alpha LLC", "Beta Inc"],
        rawPartyCount: 2,
      }),
    ).toBe(2);
    expect(resolveSignerSetupUiPartyCount(baseTwoPartyState)).toBe(2);
  });

  it("two-party intake authority blocks UI inflation without explicit multi-party", () => {
    expect(
      resolveAuthoritativePartySlotCount({
        intakeText: "between Alpha LLC and Beta Inc",
        draftPartyNames: ["Alpha LLC", "Beta Inc", "Gamma Corp"],
        rawPartyCount: 3,
        userExpandedPartyCount: 3,
      }),
    ).toBe(2);
    expect(canAddAnotherSignerParty(2)).toBe(true);
    expect(canAddAnotherSignerParty(PAID_PRO_SIGNER_SETUP_MAX_UI_PARTIES)).toBe(false);
  });

  it("builds four legal parties from UI state", () => {
    const parties = buildLegalPartiesFromSignerSetupState({
      ...baseTwoPartyState,
      signerSetupUiPartyCount: 4,
      draftParties: [
        ...baseTwoPartyState.draftParties,
        { id: "p3", name: "Gamma Corp", role: "party" },
        { id: "p4", name: "Delta LLC", role: "party" },
      ],
      extraPartyLegalNames: ["Gamma Corp", "Delta LLC"],
      extraPartyReviewEmails: ["c@example.test", "d@example.test"],
      partySignerNames: ["Alice Admin", "Bob Beta", "Carol Gamma", "Dan Delta"],
      partySignerTitles: ["CEO", "President", "COO", "CFO"],
    });
    expect(parties).toHaveLength(4);
    expect(parties.map((p) => p.name)).toEqual(["Alpha LLC", "Beta Inc", "Gamma Corp", "Delta LLC"]);
  });

  it("coordinator-only toggle yields creatorIsParty=false on bridge roles", () => {
    const legalParties = buildLegalPartiesFromSignerSetupState({
      ...baseTwoPartyState,
      creatorCoordinatorOnly: true,
    });
    const roles = buildVs01PrepareSigningRolesForBridge({
      agreementId: "ag-coord-ui",
      creatorName: "Coordinator User",
      creatorEmail: "coord@example.test",
      counterparties: [],
      bridge: { creatorIsParty: false, legalParties },
    });
    expect(roles).toHaveLength(2);
    expect(roles.every((r) => r.entityName !== "Coordinator User")).toBe(true);
    expect(roles[0]?.kind).toBe("counterparty");
  });

  it("coordinator is not a signer unless listed as a legal party", () => {
    const legalParties = buildLegalPartiesFromSignerSetupState({
      ...baseTwoPartyState,
      creatorCoordinatorOnly: true,
    });
    const roles = buildVs01PrepareSigningRolesForBridge({
      agreementId: "ag-no-coord-sign",
      creatorName: "Hidden Coordinator",
      creatorEmail: "hidden@example.test",
      counterparties: [],
      bridge: { creatorIsParty: false, legalParties },
    });
    expect(roles.some((r) => r.signerEmail === "hidden@example.test")).toBe(false);
  });

  it("VS01 role builder receives all legal parties from UI state (3-party)", () => {
    const legalParties = buildLegalPartiesFromSignerSetupState({
      ...baseTwoPartyState,
      signerSetupUiPartyCount: 3,
      draftParties: [...baseTwoPartyState.draftParties, { id: "p3", name: "Gamma Corp", role: "party" }],
      extraPartyLegalNames: ["Gamma Corp"],
      extraPartyReviewEmails: ["c@example.test"],
      partySignerNames: ["Alice Admin", "Bob Beta", "Carol Gamma"],
      partySignerTitles: ["CEO", "President", "COO"],
    });
    const roles = buildVs01PrepareSigningRolesForBridge({
      agreementId: "ag-triple-ui",
      creatorName: "Alpha LLC",
      creatorEmail: "a@example.test",
      counterparties: [],
      bridge: { creatorIsParty: true, legalParties },
    });
    expect(roles).toHaveLength(3);
    expect(roles.map((r) => r.entityName)).toEqual(["Alpha LLC", "Beta Inc", "Gamma Corp"]);
  });

  it("two-party gate unchanged when coordinator toggle is off", () => {
    const gate = resolvePaidProSignerDetailsGate({
      partyCount: 2,
      draftPartyNames: ["Alpha LLC", "Beta Inc"],
      partySignerNames: ["Alice", "Bob"],
      recipient1Name: "Alpha LLC",
      recipient2Name: "Beta Inc",
      recipient1Email: "a@example.test",
      recipient2Email: "b@example.test",
      extraPartyReviewEmails: [],
      extraPartyLegalNames: [],
      userExpandedPartyCount: 2,
    });
    expect(gate.requiredCount).toBe(2);
    expect(gate.complete).toBe(true);
  });
});

describe("post-generation signer setup party guard", () => {
  it("resolveGeneratedAgreementPartyCount ignores user-added placeholder draft rows", () => {
    expect(
      resolveGeneratedAgreementPartyCount({
        draftParties: [
          { name: "Alpha LLC" },
          { name: "Beta Inc" },
          { name: "Party 3" },
        ],
        corpusPlain: twoPartyCorpus,
      }),
    ).toBe(2);
  });

  it("generated 2-party draft + UI Party 3 shows warning and blocks continue", () => {
    const generated = resolveGeneratedAgreementPartyCount({
      draftParties: baseTwoPartyState.draftParties,
      corpusPlain: twoPartyCorpus,
    });
    expect(generated).toBe(2);
    const guard = evaluateSignerSetupGeneratedPartyGuard({
      signerSetupUiPartyCount: 3,
      generatedPartyCount: generated,
    });
    expect(guard.beyondGenerated).toBe(true);
    expect(guard.warningMessage).toContain("drafted for 2 legal parties");
    const baseGate = resolvePaidProSignerDetailsGate({
      partyCount: 3,
      draftPartyNames: ["Alpha LLC", "Beta Inc"],
      partySignerNames: ["Alice Admin", "Bob Beta", "Carol Gamma"],
      recipient1Name: "Alpha LLC",
      recipient2Name: "Beta Inc",
      recipient1Email: "a@example.test",
      recipient2Email: "b@example.test",
      extraPartyReviewEmails: ["c@example.test"],
      extraPartyLegalNames: ["Gamma Corp"],
      userExpandedPartyCount: 3,
    });
    const gated = applySignerSetupGeneratedPartyGuardToGate(
      baseGate,
      guard,
      PAID_PRO_SIGNER_DETAILS_INCOMPLETE_CTA,
    );
    expect(gated.complete).toBe(false);
    expect(gated.blockerMessage).toContain("signature blocks, signer roles, and signing invitations");
    expect(gated.ctaLabel).toBe(PAID_PRO_SIGNER_DETAILS_INCOMPLETE_CTA);
  });

  it("remove Party 3 clears fields, drops count, and clears warning", () => {
    const expanded = {
      ...baseTwoPartyState,
      signerSetupUiPartyCount: 3,
      extraPartyLegalNames: ["Gamma Corp"],
      extraPartyReviewEmails: ["c@example.test"],
      partySignerNames: ["Alice Admin", "Bob Beta", "Carol Gamma"],
      partySignerTitles: ["CEO", "President", "COO"],
    };
    const removed = removeAddedSignerPartyState(2, expanded);
    expect(removed).not.toBeNull();
    expect(removed!.signerSetupUiPartyCount).toBe(2);
    expect(removed!.extraPartyLegalNames).toEqual([]);
    expect(removed!.partySignerNames).toEqual(["Alice Admin", "Bob Beta"]);
    const guard = evaluateSignerSetupGeneratedPartyGuard({
      signerSetupUiPartyCount: removed!.signerSetupUiPartyCount,
      generatedPartyCount: 2,
    });
    expect(guard.beyondGenerated).toBe(false);
    expect(guard.warningMessage).toBeNull();
    const gate = applySignerSetupGeneratedPartyGuardToGate(
      resolvePaidProSignerDetailsGate({
        partyCount: 2,
        draftPartyNames: ["Alpha LLC", "Beta Inc"],
        partySignerNames: removed!.partySignerNames,
        recipient1Name: "Alpha LLC",
        recipient2Name: "Beta Inc",
        recipient1Email: "a@example.test",
        recipient2Email: "b@example.test",
        extraPartyReviewEmails: removed!.extraPartyReviewEmails,
        extraPartyLegalNames: removed!.extraPartyLegalNames,
        userExpandedPartyCount: 2,
      }),
      guard,
      PAID_PRO_SIGNER_DETAILS_INCOMPLETE_CTA,
    );
    expect(gate.complete).toBe(true);
    expect(gate.ctaLabel).toBe(PAID_PRO_SIGNER_DETAILS_COMPLETE_CTA);
  });

  it("generated 3-party draft allows Party 3 without warning", () => {
    const generated = resolveGeneratedAgreementPartyCount({
      draftParties: [
        { name: "Alpha LLC" },
        { name: "Beta Inc" },
        { name: "Gamma Corp" },
      ],
      corpusPlain: threePartyCorpus,
    });
    expect(generated).toBe(3);
    const guard = evaluateSignerSetupGeneratedPartyGuard({
      signerSetupUiPartyCount: 3,
      generatedPartyCount: generated,
    });
    expect(guard.beyondGenerated).toBe(false);
    expect(isSignerSetupBeyondGeneratedPartyCount({ signerSetupUiPartyCount: 3, generatedPartyCount: 3 })).toBe(
      false,
    );
  });

  it("Party 1 and Party 2 cannot be removed", () => {
    expect(canRemoveSignerSetupParty(0, 3)).toBe(false);
    expect(canRemoveSignerSetupParty(1, 3)).toBe(false);
    expect(canRemoveSignerSetupParty(2, 3)).toBe(true);
    expect(removeAddedSignerPartyState(0, { ...baseTwoPartyState, signerSetupUiPartyCount: 3 })).toBeNull();
    expect(removeAddedSignerPartyState(1, { ...baseTwoPartyState, signerSetupUiPartyCount: 3 })).toBeNull();
  });

  it("warning copy uses generated party count", () => {
    expect(formatSignerSetupBeyondGeneratedWarningTitle(2)).toBe(
      "This agreement was drafted for 2 legal parties.",
    );
    expect(formatSignerSetupBeyondGeneratedWarningTitle(4)).toBe(
      "This agreement was drafted for 4 legal parties.",
    );
    expect(formatSignerSetupBeyondGeneratedWarningBody()).toContain(
      "regenerate the agreement so the agreement text",
    );
    expect(formatSignerSetupBeyondGeneratedWarning(2)).toContain(
      "review flow, signature blocks, signer roles, and signing invitations",
    );
  });
});

describe("PaidProCoordinatorToggle", () => {
  it("renders coordinator toggle with label and helper", () => {
    const onChange = vi.fn();
    render(<PaidProCoordinatorToggle checked={false} onChange={onChange} />);
    expect(screen.getByTestId("paid-pro-coordinator-toggle")).toBeTruthy();
    expect(screen.getByText(/coordinating this agreement/i)).toBeTruthy();
    fireEvent.click(screen.getByTestId("paid-pro-coordinator-toggle-input"));
    expect(onChange).toHaveBeenCalledWith(true);
  });
});
