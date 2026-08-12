import { NO_GUARANTEE_ENFORCEABILITY, PRODUCT_NOT_LAW_FIRM } from "../compliance/disclosureCopy";
import {
  CONVERSION_DECISION_PROMPT,
  CONVERSION_GUARANTEE_INLINE,
  PAYWALL_DEFAULT_HEADLINE,
  PAYWALL_DEFAULT_SUB,
} from "./paywallMessaging";
import {
  FIRST_RUN_INTAKE_REASSURANCE,
  FIRST_WORKFLOW_GUARANTEE_SHORT,
  FORBIDDEN_PUBLIC_CLAIMS,
  HOMEPAGE_PRODUCT_TRUST_MICRO,
  HOMEPAGE_WHAT_HAPPENS_NEXT_BULLETS,
  HOMEPAGE_WHAT_HAPPENS_NEXT_TITLE,
  LAWDOG_VALUE_BULLETS,
  PRICING_COMPARE_TEASER,
  PRICING_CREDIBILITY_ONE_WORKFLOW,
  PRICING_FIRST_WORKFLOW_GUARANTEE_BODY,
  PRICING_FIRST_WORKFLOW_GUARANTEE_FOOTNOTE,
  PRICING_FIRST_WORKFLOW_GUARANTEE_TITLE,
  PRICING_HEADLINE,
  PRICING_SUBHEAD,
  REVIEW_STRUCTURED_WIN_LINE,
  SAMPLE_ARTIFACTS_DISCLAIMER_COMPACT,
  SAMPLE_ARTIFACTS_DISCLAIMER_FULL,
  pricingPageCopyBlob,
} from "./pricingContent";

/**
 * Commercial beta buyer plans: Guest and Pro only.
 * Plus is retired. Genesis is an affiliate/referral role — not a buyer plan card.
 * Self-serve Stripe checkout is Pro only ($99 / 25 finalized premium agreements).
 *
 * Legacy id `"starter"` is retained only so old deep links normalize to Pro checkout.
 */
export type LaunchPricingTier = {
  id: "starter" | "pro" | "enterprise";
  name: string;
  /** Self-serve list price per month in USD; null for Guest / Enterprise / custom. */
  monthlyPriceUsd: number | null;
  /** Internal monthly usage allowance for metering; null when custom. Not shown in product UI. */
  includedKeysPerMonth: number | null;
  /** Overage unit rate (USD per Key beyond included bundle). */
  overagePerKeyUsd: number;
  capacityLine: string;
  bestFor: string;
  bullets: string[];
  ctaAction: "start" | "contact";
  highlighted?: boolean;
};

export const LAUNCH_PRICING_TIERS: LaunchPricingTier[] = [
  {
    id: "starter",
    name: "Guest",
    monthlyPriceUsd: null,
    includedKeysPerMonth: null,
    overagePerKeyUsd: 0.5,
    capacityLine: "Temporary sample draft — not a paid plan",
    bestFor: "Try a temporary draft before subscribing to LawDog Pro.",
    bullets: [
      "One temporary draft to sample the workflow",
      "Watermarked preview — no Pro premium drafting",
      "Upgrade to Pro to persist, finalize, and send",
      "Not a Stripe subscription SKU",
    ],
    ctaAction: "start",
  },
  {
    id: "pro",
    name: "LawDog Pro",
    monthlyPriceUsd: 99,
    includedKeysPerMonth: 100,
    overagePerKeyUsd: 0.5,
    capacityLine: "25 successfully finalized premium agreements per billing period",
    bestFor: "Paid premium drafting, review, and signing workflows for teams that ship agreements every month.",
    bullets: [
      "$99/month — 25 successfully finalized premium agreements per billing period",
      "Failed generations, previews, retries, and repairs do not consume quota",
      "Premium AI full-draft generation (Pro only)",
      "Team review, redlines, export, and e-sign workflows",
    ],
    ctaAction: "start",
    highlighted: true,
  },
  {
    id: "enterprise",
    name: "Enterprise",
    monthlyPriceUsd: null,
    includedKeysPerMonth: null,
    overagePerKeyUsd: 0.5,
    capacityLine: "Sales-assisted when your program outgrows self-serve LawDog Pro",
    bestFor:
      "CLM-scale value: high-volume agreements, APIs into your stack, compliance and governance — scoped with your legal and procurement teams.",
    bullets: [
      "Volume agreement programs across teams, regions, or subsidiaries",
      "API access for automation and integrations alongside your CLM workflow",
      "Compliance packaging: security review, records posture, and rollout alignment",
      "AI memory and org-level intelligence across your workspace (not just one seat)",
    ],
    ctaAction: "contact",
  },
];

