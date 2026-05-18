/**
 * Launch pricing marketing strings. Used by BillingPage and compliance tests.
 */
export const PRICING_HEADLINE = "Create and send agreements in minutes";

export const PRICING_SUBHEAD =
  "Move from draft to review to signature flow. Start free on Try LawDog, then subscribe for watermark-free sends, export, and team tools — Enterprise (custom pricing) when you need volume agreements, APIs, compliance packaging, and org-level intelligence.";

/** Homepage hero — primary marketing headline (SEO home). */
export const HOMEPAGE_HERO_TITLE = "Create. Review. Send. Prove.";
export const HOMEPAGE_HERO_SUBHEAD =
  "Draft agreements in plain language, review every step, then share or sign only when you choose.";
export const HOMEPAGE_HERO_MICRO_TRUST =
  "Nothing is sent, signed, or shared until you confirm.";
export const HOMEPAGE_CTA_CREATE_FREE_DRAFT = "Create free draft";
export const HOMEPAGE_CTA_SEE_HOW = "See how it works";
export const HOMEPAGE_HERO_PLACEHOLDER =
  "Example: Services agreement for a $5k project, simple NDA between two parties, contractor agreement with monthly pay…";

/** Homepage + pricing — outcome bullets (product capabilities, not legal outcomes). */
export const LAWDOG_VALUE_BULLETS = [
  "Plain-language workflow",
  "Move from draft to review to signature flow",
  "Send only when you choose",
  "Keep a checkable proof record",
] as const;

export const PRICING_FIRST_WORKFLOW_GUARANTEE_TITLE = "Try your first agreement risk-free";

export const PRICING_FIRST_WORKFLOW_GUARANTEE_BODY =
  "If the workflow does not work as intended, we'll refund your subscription. No friction.";

/** Product workflow completion only — not legal results. */
export const PRICING_FIRST_WORKFLOW_GUARANTEE_FOOTNOTE =
  "Applies to product workflow completion only—not legal outcomes, enforceability, or third-party decisions.";

export const LAWDOG_MICRO_TRUST_UNDER_CTA =
  "No legal knowledge required · Export anytime · Your records stay yours";

/** Homepage / pricing — product-grounded credibility (no legal-outcome claims). */
export const HOMEPAGE_WHAT_HAPPENS_NEXT_TITLE = "What happens next";

export const HOMEPAGE_WHAT_HAPPENS_NEXT_BULLETS = [
  "Describe or upload",
  "Review the draft",
  "Share or sign when ready",
  "Keep a proof record",
] as const;

/** Homepage hero + create intake — long example placeholder (plain English). */
export const HOMEPAGE_LONG_INTAKE_EXAMPLE =
  "Example: NDA between two parties, contractor agreement for $2,500/month, consulting agreement with 6 month term…";

/** Single trust line near primary create / send CTAs. */
export const NOTHING_SENT_UNTIL_CONFIRM = "Nothing is sent until you confirm.";

export const HOMEPAGE_TRUST_SECTION_TITLE = "Built for trust, not lock-in.";

export const HOMEPAGE_TRUST_CARDS = [
  {
    title: "Timestamped actions",
    body: "Key steps are recorded with clear timestamps so you know what happened and when.",
  },
  {
    title: "Verifiable records",
    body: "Proof is designed to be checked — not just displayed on a dashboard you have to trust.",
  },
  {
    title: "Export anytime",
    body: "Take your agreement and proof data with you for your own files and workflows.",
  },
  {
    title: "Public status without exposing full agreement text",
    body: "Share progress when useful — recipients see status, not your full private draft.",
  },
] as const;

/** @deprecated Prefer {@link HOMEPAGE_TRUST_CARDS} on the marketing homepage. */
export const HOMEPAGE_PRODUCT_TRUST_MICRO = [
  "Timestamped actions",
  "Verifiable records",
  "Export anytime",
  "Public status without exposing full agreement text",
] as const;

/** Shown once the user starts typing on first-run create (simple product). */
export const FIRST_RUN_INTAKE_REASSURANCE =
  "You’ll see the agreement type, structure, and signer setup form as you type.";

/** Simple-flow review strip — meaningful progress without implying legal results. */
export const REVIEW_STRUCTURED_WIN_LINE =
  "You now have a structured agreement ready for review and signature.";

