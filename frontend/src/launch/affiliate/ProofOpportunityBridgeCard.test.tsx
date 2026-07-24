/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { ProofOpportunityBridgeCard } from "./ProofOpportunityBridgeCard";
import { clearGenesisAffiliateAccessCache } from "../genesisReferral/genesisAffiliateAccess";

const mockNavigate = vi.fn();

vi.mock("../LaunchNavContext", () => ({
  useLaunchNav: () => ({
    pathname: "/app",
    search: "",
    hash: "",
    navigate: mockNavigate,
  }),
}));

vi.mock("../../config/featureFlags/useFeatureGate", () => ({
  useFeatureGate: () => true,
}));

vi.mock("../../config/dynamicConfig/useDynamicConfig", () => ({
  useDynamicConfig: () => ({
    proofBridge: {
      proofReadyTitle: "Proof ready",
      proofReadySubtitle: "Share it",
      bodyProofReady: "Body",
      sentTitle: "Sent",
      sentSubtitle: "Sub",
      bodySentPending: "Pending body",
      ctaShareProof: "Copy proof link",
      ctaEarnLink: "Earn with LawDog",
    },
  }),
}));

vi.mock("../../config/experiments/useExperimentVariant", () => ({
  useExperimentVariant: () => ({ variant: "control" }),
}));

vi.mock("../../auth/supabaseAuthService", () => ({
  getAuthSession: vi.fn(),
}));

import { getAuthSession } from "../../auth/supabaseAuthService";

describe("ProofOpportunityBridgeCard Earn CTA", () => {
  beforeEach(() => {
    clearGenesisAffiliateAccessCache();
    mockNavigate.mockClear();
    vi.mocked(getAuthSession).mockResolvedValue({
      access_token: "tok",
      user: { id: "u1" },
    } as never);
  });

  afterEach(() => {
    cleanup();
    clearGenesisAffiliateAccessCache();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("hides Earn CTA for ordinary users", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true, allowed: false, reason: "genesis_affiliate_access_denied" }),
      }),
    );
    render(<ProofOpportunityBridgeCard agreementId="ag1" mode="proof_ready" />);
    await waitFor(() => {
      expect(screen.queryByTestId("proof-bridge-earn-cta")).toBeNull();
    });
    expect(screen.getByRole("button", { name: /Copy proof link/i })).toBeTruthy();
  });

  it("shows Earn CTA for active Genesis Dog and routes to genesis-referral", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true, allowed: true }),
      }),
    );
    render(<ProofOpportunityBridgeCard agreementId="ag1" mode="proof_ready" />);
    const cta = await screen.findByTestId("proof-bridge-earn-cta");
    cta.click();
    expect(mockNavigate).toHaveBeenCalledWith("/app/genesis-referral");
  });
});
