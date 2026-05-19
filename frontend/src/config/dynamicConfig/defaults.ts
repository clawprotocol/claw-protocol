import type { DynamicConfigRoot } from "./types";
import { OPPORTUNITY_CHALLENGE_DEFINITIONS } from "../../launch/affiliate/opportunityChallenges.config";

const SHARE_PREFIX =
  "Running real agreements on LawDog — send, sign, verifiable proof. If you’re curious: ";

export const DYNAMIC_CONFIG_DEFAULTS: DynamicConfigRoot = {
  home: {
    heroTitle: "Create. Review. Send. Prove.",
    heroSupportLine:
      "Draft agreements in plain language, review every step, then share or sign only when you choose.",
    heroMicroTrust: "Nothing is sent, signed, or shared until you confirm.",
    heroPlaceholder:
      "Example: Services agreement for a $5k project, simple NDA between two parties, contractor agreement with monthly pay…",
    microSteps: ["Draft", "Review", "Sign", "Proof"],
  },
  readyToSend: {
    pageTitle: "Your agreement is ready to send",
    pageSubtitle:
      "You've built a real agreement. Upgrade to send it professionally, save it permanently, and add it to your reusable library.",
    valueStackHeading: "What you unlock",
    valueStack: [
      { title: "Send real signing links", detail: "Recipients get a clear path to review and sign." },
      { title: "Track recipient status", detail: "See progress from sent to signed without guesswork." },
      {
        title: "Checkable proof record",
        detail: "A record tied to what’s on file that recipients (and you) can verify with hashes.",
      },
      {
        title: "Attach a payment request",
        detail: "Optional — request and track payment when your terms call for it.",
      },
    ],
    alreadyInGoodShapeHeading: "Already in good shape",
    howYouRunHeading: "How you run LawDog",
    footerReassurance: "Nothing is sent until you confirm. You control when this goes out.",
  },
  checkout: {
    pageSubtitle: "Send this agreement and track it with LawDog",
    trustLines: {
      cardProcessing: "Payments are processed securely.",
      ctaPrimary: "Continue to payment",
      footnote:
        "You'll see the total before you confirm. Renewal terms follow your plan and the Terms of Service.",
    },
  },
  opportunity: {
    shellTitle: "Genesis Dogs Partner Access",
    shellSubtitle: "Share your link. Earn when people use LawDog.",
    leaderboardTitle: "Activity board",
    leaderboardSubtext:
      "Favors referrals who actually activate and use the product — not one-off link clicks.",
    challengesTitle: "Weekly missions",
    challengesPreamble:
      "Optional goals to stay consistent. Payouts and program rules are unchanged by challenges.",
    liveFlowPreamble: "Activity updates as real events land in your account.",
  },
  affiliate: {
    leaderboardPreviewPeerCount: 3,
    leaderboardDemoSeeds: [
      { id: "demo_ridge", handle: "Preview · Ridge (demo)", agreements: 2, keys: 25 },
      { id: "demo_river", handle: "Preview · River (demo)", agreements: 1, keys: 10 },
      { id: "demo_north", handle: "Preview · North (demo)", agreements: 0, keys: 5 },
    ],
    packTierBreakpoints: {
      builderMinScore: 1,
      connectorMinScore: 4,
      alphaMinScore: 24,
    },
    packTaglines: {
      Pup: "First flow on the board — keep going.",
      Builder: "First proof of reach — keep the streak.",
      Connector: "Repeat sends — your link is working.",
      Alpha: "Strong reach — earned with real sends.",
    },
    challengeDefinitions: [...OPPORTUNITY_CHALLENGE_DEFINITIONS],
    shareVariants: [
      {
        id: "pro",
        label: "Calm & credible",
        template: `${SHARE_PREFIX}{{link}}`,
      },
      {
        id: "pack",
        label: "Momentum",
        template: "Real agreements, real proof with LawDog — worth a look: {{link}}",
      },
      {
        id: "creator",
        label: "Builder energy",
        template:
          "If you still live in PDF hell: LawDog is send + sign + a verify link you can show. I’m in — {{link}}",
      },
    ],
    leaderboardStubBanner:
      "Preview rows show how the board feels; your stats are yours. Live rankings wire to the same Momentum rules.",
    earningsColumnLabel: "Earnings",
  },
  proofBridge: {
    proofReadyTitle: "Proof sealed",
    sentTitle: "Out the door",
    proofReadySubtitle: "Share something you’re proud of",
    sentSubtitle: "While they sign, plant your link",
    bodyProofReady:
      "You’ve got a finished artifact. Share it once with your referral link so credit follows real work.",
    bodySentPending:
      "When sending finishes, add your link once so referrals tie to a real send.",
    ctaShareProof: "Copy verify link",
    ctaEarnLink: "Open affiliate dashboard",
  },
};
