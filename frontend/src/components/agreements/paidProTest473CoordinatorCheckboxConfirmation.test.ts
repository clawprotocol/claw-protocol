/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgreementDraft } from "../../agreement/agreementTypes";
import { buildAgreementVs01BridgeSession } from "../../launch/simpleProduct/agreementToVs01SigningBridge";
import { buildVs01SigningPacketModel } from "../../vs01/buildVs01SigningPacketModel";
import { buildPrepareBridgeCorpusGateArgs } from "../../vs01/vs01PrepareBridgeCorpus";
import { resetCoordinatorCheckboxDiagnosticsForTests } from "./paidProCoordinatorCheckboxAuthority";
import {
  countOperativeIfToNoticeStanzas,
  ensureOperativeIfToNoticeDelivery,
} from "./paidProPartyNoticeDetails";
import {
  buildVs01PrepareSigningRolesForBridge,
} from "./paidProNPartySignerSetup";
import {
  TEST496_COORDINATOR_EMAIL,
  TEST496_COORDINATOR_NAME,
  TEST496_THREE_PARTY_COORDINATING_INTAKE,
  TEST496_THREE_PARTY_LEGAL,
  test496RecipientSetup,
  test496ThreePartyDraft,
} from "./paidProTest496Fixtures";
import { TEST494_SIGNERS, buildTest494ThreePartySection10Corpus } from "./paidProTest494Fixtures";

function authorityPartiesFrom494() {
  return TEST494_SIGNERS.map((party, partyIndex) => ({ ...party, partyIndex }));
}

describe("TEST473 — coordinator checkbox read and enforced in live Pro → VS01 flow", () => {
  beforeEach(() => {
    resetCoordinatorCheckboxDiagnosticsForTests();
    vi.spyOn(console, "info").mockImplementation(() => {});
  });

  afterEach(() => {
    resetCoordinatorCheckboxDiagnosticsForTests();
    vi.restoreAllMocks();
  });

  it("when checked: logs authority + VS01 diagnostics and excludes coordinator from parties/notices/roles/invites", () => {
    const draft = test496ThreePartyDraft(true) as unknown as AgreementDraft;
    const setup = test496RecipientSetup({
      creatorCoordinatorOnly: true,
      partyCount: 3,
      legalNames: TEST496_THREE_PARTY_LEGAL,
    });
    const corpus = buildTest494ThreePartySection10Corpus();

    const bridge = buildAgreementVs01BridgeSession({
      vs01DocumentId: "doc_test473",
      agreementId: "ag_test473",
      draft,
      recipientSetup: setup,
      agreementCorpusText: corpus,
      senderFirstLawdogHandoff: true,
      reviewerApprovedCleanHandoff: true,
    });

    expect(bridge.creatorIsParty).toBe(false);
    expect(bridge.legalParties).toHaveLength(3);

    const roles = buildVs01PrepareSigningRolesForBridge({
      agreementId: bridge.agreementId,
      creatorName: TEST496_COORDINATOR_NAME,
      creatorEmail: TEST496_COORDINATOR_EMAIL,
      counterparties: bridge.counterparties ?? [],
      bridge,
    });
    expect(roles).toHaveLength(3);

    const roleEmails = roles.map((r) => r.signerEmail).filter(Boolean);
    const roleEntities = roles.map((r) => r.entityName);
    expect(roleEmails).not.toContain(TEST496_COORDINATOR_EMAIL);
    expect(roleEntities).not.toContain(TEST496_COORDINATOR_NAME);
    for (const legalName of TEST496_THREE_PARTY_LEGAL) {
      expect(
        roleEntities.some(
          (name) => name.replace(/\.$/, "").toLowerCase() === legalName.replace(/\.$/, "").toLowerCase(),
        ),
      ).toBe(true);
    }

    const notices = ensureOperativeIfToNoticeDelivery(corpus, authorityPartiesFrom494(), {
      intakeText: TEST496_THREE_PARTY_COORDINATING_INTAKE,
    });
    expect(countOperativeIfToNoticeStanzas(notices.text)).toBe(3);
    expect(notices.text).not.toMatch(new RegExp(TEST496_COORDINATOR_NAME, "i"));
    expect(notices.text).not.toMatch(new RegExp(TEST496_COORDINATOR_EMAIL.replace(/[.+@]/g, "\\$&"), "i"));

    const model = buildVs01SigningPacketModel({
      mode: "guided_pro",
      authoritativeCorpusPlain: corpus,
      roles,
      initialsEnabled: false,
      bridge,
      draft,
      corpusGateArgs: buildPrepareBridgeCorpusGateArgs({
        agreementCorpusText: corpus,
        bridge,
        draft,
      }),
    });
    expect(model.diagnostics.expectedSignerCount).toBe(3);

    const authorityLog = vi.mocked(console.info).mock.calls.find(
      (call) => call[0] === "[coordinator-checkbox-authority]",
    );
    expect(authorityLog?.[1]).toEqual({
      checked: true,
      creatorIsParty: false,
      source: "recipient_setup",
    });

    const vs01Log = vi.mocked(console.info).mock.calls.find(
      (call) => call[0] === "[coordinator-checkbox-vs01]",
    );
    expect(vs01Log?.[1]).toMatchObject({
      checked: true,
      creatorIsParty: false,
      legalPartyCount: 3,
      signerInviteCount: 3,
      coordinatorExcludedFromSignerRoles: true,
    });

    buildAgreementVs01BridgeSession({
      vs01DocumentId: "doc_test473",
      agreementId: "ag_test473",
      draft,
      recipientSetup: setup,
      agreementCorpusText: corpus,
      senderFirstLawdogHandoff: true,
    });
    const authorityLogCount = vi.mocked(console.info).mock.calls.filter(
      (call) => call[0] === "[coordinator-checkbox-authority]",
    ).length;
    expect(authorityLogCount).toBe(1);

    buildVs01SigningPacketModel({
      mode: "guided_pro",
      authoritativeCorpusPlain: corpus,
      roles,
      initialsEnabled: false,
      bridge,
      draft,
      corpusGateArgs: buildPrepareBridgeCorpusGateArgs({
        agreementCorpusText: corpus,
        bridge,
        draft,
      }),
    });
    const vs01LogCount = vi.mocked(console.info).mock.calls.filter(
      (call) => call[0] === "[coordinator-checkbox-vs01]",
    ).length;
    expect(vs01LogCount).toBe(1);
  });
});
