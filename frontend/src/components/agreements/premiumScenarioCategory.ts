/**
 * Universal premium scenario routing: category-fit drafting, not one boilerplate stack.
 * Keep IDs stable — mirrored in backend `agreements_v2_api` for full-draft LLM context.
 */
export type PremiumScenarioCategory =
  | "family_personal"
  | "business_commercial"
  | "freelancer_service"
  | "employment"
  | "loan_payment"
  | "property_roommate"
  | "settlement_dispute"
  | "custom_mixed";

export type PremiumScenarioDetect = {
  category: PremiumScenarioCategory;
  /** Short tokens for logging / LLM hints (no PII). */
  signals: string[];
};

function scoreCategory(low: string, famLow: string): PremiumScenarioDetect {
  const signals: string[] = [];
  const push = (id: string) => {
    if (!signals.includes(id)) signals.push(id);
  };

  const employment =
    /\b(employment|at-?will|w-2|w2|salary|hourly\s+wage|employee handbook|job\s+offer|position\s+title|benefits\s+package|severance\s+package|non-?compete\s*\(employee|work\s+for\s+the\s+company\s+as\s+an\s+employee)\b/.test(low) ||
    /\b(employer|employee)\b/.test(low) && /\b(salary|wages?|pto|vacation\s+days|performance\s+review)\b/.test(low);
  if (employment) {
    push("employment");
    return { category: "employment", signals };
  }

  const loan =
    /\b(promissory\s+note|personal\s+loan|loan\s+to|lend\s+\$|lend\s+money|borrow\s+\$|iou|installment\s+loan|principal\s+and\s+interest|apr\b|repayment\s+schedule|lender|borrower)\b/.test(low) ||
    (/\bloan\b/.test(low) && /\b(repay|interest|principal|installment)\b/.test(low));
  if (loan) {
    push("loan");
    return { category: "loan_payment", signals };
  }

  const settlement =
    /\b(settlement\s+agreement|mutual\s+release|release\s+of\s+claims|dispute\s+is\s+settled|full\s+and\s+final\s+settlement|confidential\s+settlement)\b/.test(low) ||
    (/\brelease\b/.test(low) && /\b(claims?|disputes?|liabilit)\b/.test(low) && /\b(settle|resolved|dismiss)\b/.test(low));
  if (settlement) {
    push("settlement");
    return { category: "settlement_dispute", signals };
  }

  const property =
    /\b(roommate|sublet|sub-lease|security\s+deposit|landlord|tenant|lessor|lessee|rental\s+agreement|lease\s+agreement|monthly\s+rent)\b/.test(low) ||
    (/\blease\b/.test(low) && /\b(rent|premises|unit\s+at)\b/.test(low)) ||
    /\b(hoa|homeowners\s+association)\b/.test(low);
  if (property) {
    push("property");
    return { category: "property_roommate", signals };
  }

  const family =
    /\b(spouse|divorce|custody|visitation|prenup|prenuptial|family\s+loan|gift\s+to|between\s+family|parent\s+and\s+child|sibling|caregiving|elder\s+care)\b/.test(low) ||
    (/\b(personal|family)\b/.test(low) && /\b(trust|care|support)\b/.test(low));
  if (family && !/\b(llc|inc\.?|corp|b2b|services\s+agreement|invoice)\b/i.test(low)) {
    push("family");
    return { category: "family_personal", signals };
  }

  const freelancer =
    /\b(1099|independent\s+contractor|freelance|consulting\s+agreement|statement\s+of\s+work|\bsow\b|retainer\s+fee|hourly\s+rate\s+for\s+services|deliverables?\b)/.test(low) ||
    famLow.includes("contractor") ||
    famLow.includes("consulting") ||
    famLow.includes("services");
  if (freelancer && !/\b(full-?time\s+employee|w-2)\b/.test(low)) {
    push("freelancer");
    return { category: "freelancer_service", signals };
  }

  const business =
    /\b(b2b|vendor|supplier|saas|enterprise|master\s+service|msa|commission\s+structure|referral\s+partner|agency\s+of\s+record|llc\s+and\s+llc|corporation)\b/.test(low) ||
    famLow.includes("generic_business") ||
    famLow.includes("services_agreement") ||
    famLow.includes("nda") ||
    famLow.includes("partnership");
  if (business) {
    push("business");
    return { category: "business_commercial", signals };
  }

  push("mixed");
  return { category: "custom_mixed", signals };
}

/**
 * Heuristic scenario bucket from raw intake + optional structured `agreement_family`.
 */
export function detectPremiumScenarioCategory(
  rawIntake: string,
  agreementFamily?: string | null,
): PremiumScenarioDetect {
  const low = (rawIntake || "").toLowerCase();
  const famLow = (agreementFamily || "").toLowerCase();
  if (low.length < 24) {
    return { category: "custom_mixed", signals: ["short_intake"] };
  }
  return scoreCategory(low, famLow);
}

/** Prefer lean deterministic packs for personal / housing / employment / loan / settlement. */
export function premiumScenarioPrefersLeanPacks(category: PremiumScenarioCategory): boolean {
  return (
    category === "family_personal" ||
    category === "property_roommate" ||
    category === "employment" ||
    category === "loan_payment" ||
    category === "settlement_dispute"
  );
}
