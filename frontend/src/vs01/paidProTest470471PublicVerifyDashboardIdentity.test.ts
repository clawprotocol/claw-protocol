/** @vitest-environment jsdom */
/** TEST470–471 — public-verify-only dashboard reconstruction + missing identity invariant. */

import { beforeEach, describe, expect, it } from "vitest";
import type { PublicVerifyPayload } from "../agreement/agreementPublicVerify";
import {
  packetStatusFromPublicVerify,
  reconstructHandoffFromPortable,
} from "../launch/ownerSigningStatusResolver";
import {
  TEST440_BRIGHT_PEAK,
  TEST440_EVERGREEN,
} from "../components/agreements/paidProTest440BrandLicensingDegradedRecoveryFixtures";
import { writePaidProVs01PostSignHandoff } from "./vs01PaidProPostSignHandoff";
import {
  buildTest463FourPartyPreparePacket,
  test463RoleByEntity,
} from "./paidProTest463Fixtures";
import {
  buildPacketStatusCards,
  countSignedSigners,
} from "./vs01SigningPacketStatusCards";
import {
  VS01_COMPLETION_EVENT_MISSING_IDENTITY,
  Vs01CompletionEventMissingIdentityError,
} from "./vs01PublicVerifyCompletionIdentity";

function brightPeakCompletionVerify(
  brightPeakRoleId: string,
  participantId: string,
): PublicVerifyPayload {
  return {
    agreement_id: "ag_test463",
    summary: { title: "Four-party agreement" },
    participants: [],
    version_history: [],
    signature_status: {
      fully_executed: false,
      signatures_recorded: 1,
      signer_party_count: 4,
      locked_version_id: "v1",
    },
    signature_events: [
      {
        event_type: "signature_completed",
        signer_role_id: brightPeakRoleId,
        participant_id: participantId,
        participant_display_name: "Benton Reese",
        typed_name: "Benton Reese",
      },
    ],
    verification: { agreement_hash: "abc" },
  };
}

describe("TEST470 dashboard reconstruction after reload", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it("reconstructs BrightPeak signed from public verify only after storage wipe", () => {
    const { roles, portable } = buildTest463FourPartyPreparePacket();
    const ownerRole = test463RoleByEntity(TEST440_EVERGREEN, roles);
    const brightPeakRole = test463RoleByEntity(TEST440_BRIGHT_PEAK, roles);

    writePaidProVs01PostSignHandoff({
      v: 1,
      agreementId: "ag_test463",
      agreementTitle: "Four-party agreement",
      vs01DocumentId: portable.seed.documentId,
      receiptId: "",
      receiptHashSha256: null,
      savedAt: portable.seed.savedAt,
      packetPrepareOnly: true,
      ownerSignerRoleId: ownerRole.roleId,
      ownerSigningUrl: "",
      signers: [],
    });

    localStorage.clear();
    sessionStorage.clear();

    const handoff = reconstructHandoffFromPortable(portable, "Four-party agreement");
    expect(handoff?.signers).toHaveLength(3);

    const verify = brightPeakCompletionVerify(
      brightPeakRole.roleId,
      brightPeakRole.vs01CounterpartyId ?? brightPeakRole.partyId,
    );

    const snap = packetStatusFromPublicVerify(verify, handoff!, ownerRole.roleId);

    expect(snap.bySignerKey[ownerRole.roleId]).toBe("waiting");
    expect(snap.bySignerKey[brightPeakRole.roleId]).toBe("signed");

    const cards = buildPacketStatusCards({
      handoff: handoff!,
      roles,
      statusByKey: snap.bySignerKey,
      ownerSigningUrl: "",
    });
    const { signed, total } = countSignedSigners(
      snap.bySignerKey,
      cards.map((c) => c.key),
    );
    expect(total).toBe(4);
    expect(signed).toBe(1);
    expect(cards.find((c) => c.status === "signed")?.partyName).toContain("BrightPeak");
  });

  it("does not keep stale local signed attribution after storage wipe + public verify", () => {
    const { roles, handoff } = buildTest463FourPartyPreparePacket();
    const ownerRole = test463RoleByEntity(TEST440_EVERGREEN, roles);
    const brightPeakRole = test463RoleByEntity(TEST440_BRIGHT_PEAK, roles);

    localStorage.setItem(
      `vs01_signing_packet_status_v1:ag_test463`,
      JSON.stringify({
        agreementId: "ag_test463",
        updatedAt: new Date().toISOString(),
        bySignerKey: {
          [ownerRole.roleId]: "signed",
          [brightPeakRole.roleId]: "waiting",
        },
        fullySigned: false,
      }),
    );

    localStorage.clear();

    const verify = brightPeakCompletionVerify(
      brightPeakRole.roleId,
      brightPeakRole.vs01CounterpartyId ?? brightPeakRole.partyId,
    );
    const snap = packetStatusFromPublicVerify(verify, handoff, ownerRole.roleId);

    expect(snap.bySignerKey[ownerRole.roleId]).toBe("waiting");
    expect(snap.bySignerKey[brightPeakRole.roleId]).toBe("signed");
  });
});

describe("TEST471 missing identity invariant", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("throws when signature_completed lacks signer_role_id", () => {
    const { roles, handoff } = buildTest463FourPartyPreparePacket();
    const ownerRole = test463RoleByEntity(TEST440_EVERGREEN, roles);

    const verify: PublicVerifyPayload = {
      agreement_id: "ag_test463",
      summary: { title: "Four-party agreement" },
      participants: [],
      version_history: [],
      signature_status: {
        fully_executed: false,
        signatures_recorded: 1,
        signer_party_count: 4,
        locked_version_id: "v1",
      },
      signature_events: [
        {
          event_type: "signature_completed",
          participant_display_name: "Benton Reese",
          typed_name: "Benton Reese",
        },
      ],
      verification: { agreement_hash: "abc" },
    };

    expect(() => packetStatusFromPublicVerify(verify, handoff, ownerRole.roleId)).toThrow(
      Vs01CompletionEventMissingIdentityError,
    );
    expect(() => packetStatusFromPublicVerify(verify, handoff, ownerRole.roleId)).toThrow(
      VS01_COMPLETION_EVENT_MISSING_IDENTITY,
    );
  });

  it("does not mark any signer when identity is missing", () => {
    const { roles, handoff } = buildTest463FourPartyPreparePacket();
    const ownerRole = test463RoleByEntity(TEST440_EVERGREEN, roles);
    const brightPeakRole = test463RoleByEntity(TEST440_BRIGHT_PEAK, roles);

    const verify: PublicVerifyPayload = {
      agreement_id: "ag_test463",
      summary: { title: "Four-party agreement" },
      participants: [],
      version_history: [],
      signature_status: {
        fully_executed: false,
        signatures_recorded: 1,
        signer_party_count: 4,
      },
      signature_events: [
        {
          event_type: "signature_completed",
          participant_id: brightPeakRole.vs01CounterpartyId ?? brightPeakRole.partyId,
          participant_display_name: "Benton Reese",
        },
      ],
      verification: { agreement_hash: "abc" },
    };

    expect(() => packetStatusFromPublicVerify(verify, handoff, ownerRole.roleId)).toThrow(
      Vs01CompletionEventMissingIdentityError,
    );
  });
});