export const PRICING_FAQ = [
  {
    q: "Is LawDog a law firm?",
    a: `No. ${PRODUCT_NOT_LAW_FIRM} Workflows, records, verification, and evidence-oriented outputs — not legal advice and not a substitute for counsel.`,
  },
  {
    q: "Will my agreement hold up in court?",
    a: `That depends on facts, jurisdiction, and the document itself. ${NO_GUARANTEE_ENFORCEABILITY} When the stakes are high, plan for counsel review.`,
  },
  {
    q: "How is this different from DocuSign?",
    a: "Most e-sign stops at a signed file. LawDog emphasizes a structured path from draft to send to proof, so you can show what recipients saw without asking them to trust a black box.",
  },
  {
    q: "What is included in LawDog Pro?",
    a: "LawDog Pro is $99/month with 25 successfully finalized premium agreements per billing period. Failed generations, previews, retries, and repairs do not consume quota. Buyer plans are Guest and Pro only — Plus is retired. Genesis is an affiliate/referral program, not a customer plan.",
  },
  {
    q: "Can I cancel?",
    a: "Yes, when you are on a self-serve paid plan with billing connected — use Billing to cancel or change. Monthly subscriptions renew each billing period until you cancel. Annual checkout is one upfront charge for the term shown; what happens after that term, and any refund eligibility, follow the Terms of Service and your order summary.",
  },
  {
    q: "What is Advanced Work Product?",
    a: "It is how Pro turns materials you already have in LawDog into structured drafts — briefs, memos, white papers, and similar — without treating the result as proof or legal advice. Always review outputs with qualified people.",
  },
  {
    q: "What do the tiers change in practice?",
    a: "Guest lets you sample a temporary draft. LawDog Pro ($99/month) unlocks premium full-draft workflows with 25 successfully finalized agreements per billing period. Genesis affiliates earn $29.70 on the first successfully settled Pro invoice after the refund window. Enterprise is custom pricing for volume programs and API access.",
  },
] as const;

export const PRICING_PROOF_CALLOUT =
  "After signatures, share a clean verification summary so counterparties see what was recorded — professionally, without exposing internals.";

export function launchPricingCopyForComplianceTest(): string {
  return [
    pricingPageCopyBlob({
      headline: PRICING_HEADLINE,
      subhead: PRICING_SUBHEAD,
      compareTeaser: PRICING_COMPARE_TEASER,
      tierNames: LAUNCH_PRICING_TIERS.map((t) => t.name),
      tierMicrocopy: LAUNCH_PRICING_TIERS.map((t) => t.bestFor),
      tierBullets: LAUNCH_PRICING_TIERS.map((t) => t.bullets),
      faqQ: PRICING_FAQ.map((x) => x.q),
      faqA: PRICING_FAQ.map((x) => x.a),
      proofCallout: PRICING_PROOF_CALLOUT,
    }),
    ...LAWDOG_VALUE_BULLETS,
    PRICING_FIRST_WORKFLOW_GUARANTEE_TITLE,
    PRICING_FIRST_WORKFLOW_GUARANTEE_BODY,
    PRICING_FIRST_WORKFLOW_GUARANTEE_FOOTNOTE,
    FIRST_WORKFLOW_GUARANTEE_SHORT,
    PAYWALL_DEFAULT_HEADLINE,
    PAYWALL_DEFAULT_SUB,
    CONVERSION_DECISION_PROMPT,
    CONVERSION_GUARANTEE_INLINE,
    HOMEPAGE_WHAT_HAPPENS_NEXT_TITLE,
    ...HOMEPAGE_WHAT_HAPPENS_NEXT_BULLETS,
    ...HOMEPAGE_PRODUCT_TRUST_MICRO,
    FIRST_RUN_INTAKE_REASSURANCE,
    REVIEW_STRUCTURED_WIN_LINE,
    PRICING_CREDIBILITY_ONE_WORKFLOW,
    SAMPLE_ARTIFACTS_DISCLAIMER_FULL,
    SAMPLE_ARTIFACTS_DISCLAIMER_COMPACT,
  ].join("\n");
}

export function assertPricingCopyHasNoForbiddenClaims(blob: string): void {
  const low = blob.toLowerCase();
  for (const bad of FORBIDDEN_PUBLIC_CLAIMS) {
    if (low.includes(bad.toLowerCase())) {
      throw new Error(`Pricing copy must not include: ${bad}`);
    }
  }
}
