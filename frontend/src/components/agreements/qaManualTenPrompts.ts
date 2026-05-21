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
  {
    id: "consulting-dev-qa",
    title: "Consulting developer rebuild",
    intake:
      "Create a consulting agreement for a developer helping rebuild our internal workflow systems and AI automation stack. The engagement is remote and should include confidentiality, IP ownership, and support obligations. We want flexibility because scope may evolve over time.",
    expectFamily: "consulting_agreement",
    expectTitleIncludes: "Consulting",
  },
] as const;

/** AI migration / tech services — Lighthouse Digital × Apex Ops archetype. */
export const LIGHTHOUSE_APEX_MIGRATION_QA_INTAKE =
  "Create a technology services agreement between Lighthouse Digital and Apex Ops for AI migration, custom analytics dashboards, onboarding, and ongoing support. Total fee maybe $120,000 across build, rollout, and support phases. Month-to-month with renewal unless terminated. Texas law maybe. Include confidentiality, IP ownership, security obligations, and SLA uptime.";

/** Loose Lighthouse/Apex intake with malformed phase table — reproduces empty Needs-details panel QA. */
export const LIGHTHOUSE_APEX_LOOSE_QA_INTAKE = [
  "Create a technology services agreement between Lighthouse Digital and Apex Ops for AI migration, custom analytics dashboards, onboarding, and ongoing support.",
  "Total project fee maybe $120,000. Term probably 12 months. Auto renew? Texas law maybe.",
  "",
  "| Phase | Amount | Timing |",
  "| Build | TBD | TBD |",
  "| Rollout | TBD | TBD |",
  "| Support | ??? | ??? |",
].join("\n");

/** Contractor/developer intake with IP and term contradictions. */
export const CONTRACTOR_DEVELOPER_QA_INTAKE =
  "Need a contractor agreement for a developer. They should own all their work product but we also need full exclusive ownership of everything they create. The arrangement is month-to-month but should automatically lock in for 3 years unless terminated. Need it simple and founder-friendly.";

/** QA intake for guided completion — evolving scope, support, IP, vague fees. */
export const CONSULTING_DEV_QA_INTAKE =
  "Create a consulting agreement for a developer helping rebuild our internal workflow systems and AI automation stack. The engagement is remote and should include confidentiality, IP ownership, and support obligations. We want flexibility because scope may evolve over time.";

/** Authoritative-length consulting body with material business gaps and structural contamination. */
export function consultingAuthoritativeBodyFixture(): string {
  const filler = "The parties will cooperate in good faith and use commercially reasonable efforts. ";
  return [
    "CONSULTING AGREEMENT",
    "This Agreement is between Acme Systems Inc. and Developer LLC.",
    "",
    "1. SERVICES",
    filler.repeat(3) + "Developer will rebuild internal workflow systems and the AI automation stack remotely.",
    "",
    "2. COMPENSATION",
    filler.repeat(2) + "Consultant will be compensated as mutually agreed between the parties.",
    "Invoices will be sent to the billing contact identified in the Notices section.",
    "",
    "3. SUPPORT",
    filler.repeat(2) + "Support obligations will be defined by the parties after delivery.",
    "",
    "4. SCOPE AND CHANGES",
    filler.repeat(2) + "Scope may evolve during the engagement as requirements change.",
    "",
    "5. INTELLECTUAL PROPERTY",
    filler.repeat(2) + "Work product ownership will be confirmed before final delivery.",
    "",
    "6. CONFIDENTIALITY",
    filler.repeat(4) + "Each party will protect confidential information using reasonable care.",
    "",
    "7. LIMITATION OF LIABILITY",
    filler.repeat(2) + "Direct damages are limited to fees paid in the prior three months.",
    "",
    "8. TERM",
    filler.repeat(2) + "This Agreement continues until the services are complete unless terminated earlier.",
    "",
    "9. GENERAL",
    filler.repeat(2) + "Survival and wind-down obligations apply as stated herein.",
    "Direct damages are limited to fees paid in the prior three months.",
    "",
    "IN WITNESS WHEREOF, the parties may execute this Agreement.",
    "By: ____________________",
  ].join("\n");
}

/** Services/migration Pro body — supplemental schedule placeholders, empty headings, loose phases. */
export function lighthouseApexMigrationBodyFixture(): string {
  const filler =
    "The parties will cooperate in good faith and use commercially reasonable efforts on the migration program. ";
  return [
    "TECHNOLOGY SERVICES AGREEMENT",
    "This Agreement is between Lighthouse Digital and Apex Ops.",
    "",
    "1. SERVICES",
    filler.repeat(2) + "Provider will deliver AI migration, dashboards, onboarding, and support services.",
    "",
    "2. COMPENSATION",
    filler.repeat(1) + "Total fees to be confirmed in a supplemental schedule.",
    "amount: to be confirmed",
    "payment timing: to be confirmed",
    "",
    "3. INVOICING",
    "3.3 Invoices.",
    "",
    "4. SERVICE LEVELS",
    "4.3 SLA Limits.",
    "",
    "5. SECURITY",
    filler.repeat(1) + "Security measures will follow standard commercial practice.",
    "",
    "9. INDEMNITY",
    "9.1 Lighthouse Indemnity.",
    "",
    "Phase 1 — Build: amounts and timing to be confirmed in writing before execution.",
    "Phase 2 — Rollout: amounts and timing to be confirmed.",
    "Phase 3 — Support: support level to be confirmed.",
    "",
    "IN WITNESS WHEREOF, the parties may execute this Agreement.",
    "By: ____________________",
  ].join("\n");
}