/** Free draft simple-home: headline + body for Pro delta (review remains fully editable). */
export const FUNNEL_FREE_STARTER_HEADLINE = "Your agreement";
export const FUNNEL_FREE_STARTER_BODY =
  "This is your initial agreement. Review it here, then choose whether to continue with LawDog Pro, share for review, or prepare for signing.";
export const FUNNEL_FREE_STARTER_HELPER =
  "Nothing is sent, signed, or shared until you choose the next step.";

/** Bullets for Pro value on free send / upgrade surfaces (product capabilities). */
export const FUNNEL_PRO_VALUE_BULLETS = [
  "Stronger agreement language",
  "Tracked e-signing",
  "Recipient review links",
  "Proof record",
  "Cleaner final agreement",
] as const;

/** Primary conversion CTA on free send upsell — aligned to Create → Send → Prove. */
export const FUNNEL_CTA_SEND_WITH_PRO = "Continue with Pro";

/** Simple create / intake — first prompt (AgreementBuilderIntake, SimpleCreatePage). */
export const INTAKE_INTRO_HEADLINE = "Describe your agreement. We'll turn it into something you can send.";
export const INTAKE_HELPER_LEAD = "Works for anything:";
export const INTAKE_HELPER_BULLETS = ["freelance work", "NDAs", "partnerships", "simple deals"] as const;
export const INTAKE_MICRO_TRUST_LINE = "Nothing is sent until you confirm.";

/** AgreementReview — lightweight reassurance above first preview (simple home). */
export const SIMPLE_HOME_AGREEMENT_READY_LINES = [
  "✅ This is a complete agreement",
  "✅ Ready to send for signature",
  "🔒 Proof record available when you send",
] as const;

/** Pro / unlock progress (agreement flow). */
export const FUNNEL_PRO_ACTIVE_TITLE = "LawDog Pro active";
export const FUNNEL_PRO_ACTIVE_BODY =
  "Your agreement is ready for review links, signatures, and proof.";
export const FUNNEL_PRO_PHASE_REVIEWER_SETUP = "Continue to confirmation";
export const FUNNEL_PRO_PHASE_READY_SIGNATURES = "Ready for signatures";

/** Paywall / pricing — one concrete product workflow claim. */
export const PRICING_CREDIBILITY_ONE_WORKFLOW =
  "Your first agreement can move from draft to signature in one workflow.";

/** One line at first review/send — matches full guarantee scope (product completion). */
export const FIRST_WORKFLOW_GUARANTEE_SHORT =
  "Refund if your first agreement workflow can't be completed as intended—product scope only (see pricing).";

/** Sample-artifact disclaimers (marketing vs compact paywall). */
export const SAMPLE_ARTIFACTS_DISCLAIMER_FULL =
  "Illustrative examples of product output only—not your agreement, not legal advice, and not a prediction of legal outcome.";

export const SAMPLE_ARTIFACTS_DISCLAIMER_COMPACT =
  "Examples only—not your agreement, not legal advice, not a legal-outcome prediction.";

/** Create flow — main intake placeholder (plain-English examples, no extra form). */
export const SIMPLE_CREATE_INTAKE_PLACEHOLDER = HOMEPAGE_LONG_INTAKE_EXAMPLE;

/** First session only — ghost-style prompt (placeholder, not committed value). */
export const FIRST_SESSION_CREATE_INTAKE_PLACEHOLDER =
  "Example: Create a services agreement between…";

export const PRICING_COMPARE_TEASER =
  "Try LawDog (free) · LawDog Plus · LawDog Pro · Enterprise. Simple subscription tiers — monthly or annual.";

export const FORBIDDEN_PUBLIC_CLAIMS = [
  "fully compliant",
  "legally binding in all",
  "court-approved",
  "bulletproof",
  "court-proof",
  "replaces your lawyer",
  "guaranteed enforceable",
  "instant compliance",
] as const;

/** Flatten all user-visible pricing page prose for snapshot guards. */
export function pricingPageCopyBlob(parts: {
  headline: string;
  subhead: string;
  compareTeaser: string;
  tierNames: string[];
  tierMicrocopy: string[];
  tierBullets: string[][];
  faqQ: string[];
  faqA: string[];
  proofCallout: string;
}): string {
  return [
    parts.headline,
    parts.subhead,
    parts.compareTeaser,
    ...parts.tierNames,
    ...parts.tierMicrocopy,
    ...parts.tierBullets.flat(),
    ...parts.faqQ,
    ...parts.faqA,
    parts.proofCallout,
  ].join("\n");
}
