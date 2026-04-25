import { describe, expect, it } from "vitest";
import {
  buildSimpleSendHandoff,
  resolveSimpleSendOpenPhase,
  resolveSimpleSendPhaseFromHandoff,
} from "./simpleSendHandoff";

describe("simpleSendHandoff contract", () => {
  it("starter/basic handoff defaults to review phase", () => {
    const handoff = buildSimpleSendHandoff({
      agreementId: "ag_starter",
      primedDraft: null,
      streamlinedSimpleFlow: false,
      premiumSendIntent: null,
    });
    expect(handoff.premiumSendIntent).toBeNull();
    expect(
      resolveSimpleSendPhaseFromHandoff({
        requestedPhase: null,
        canAccessSendActions: false,
        premiumIntent: handoff.premiumSendIntent,
      }),
    ).toBe("review");
  });

  it("premium collaborate intent keeps review-phase destination", () => {
    const handoff = buildSimpleSendHandoff({
      agreementId: "ag_collab",
      primedDraft: null,
      streamlinedSimpleFlow: true,
      premiumSendIntent: "review",
    });
    expect(handoff.premiumSendIntent).toBe("review");
    expect(
      resolveSimpleSendPhaseFromHandoff({
        requestedPhase: null,
        canAccessSendActions: true,
        premiumIntent: handoff.premiumSendIntent,
      }),
    ).toBe("review");
  });

  it("premium signature intent routes to send phase once unlocked", () => {
    const handoff = buildSimpleSendHandoff({
      agreementId: "ag_signature",
      primedDraft: null,
      streamlinedSimpleFlow: true,
      premiumSendIntent: "signature",
    });
    expect(
      resolveSimpleSendPhaseFromHandoff({
        requestedPhase: null,
        canAccessSendActions: false,
        premiumIntent: handoff.premiumSendIntent,
      }),
    ).toBe("review");
    expect(
      resolveSimpleSendPhaseFromHandoff({
        requestedPhase: null,
        canAccessSendActions: true,
        premiumIntent: handoff.premiumSendIntent,
      }),
    ).toBe("send");
  });

  it("resolveSimpleSendOpenPhase: URL send beats handoff review", () => {
    expect(
      resolveSimpleSendOpenPhase({
        urlPhase: "send",
        handoffOpenPhase: "review",
        canAccessSendActions: true,
        premiumIntent: "review",
        persistedSendPhase: null,
      }),
    ).toBe("send");
  });

  it("resolveSimpleSendOpenPhase: handoff send beats session when both present", () => {
    expect(
      resolveSimpleSendOpenPhase({
        urlPhase: null,
        handoffOpenPhase: "send",
        canAccessSendActions: true,
        premiumIntent: null,
        persistedSendPhase: null,
      }),
    ).toBe("send");
  });

  it("resolveSimpleSendOpenPhase: explicit handoff review beats persisted send", () => {
    expect(
      resolveSimpleSendOpenPhase({
        urlPhase: null,
        handoffOpenPhase: "review",
        canAccessSendActions: true,
        premiumIntent: null,
        persistedSendPhase: "send",
      }),
    ).toBe("review");
  });

  it("resolveSimpleSendOpenPhase: persisted send last resort after premium rules", () => {
    expect(
      resolveSimpleSendOpenPhase({
        urlPhase: null,
        handoffOpenPhase: null,
        canAccessSendActions: true,
        premiumIntent: null,
        persistedSendPhase: "send",
      }),
    ).toBe("send");
  });
});