/** Contractor Pro body with empty headings and compensation splices. */
export function contractorDeveloperBodyFixture(): string {
  return [
    "DEVELOPER CONTRACTOR AGREEMENT",
    "This Agreement is between Company and Contractor.",
    "",
    "1. SERVICES",
    "Contractor will provide development services.",
    "",
    "1.2 Deliverables.",
    "",
    "2. COMPENSATION",
    "Compensation, invoicing, and payment timing will be documented in a schedule or written statement agreed before work begins.",
    "",
    "3. INTELLECTUAL PROPERTY",
    "3.1 Work Made for Hire; Assignment.",
    "Compensation, invoicing, and payment timing will be documented in a schedule or written statement agreed before work begins.",
    "3.5 No Conflicting Rights.",
    "",
    "6. WARRANTIES",
    "6.2 Contractor Warranties.",
    "",
    "7. Pre-Existing Materials and Background Tools.",
    "",
    "9. Confidentiality.",
    "",
    "11. Contractor Representations and Warranties.",
    "",
    "7. TERM AND TERMINATION",
    "7.6 Effect of Termination.",
    "7.7 Survival.",
    "",
    "IN WITNESS WHEREOF, the parties may execute this Agreement on the date of last signature below.",
    "By: ____________________",
  ].join("\n");
}

/** Sample Pro body with known defects — exercises visible-body repair. */
/** Growth advisor Pro body with empty shells and banned scaffolds — exercises hard integrity gate. */
export function growthAdvisorDefectiveBodyFixture(): string {
  return [
    "GROWTH ADVISOR AGREEMENT",
    "This Agreement is between StartupCo Inc and Advisor LLC.",
    "",
    "1. Services",
    "Advisor will support enterprise customer development.",
    "The implementation plan and milestone payments shall be tracked quarterly.",
    "2. Compensation",
    "2.3 Invoicing and Payment.",
    "unless a different period is stated in a schedule.",
    "4. Confidentiality",
    "4.1 Confidentiality Obligations.",
    "Until then, this Section is intentionally left for completion before signing.",
    "9.7 General",
    "- 10% revenue share on qualified introductions",
    "- 12-month protected opportunity period",
    "",
    "IN WITNESS WHEREOF, the Parties agree to execute this Agreement.",
  ].join("\n");
}

/** Referral/channel Pro body with invoice splices and empty headings. */
export function referralDefectiveBodyFixture(): string {
  return [
    "REFERRAL PARTNER AGREEMENT",
    "This Agreement is between ChannelCo LLC and Partner Inc.",
    "",
    "1. Referral Services",
    "Partner may introduce qualified enterprise customers.",
    "Invoices will be sent to the billing contact identified in the Notices section.",
    "2. Compensation",
    "2.6 Protection Period.",
    "Fees and payment timing will be confirmed in writing before execution.",
    "4. Confidentiality",
    "4.1 Deal Visibility.",
    "Invoices will be sent to the billing contact identified in the Notices section.",
    "6.1 Confidentiality Obligations.",
    "for indirect or consequential damages unless otherwise stated.",
    "10. Termination",
    "10.5 Wind-Down Cooperation.",
    "10.7 Survival.",
    "to enter into this Agreement upon execution.",
    "",
    "SIGNATURES",
    "By: _________________________",
    "Name:",
    "Title:",
    "Email:",
    "",
    "IN WITNESS WHEREOF, the Parties agree to execute this Agreement.",
  ].join("\n");
}

/** Legally-shaped Pro body with semantic gaps but zero literal TBD/INSERT hits. */
export function semanticallyIncompleteProBodyFixture(): string {
  return [
    "MASTER SERVICES AGREEMENT",
    "This Agreement is between Acme Digital and Beta Ops.",
    "",
    "2. COMPENSATION",
    "Total fees will be confirmed in a supplemental schedule before execution.",
    "amount: to be confirmed",
    "",
    "5.2 Project Deliverables.",
    "",
    "10.4 Effect of Termination.",
    "",
    "12.1 Venue.",
    "",
    "Each Party will indemnify the other for third-party claims arising from its breach.",
    "Each Party will indemnify the other for third-party claims arising from its breach.",
    "",
    "Each Party may disclose Confidential Information to the other in connection with this Agreement.",
    "Each Party may disclose Confidential Information to the other in connection with this Agreement.",
    "",
    "Phase 1 — Build: pricing to be confirmed",
    "Phase 2 — Rollout: support may include business-hours assistance",
    "",
    "IN WITNESS WHEREOF, the parties may execute this Agreement.",
  ].join("\n");
}

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
