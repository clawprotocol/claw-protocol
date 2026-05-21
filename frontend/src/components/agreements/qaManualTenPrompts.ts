/**
 * Top-priority manual QA prompts (FREE_VS_PRO_OUTPUT_QA + prompt 7 JV).
 * Used for universal classification and visible-body regression tests.
 */

export type QaManualPromptFixture = {
  id: string;
  title: string;
  intake: string;
  expectFamily?: string;
  expectTitleIncludes?: string;
  expectNotTitle?: string;
  expectIntent?: string;
};

export const QA_MANUAL_TEN_PROMPTS: readonly QaManualPromptFixture[] = [
  {
    id: "creator-001",
    title: "UGC whitelisting",
    intake:
      "UGC license for TikTok and Reels. Brand can whitelist ads for 90 days. Creator keeps moral rights for portfolio.",
    expectTitleIncludes: "Influencer",
  },
  {
    id: "messy-004",
    title: "Messy typos",
    intake:
      "Need agrement betwen Acme Co and Beta LLC for mktng servces $5k net 30 deliver logo and social posts",
    expectFamily: "generic_business_agreement",
  },
  {
    id: "short-002",
    title: "SaaS one-liner",
    intake: "Terms for my B2B SaaS. No refunds. Monthly subscription.",
    expectTitleIncludes: "SaaS",
  },
  {
    id: "contra-001",
    title: "Contradictory",
    intake: "Exclusive license but also says public domain and free for anyone to use.",
    expectFamily: "generic_business_agreement",
  },
  {
    id: "emo-001",
    title: "Emotional",
    intake: "My business partner screwed me. Need something to protect me going forward.",
    expectFamily: "generic_business_agreement",
  },
  {
    id: "crypto-001",
    title: "Crypto license",
    intake: "License my NFT art for commercial use. 10% royalty on secondary sales.",
    expectTitleIncludes: "NFT",
  },
  {
    id: "short-001",
    title: "NDA freelancer",
    intake: "NDA between me and my freelancer Alex. 2 years, California.",
    expectFamily: "nda",
    expectTitleIncludes: "Non-Disclosure",
  },
  {
    id: "prompt-7-jv",
    title: "Multi-party JV",
    intake:
      "Two friends and I are buying distressed houses together but nobody trusts each other enough right now. Need a simple JV agreement covering who finds deals, who funds earnest money, who manages rehab, profit splits by project, what happens if someone flakes, approval rights for budgets, deadlock resolution, and signatures tonight.",
    expectFamily: "generic_business_agreement",
    expectTitleIncludes: "Joint Venture",
    expectNotTitle: "Founder Vesting",
  },
  {
    id: "short-003",
    title: "Consulting flat fee",
    intake: "Consulting agreement. $5k fixed. Deliverables in 30 days.",
    expectFamily: "consulting_agreement",
    expectTitleIncludes: "Consulting",
  },
  {
    id: "growth-advisor",
    title: "Ultra-short growth advisor",
    intake: "Growth advisor for my startup. Revenue share on intros. 12 month term.",
    expectTitleIncludes: "Growth Advisor",
    expectNotTitle: "Founder Vesting",
    expectIntent: "consulting_services",
  },
] as const;

/** Sample Pro body with known defects — exercises visible-body repair. */
export function defectiveProBodyFixture(): string {
  return [
    "SERVICES AGREEMENT",
    "This Agreement is between Acme LLC and Beta Inc.",
    "",
    "1. Scope",
    "Professional services as described.",
    "2. Payment",
    "Fees follow the schedule in this Agreement.",
    "3. Confidentiality",
    "4.1 Confidentiality Obligations.",
    "Invoices are due within thirty (30) days unless a different period is stated in a schedule.",
    "5.1 Assignment.",
    "10.5 Effect of Termination.",
    "signature.",
    "Sections that by their nature should",
    "",
    "IN WITNESS WHEREOF, the Parties agree to execute this Agreement through the LawDog signing workflow.",
  ].join("\n");
}
