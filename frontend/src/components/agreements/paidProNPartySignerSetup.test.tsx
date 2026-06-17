/** @vitest-environment jsdom */
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PaidProCoordinatorToggle } from "./PaidProCoordinatorToggle";
import {
  PAID_PRO_SIGNER_SETUP_MAX_UI_PARTIES,
  buildLegalPartiesFromSignerSetupState,
  buildVs01PrepareSigningRolesForBridge,
  canAddAnotherSignerParty,
  resolveSignerSetupUiPartyCount,
} from "./paidProNPartySignerSetup";
import { resolvePaidProSignerDetailsGate } from "./signerSetupPartyIdentity";
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

  it("respects user-expanded party count for gate and UI (3 parties)", () => {
    expect(
      resolveAuthoritativePartySlotCount({
        intakeText: "between Alpha LLC and Beta Inc",
        draftPartyNames: ["Alpha LLC", "Beta Inc", "Gamma Corp"],
        rawPartyCount: 3,
        userExpandedPartyCount: 3,
      }),
    ).toBe(3);
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
