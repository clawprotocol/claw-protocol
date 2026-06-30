/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import type { AgreementDraft } from "../../agreement/agreementTypes";
import { buildAgreementVs01BridgeSession } from "../../launch/simpleProduct/agreementToVs01SigningBridge";
import {
  createCoordinatorProfile,
  legalPartyIdentitiesExcludingCoordinator,
  normalizePartyIdentities,
} from "./canonicalPartyIdentityModel";
import {
  resolveCreatorCoordinatorOnlyChecked,
  resolveCreatorIsPartyFromCheckbox,
  resolveUserIsCoordinatorOnlyFromCheckbox,
} from "./paidProCoordinatorCheckboxAuthority";
import {
  countOperativeIfToNoticeStanzas,
  ensureOperativeIfToNoticeDelivery,
} from "./paidProPartyNoticeDetails";
import {
  buildLegalPartiesFromSignerSetupState,
  buildVs01PrepareSigningRolesForBridge,
  mergeNPartySignerSetupIntoDraft,
  paidProSignerSetupUiStateFromRecipientSetup,
} from "./paidProNPartySignerSetup";
import { assessStarterComplexityGate } from "./starterMultiPartyProGate";
import {
  TEST496_COORDINATOR_EMAIL,
  TEST496_COORDINATOR_NAME,
  TEST496_FOUR_PARTY_COORDINATING_INTAKE,
  TEST496_FOUR_PARTY_LEGAL,
  TEST496_NON_COORDINATING_TWO_PARTY_INTAKE,
  TEST496_THREE_PARTY_COORDINATING_INTAKE,
  TEST496_THREE_PARTY_LEGAL,
  test496RecipientSetup,
  test496ThreePartyDraft,
} from "./paidProTest496Fixtures";
import { TEST494_SIGNERS, buildTest494ThreePartySection10Corpus } from "./paidProTest494Fixtures";

function authorityPartiesFrom494() {
  return TEST494_SIGNERS.map((party, partyIndex) => ({ ...party, partyIndex }));
}

describe("TEST496 checkbox authority resolver", () => {
  it("prefers recipient setup checkbox over draft when they conflict", () => {
    expect(
      resolveCreatorCoordinatorOnlyChecked({
        draft: { creator_coordinator_only: true },
        recipientSetup: { creatorCoordinatorOnly: false },
      }),
    ).toEqual({ checked: false, source: "recipient_setup" });
    expect(
      resolveCreatorIsPartyFromCheckbox({
        draft: { creator_coordinator_only: true },
        recipientSetup: { creatorCoordinatorOnly: false },
      }),
    ).toBe(true);
  });
});

