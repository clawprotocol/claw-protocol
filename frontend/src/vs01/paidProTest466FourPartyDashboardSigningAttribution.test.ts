/** @vitest-environment jsdom */
/** TEST466–468 — four-party dashboard signing attribution uses canonical role identity. */

import { beforeEach, describe, expect, it } from "vitest";
import type { PublicVerifyPayload } from "../agreement/agreementPublicVerify";
import { resolveRequiredSignerCount } from "../agreement/resolveRequiredSignerCount";
import {
  TEST440_ATLAS,
  TEST440_BRIGHT_PEAK,
  TEST440_EVERGREEN,
  TEST440_HORIZON,
} from "../components/agreements/paidProTest440BrandLicensingDegradedRecoveryFixtures";
import { packetStatusFromPublicVerify } from "../launch/ownerSigningStatusResolver";
import {
  buildTest463FourPartyPreparePacket,
  test463RoleByEntity,
} from "./paidProTest463Fixtures";
import {
  buildPacketStatusCards,
  countSignedSigners,
} from "./vs01SigningPacketStatusCards";
import { VS01_COMPLETION_EVENT_MISSING_IDENTITY } from "./vs01PublicVerifyCompletionIdentity";

function fourPartyVerify(args: {
  signaturesRecorded: number;
  events: PublicVerifyPayload["signature_events"];
}): PublicVerifyPayload {
  return {
    agreement_id: "ag_test463",
    summary: { title: "Four-party agreement" },
    participants: [],
    version_history: [],
    signature_status: {
      fully_executed: false,
      signatures_recorded: args.signaturesRecorded,
      signer_party_count: 4,
      locked_version_id: "v1",
    },
    signature_events: args.events,
    verification: { agreement_hash: "abc" },
  };
}

function completionEvent(args: {
  signerRoleId: string;
  participantId: string;
  displayName: string;
}): PublicVerifyPayload["signature_events"][number] {
  return {
    event_type: "signature_completed",
    signer_role_id: args.signerRoleId,
    participant_id: args.participantId,
    participant_display_name: args.displayName,
    typed_name: args.displayName,
  };
}

describe("TEST466 four-party dashboard signing attribution", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("TEST466 marks only BrightPeak signed when partyIndex 3 completes (not Evergreen)", () => {
    const { roles, handoff } = buildTest463FourPartyPreparePacket();
    const ownerRole = test463RoleByEntity(TEST440_EVERGREEN, roles);
    const brightPeakRole = test463RoleByEntity(TEST440_BRIGHT_PEAK, roles);

    const snap = packetStatusFromPublicVerify(
      fourPartyVerify({
        signaturesRecorded: 1,
        events: [
          completionEvent({
            signerRoleId: brightPeakRole.roleId,
            participantId: brightPeakRole.vs01CounterpartyId ?? "party_brightpeak",
            displayName: "Benton Reese",
          }),
        ],
      }),
      handoff,
      ownerRole.roleId,
    );

    expect(snap.bySignerKey[ownerRole.roleId]).toBe("waiting");
    expect(snap.bySignerKey[brightPeakRole.roleId]).toBe("signed");

    const cards = buildPacketStatusCards({
      handoff,
      roles,
      statusByKey: snap.bySignerKey,
      ownerSigningUrl: "",
    });
    expect(cards).toHaveLength(4);
    const { signed, total } = countSignedSigners(
      snap.bySignerKey,
      cards.map((c) => c.key),
    );
    expect(total).toBe(4);
    expect(signed).toBe(1);
    expect(cards.find((c) => c.status === "signed")?.partyName).toContain("BrightPeak");
    expect(cards.find((c) => c.isOwner)?.status).toBe("waiting");
  });

  it("throws when signature_completed lacks signer_role_id (no name inference)", () => {
    const { roles, handoff } = buildTest463FourPartyPreparePacket();
    const ownerRole = test463RoleByEntity(TEST440_EVERGREEN, roles);

    expect(() =>
      packetStatusFromPublicVerify(
        fourPartyVerify({
          signaturesRecorded: 1,
          events: [
            {
              event_type: "signature_completed",
              participant_display_name: "Benton Reese",
              typed_name: "Benton Reese",
            },
          ],
        }),
        handoff,
        ownerRole.roleId,
      ),
    ).toThrow(VS01_COMPLETION_EVENT_MISSING_IDENTITY);
  });
});

describe("TEST467 each counterparty completion stays isolated", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  const counterpartyCases = [
    { entity: TEST440_ATLAS, displayName: "Ann Center" },
    { entity: TEST440_HORIZON, displayName: "Hans Wiener" },
    { entity: TEST440_BRIGHT_PEAK, displayName: "Benton Reese" },
  ] as const;

  for (const { entity, displayName } of counterpartyCases) {
    it(`only ${entity} is signed when that role completes`, () => {
      const { roles, handoff } = buildTest463FourPartyPreparePacket();
      const ownerRole = test463RoleByEntity(TEST440_EVERGREEN, roles);
      const targetRole = test463RoleByEntity(entity, roles);

      const snap = packetStatusFromPublicVerify(
        fourPartyVerify({
          signaturesRecorded: 1,
          events: [
            completionEvent({
              signerRoleId: targetRole.roleId,
              participantId: targetRole.vs01CounterpartyId ?? targetRole.partyId,
              displayName,
            }),
          ],
        }),
        handoff,
        ownerRole.roleId,
      );

      expect(snap.bySignerKey[ownerRole.roleId]).toBe("waiting");
      expect(snap.bySignerKey[targetRole.roleId]).toBe("signed");

      const cards = buildPacketStatusCards({
        handoff,
        roles,
        statusByKey: snap.bySignerKey,
        ownerSigningUrl: "",
      });
      expect(cards.filter((c) => c.status === "signed")).toHaveLength(1);
      expect(cards.find((c) => c.status === "signed")?.roleId).toBe(targetRole.roleId);
    });
  }
});

describe("TEST468 dashboard authority keeps four participants", () => {
  it("requiredPartyCount and partyStatuses stay at four for VS01 packet", () => {
    const { roles, handoff } = buildTest463FourPartyPreparePacket();
    const ownerRole = test463RoleByEntity(TEST440_EVERGREEN, roles);

    const snap = packetStatusFromPublicVerify(
      fourPartyVerify({ signaturesRecorded: 0, events: [] }),
      handoff,
      ownerRole.roleId,
    );

    const requiredCount = resolveRequiredSignerCount({
      signerPartyCount: 4,
      packetStatusSignerKeyCount: Object.keys(snap.bySignerKey).length,
      handoffSignerCount: 1 + handoff.signers.length,
    });
    expect(requiredCount).toBe(4);

    const cards = buildPacketStatusCards({
      handoff,
      roles,
      statusByKey: snap.bySignerKey,
      ownerSigningUrl: "",
    });
    expect(cards).toHaveLength(4);
    expect(Object.keys(snap.bySignerKey)).toHaveLength(4);
  });
});
