import { describe, expect, it } from "vitest";
import type { AgreementDraft } from "./agreementTypes";
import {
  buildWorkspaceCreateSimpleSendHandoff,
  shouldUseStreamlinedWorkspaceCreateReview,
  workspaceCreatePostSendPath,
} from "./workspaceCreatePostGenerationHandoff";

const PRIMED: AgreementDraft = {
  id: "ag_red_mesa",
  title: "Professional Services Agreement",
  jurisdiction: "Delaware",
  effective_date: "Upon execution",
  purpose: "Warehouse optimization services.",
  payment_terms: "$96,000 in milestones",
  duration: "12 months",
  due_date: null,
  parties: [
    { id: "p1", name: "Red Mesa Logistics LLC", role: "client", email: "" },
    { id: "p2", name: "Harbor Peak Automation LLC", role: "service provider", email: "" },
  ],
  versions: [],
  audit_log: [],
  created_at: "2026-07-02T00:00:00Z",
  updated_at: "2026-07-02T00:00:00Z",
};

describe("workspaceCreatePostGenerationHandoff", () => {
  it("routes workspace create to the simple send review path", () => {
    expect(workspaceCreatePostSendPath("ag_red_mesa")).toBe("/app/send/ag_red_mesa");
  });

  it("enables streamlined review for paid tier users", () => {
    expect(
      shouldUseStreamlinedWorkspaceCreateReview({
        tier: "standard",
        agreementId: "ag_red_mesa",
        primedDraft: PRIMED,
      }),
    ).toBe(true);
    const handoff = buildWorkspaceCreateSimpleSendHandoff({
      agreementId: "ag_red_mesa",
      primedDraft: PRIMED,
      tier: "standard",
    });
    expect(handoff.streamlinedSimpleFlow).toBe(true);
    expect(handoff.agreementId).toBe("ag_red_mesa");
    expect(handoff.primedDraft?.title).toBe("Professional Services Agreement");
  });

  it("defaults free tier to non-streamlined send handoff", () => {
    const handoff = buildWorkspaceCreateSimpleSendHandoff({
      agreementId: "ag_starter",
      primedDraft: PRIMED,
      tier: "free",
    });
    expect(handoff.streamlinedSimpleFlow).toBe(false);
  });
});
