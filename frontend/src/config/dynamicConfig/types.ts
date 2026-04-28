import type { ChallengeDefinition } from "../../launch/affiliate/opportunityTypes";
import type { PackTier } from "../../launch/affiliate/opportunityTypes";

export type ValueStackRow = { title: string; detail: string };

export type DynamicConfigRoot = {
  home: {
    heroTitle: string;
    heroSupportLine: string;
    /** Smaller trust line under hero subheadline (homepage only). */
    heroMicroTrust: string;
    heroPlaceholder: string;
    microSteps: string[];
  };
  readyToSend: {
    pageTitle: string;
    pageSubtitle: string;
    valueStackHeading: string;
    valueStack: ValueStackRow[];
    alreadyInGoodShapeHeading: string;
    howYouRunHeading: string;
    footerReassurance: string;
  };
  checkout: {
    pageSubtitle: string;
    trustLines: {
      cardProcessing: string;
      ctaPrimary: string;
      footnote: string;
    };
  };
  opportunity: {
    shellTitle: string;
    shellSubtitle: string;
    leaderboardTitle: string;
    leaderboardSubtext: string;
    challengesTitle: string;
    challengesPreamble: string;
    liveFlowPreamble: string;
  };
  affiliate: {
    leaderboardPreviewPeerCount: number;
    leaderboardDemoSeeds: Array<{ id: string; handle: string; agreements: number; keys: number }>;
    packTierBreakpoints: {
      builderMinScore: number;
      connectorMinScore: number;
      alphaMinScore: number;
    };
    packTaglines: Record<PackTier, string>;
    challengeDefinitions: ChallengeDefinition[];
    shareVariants: Array<{ id: string; label: string; template: string }>;
    leaderboardStubBanner: string;
    earningsColumnLabel: string;
  };
  proofBridge: {
    proofReadyTitle: string;
    sentTitle: string;
    proofReadySubtitle: string;
    sentSubtitle: string;
    bodyProofReady: string;
    bodySentPending: string;
    ctaShareProof: string;
    ctaEarnLink: string;
  };
};