describe("TEST496A — coordinator checkbox checked", () => {
  it("persists checked flag on draft and recipient setup", () => {
    const draft = test496ThreePartyDraft(true) as unknown as AgreementDraft;
    const setup = test496RecipientSetup({
      creatorCoordinatorOnly: true,
      partyCount: 3,
      legalNames: TEST496_THREE_PARTY_LEGAL,
    });
    const merged = mergeNPartySignerSetupIntoDraft(draft, setup);
    expect(merged?.creator_coordinator_only).toBe(true);
    expect(resolveCreatorCoordinatorOnlyChecked({ draft: merged, recipientSetup: setup }).checked).toBe(true);
    expect(resolveCreatorCoordinatorOnlyChecked({ draft: merged, recipientSetup: setup }).source).toBe(
      "recipient_setup",
    );
  });

  it("excludes coordinator from bridge roles, notices, and invite emails for 3-party coordinating intake", () => {
    const draft = test496ThreePartyDraft(true) as unknown as AgreementDraft;
    const setup = test496RecipientSetup({
      creatorCoordinatorOnly: true,
      partyCount: 3,
      legalNames: TEST496_THREE_PARTY_LEGAL,
    });
    const bridge = buildAgreementVs01BridgeSession({
      vs01DocumentId: "doc496a",
      agreementId: "ag496a",
      draft,
      recipientSetup: setup,
      agreementCorpusText: buildTest494ThreePartySection10Corpus(),
      senderFirstLawdogHandoff: true,
      reviewerApprovedCleanHandoff: true,
    });
    expect(bridge.creatorIsParty).toBe(false);
    expect(resolveCreatorIsPartyFromCheckbox({ draft, recipientSetup: setup })).toBe(false);

    const ui = paidProSignerSetupUiStateFromRecipientSetup(
      draft.parties ?? [],
      setup,
      setup.recipientPartySignerNames ?? [],
      setup.recipientPartySignerTitles ?? [],
    );
    const legalParties = buildLegalPartiesFromSignerSetupState(ui);
    expect(legalParties).toHaveLength(3);
    expect(legalParties.every((p) => p.role === "party")).toBe(true);
    for (const legalName of TEST496_THREE_PARTY_LEGAL) {
      expect(
        legalParties.some(
          (p) => p.name.replace(/\.$/, "").toLowerCase() === legalName.replace(/\.$/, "").toLowerCase(),
        ),
      ).toBe(true);
    }

    const roles = buildVs01PrepareSigningRolesForBridge({
      agreementId: bridge.agreementId,
      creatorName: TEST496_COORDINATOR_NAME,
      creatorEmail: TEST496_COORDINATOR_EMAIL,
      counterparties: bridge.counterparties ?? [],
      bridge,
    });
    expect(roles).toHaveLength(3);
    expect(roles.some((r) => r.signerEmail === TEST496_COORDINATOR_EMAIL)).toBe(false);
    expect(roles.some((r) => r.entityName === TEST496_COORDINATOR_NAME)).toBe(false);
    for (const legalName of TEST496_THREE_PARTY_LEGAL) {
      expect(
        roles.some(
          (r) =>
            r.entityName.replace(/\.$/, "").toLowerCase() === legalName.replace(/\.$/, "").toLowerCase(),
        ),
      ).toBe(true);
    }

    const inviteEmails = roles.map((r) => r.signerEmail).filter(Boolean);
    expect(inviteEmails).not.toContain(TEST496_COORDINATOR_EMAIL);

    const coordinator = createCoordinatorProfile({
      isUser: true,
      email: TEST496_COORDINATOR_EMAIL,
      displayName: TEST496_COORDINATOR_NAME,
      userRelation: "coordinator",
    });
    const identities = normalizePartyIdentities({
      intakeText: TEST496_THREE_PARTY_COORDINATING_INTAKE,
      authorityParties: authorityPartiesFrom494(),
      userIsCoordinatorOnly: resolveUserIsCoordinatorOnlyFromCheckbox({ draft, recipientSetup: setup }),
      coordinator,
    });
    const legal = legalPartyIdentitiesExcludingCoordinator(
      identities,
      coordinator,
      resolveUserIsCoordinatorOnlyFromCheckbox({ draft, recipientSetup: setup }),
    );
    expect(legal.some((p) => /paige orchestrator|coordinator/i.test(p.legalName))).toBe(false);

    const notices = ensureOperativeIfToNoticeDelivery(
      buildTest494ThreePartySection10Corpus(),
      authorityPartiesFrom494(),
      { intakeText: TEST496_THREE_PARTY_COORDINATING_INTAKE },
    );
    expect(countOperativeIfToNoticeStanzas(notices.text)).toBe(3);
    expect(notices.text).not.toMatch(/If to Paige Orchestrator/i);
    expect(notices.text).not.toMatch(/If to Coordinator/i);
  });

  it("excludes coordinator from 4-party packet roles when checkbox is checked", () => {
    const draft = {
      title: "Four-party platform agreement",
      creator_coordinator_only: true,
      parties: TEST496_FOUR_PARTY_LEGAL.map((name, i) => ({
        id: `party_${i}`,
        name,
        role: "party",
        email: `${i}@example.test`,
      })),
    } as AgreementDraft;
    const setup = test496RecipientSetup({
      creatorCoordinatorOnly: true,
      partyCount: 4,
      legalNames: TEST496_FOUR_PARTY_LEGAL,
    });
    const bridge = buildAgreementVs01BridgeSession({
      vs01DocumentId: "doc496a4",
      agreementId: "ag496a4",
      draft,
      recipientSetup: setup,
      agreementCorpusText: buildTest494ThreePartySection10Corpus(),
    });
    expect(bridge.creatorIsParty).toBe(false);
    const roles = buildVs01PrepareSigningRolesForBridge({
      agreementId: bridge.agreementId,
      creatorName: TEST496_COORDINATOR_NAME,
      creatorEmail: TEST496_COORDINATOR_EMAIL,
      counterparties: bridge.counterparties ?? [],
      bridge,
    });
    expect(roles).toHaveLength(4);
    expect(roles.every((r) => TEST496_FOUR_PARTY_LEGAL.includes(r.entityName as (typeof TEST496_FOUR_PARTY_LEGAL)[number]))).toBe(
      true,
    );
    expect(assessStarterComplexityGate(TEST496_FOUR_PARTY_COORDINATING_INTAKE).partyCount).toBeGreaterThanOrEqual(4);
  });
});

