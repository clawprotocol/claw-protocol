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

export type LaunchPricingTier = {
  id: "starter" | "pro" | "enterprise";
  name: string;
  /** Self-serve list price per month in USD; null for Enterprise / custom. */
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
    name: "LawDog Plus",
    monthlyPriceUsd: 16,
    includedKeysPerMonth: 10,
    overagePerKeyUsd: 0.5,
    capacityLine: "Unlimited agreements",
    bestFor: "Create and send agreements in minutes — without watermarks, with export and send.",
    bullets: [
      "Unlimited agreements",
      "Remove watermark on outbound sends",
      "Export and send — professional delivery",
      "Basic AI drafting from plain language",
    ],
    ctaAction: "start",
    highlighted: true,
  },
  {
    id: "pro",
    name: "LawDog Pro",
    monthlyPriceUsd: 39,
    includedKeysPerMonth: 100,
    overagePerKeyUsd: 0.5,
    capacityLine: "For teams that ship agreements every week",
    bestFor: "Turn drafts into real agreements instantly — with team workflows and advanced drafting help.",
    bullets: [
      "Team features — shared workspace and collaboration",
      "Advanced AI — summaries, redlines, and deeper review assist (assistive, not legal advice)",
      "Integrations — connect the tools your team already uses",
      "Everything in LawDog Plus",
    ],
    ctaAction: "start",
  },
  /**
   * Enterprise is custom-priced in-product (see ConversionPricingTriad). Commercially, deals may
   * reference usage-based constructs internally (MSA / order form only) — e.g. per-agreement bands,
   * per-Key metering, per-API throughput — but those unit models are not shown on the public pricing grid.
   */
  {
    id: "enterprise",
    name: "Enterprise",
    monthlyPriceUsd: null,
    includedKeysPerMonth: null,
    overagePerKeyUsd: 0.5,
    capacityLine: "Sales-assisted when your program outgrows self-serve LawDog Plus and LawDog Pro",
    bestFor:
      "CLM-scale value: high-volume agreements, APIs into your stack, compliance and governance, plus org-wide Agreement Memory — scoped with your legal and procurement teams.",
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
    q: "What does “unlimited agreements” include?",
    a: "LawDog Plus and LawDog Pro are subscription plans built for normal business agreement work. If you are running high-volume agreement programs, need APIs and governance at scale, or want org-wide intelligence packaged with procurement, Enterprise is the right conversation — custom pricing, not list SKUs.",
  },
  {
    q: "Can I cancel?",
    a: "Yes, when you are on a self-serve paid plan with billing connected — use Billing to cancel or change. Monthly subscriptions renew each billing period until you cancel. Annual checkout is one upfront charge for the term shown; what happens after that term, and any refund eligibility, follow the Terms of Service and your order summary.",
  },
  {
    q: "What is Advanced Work Product?",
    a: "It is how Pro and eligible plans turn materials you already have in LawDog into structured drafts — briefs, memos, white papers, and similar — without treating the result as proof or legal advice. Plus includes a smaller set (for example executive summaries and issue analyses); Pro expands the library. Always review outputs with qualified people.",
  },
  {
    q: "What do the paid tiers change in practice?",
    a: "Try LawDog lets you sample drafting and preview with tight limits. LawDog Plus is the subscription for unlimited agreements, watermark-free sends, export, and basic AI drafting. LawDog Pro adds team features, advanced AI help, and integrations. Enterprise is custom pricing for volume programs, API access, compliance packaging, and org-level Agreement Memory — aligned with how CLM vendors price strategic deals.",
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