describe("TEST496B — coordinator checkbox unchecked", () => {
  it("keeps default owner/sender flow for two-party intake when checkbox is off", () => {
    const draft = {
      title: "Services Agreement",
      creator_coordinator_only: false,
      parties: [
        { id: "p1", name: "Red Mesa Logistics LLC", role: "owner", email: "owner@example.test" },
        { id: "p2", name: "Harbor Peak Automation LLC", role: "party", email: "cp@example.test" },
      ],
    } as AgreementDraft;
    const setup = {
      creatorCoordinatorOnly: false,
      signerSetupUiPartyCount: 2,
      recipient1Name: "Red Mesa Logistics LLC",
      recipient2Name: "Harbor Peak Automation LLC",
      recipient1Email: "owner@example.test",
      recipient2Email: "cp@example.test",
      recipientPartySignerNames: ["Owner Signer", "Counter Signer"],
      recipientPartySignerTitles: ["CEO", "President"],
    };
    expect(resolveCreatorCoordinatorOnlyChecked({ draft, recipientSetup: setup }).checked).toBe(false);

    const bridge = buildAgreementVs01BridgeSession({
      vs01DocumentId: "doc496b",
      agreementId: "ag496b",
      draft,
      recipientSetup: setup,
      agreementCorpusText: buildTest494ThreePartySection10Corpus(),
    });
    expect(bridge.creatorIsParty).toBe(true);

    const ui = paidProSignerSetupUiStateFromRecipientSetup(
      draft.parties ?? [],
      setup,
      setup.recipientPartySignerNames ?? [],
      setup.recipientPartySignerTitles ?? [],
    );
    const legalParties = buildLegalPartiesFromSignerSetupState(ui);
    expect(legalParties[0]?.role).toBe("owner");
    expect(legalParties[1]?.role).toBe("party");

    const roles = buildVs01PrepareSigningRolesForBridge({
      agreementId: bridge.agreementId,
      creatorName: "Red Mesa Logistics LLC",
      creatorEmail: "owner@example.test",
      counterparties: bridge.counterparties ?? [],
      bridge,
    });
    expect(roles).toHaveLength(2);
    expect(roles[0]?.kind).toBe("owner");
    expect(roles[0]?.entityName).toBe("Red Mesa Logistics LLC");
  });

  it("checkbox unchecked wins over coordinating intake prose (owner flow on 3-party prompt)", () => {
    const draft = test496ThreePartyDraft(false) as unknown as AgreementDraft;
    const setup = test496RecipientSetup({
      creatorCoordinatorOnly: false,
      partyCount: 3,
      legalNames: TEST496_THREE_PARTY_LEGAL,
    });
    expect(
      resolveCreatorCoordinatorOnlyChecked({ draft, recipientSetup: setup }).source,
    ).toBe("recipient_setup");

    const bridge = buildAgreementVs01BridgeSession({
      vs01DocumentId: "doc496conflict",
      agreementId: "ag496conflict",
      draft,
      recipientSetup: setup,
      agreementCorpusText: buildTest494ThreePartySection10Corpus(),
    });
    expect(bridge.creatorIsParty).toBe(true);

    const ui = paidProSignerSetupUiStateFromRecipientSetup(
      draft.parties ?? [],
      setup,
      setup.recipientPartySignerNames ?? [],
      setup.recipientPartySignerTitles ?? [],
    );
    expect(buildLegalPartiesFromSignerSetupState(ui)[0]?.role).toBe("owner");

    const roles = buildVs01PrepareSigningRolesForBridge({
      agreementId: bridge.agreementId,
      creatorName: TEST496_THREE_PARTY_LEGAL[0]!,
      creatorEmail: setup.recipient1Email,
      counterparties: bridge.counterparties ?? [],
      bridge,
    });
    expect(roles[0]?.kind).toBe("owner");
    expect(roles.some((r) => r.signerEmail === TEST496_COORDINATOR_EMAIL)).toBe(false);
  });

  it("checkbox checked wins when intake prose does not mention coordinating", () => {
    const draft = {
      title: "Two-party agreement",
      creator_coordinator_only: true,
      parties: [
        { id: "p1", name: "Red Mesa Logistics LLC", role: "party", email: "a@example.test" },
        { id: "p2", name: "Harbor Peak Automation LLC", role: "party", email: "b@example.test" },
      ],
    } as AgreementDraft;
    const setup = {
      creatorCoordinatorOnly: true,
      signerSetupUiPartyCount: 2,
      recipient1Name: "Red Mesa Logistics LLC",
      recipient2Name: "Harbor Peak Automation LLC",
      recipient1Email: "a@example.test",
      recipient2Email: "b@example.test",
      recipientPartySignerNames: ["Alice", "Bob"],
      recipientPartySignerTitles: ["CEO", "President"],
    };
    const bridge = buildAgreementVs01BridgeSession({
      vs01DocumentId: "doc496checked",
      agreementId: "ag496checked",
      draft,
      recipientSetup: setup,
      agreementCorpusText: buildTest494ThreePartySection10Corpus(),
    });
    expect(bridge.creatorIsParty).toBe(false);
    expect(assessStarterComplexityGate(TEST496_NON_COORDINATING_TWO_PARTY_INTAKE).hasCoordinator).toBe(false);
    const roles = buildVs01PrepareSigningRolesForBridge({
      agreementId: bridge.agreementId,
      creatorName: TEST496_COORDINATOR_NAME,
      creatorEmail: TEST496_COORDINATOR_EMAIL,
      counterparties: bridge.counterparties ?? [],
      bridge,
    });
    expect(roles).toHaveLength(2);
    expect(roles.every((r) => r.kind !== "owner")).toBe(true);
  });
});
