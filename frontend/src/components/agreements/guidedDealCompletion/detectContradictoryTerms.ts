/**
 * Intake contradiction signals → guided completion variables (not silent assumptions).
 */

import type { CommercialFamilyHint, MaterialMissingItem } from "../proAgreementCompleteness/types";

export type ContradictionGuidedSignal = {
  id: string;
  item: MaterialMissingItem;
};

export function detectIpOwnershipContradiction(intakeRaw: string): boolean {
  const t = intakeRaw;
  const contractorOwns =
    /\b(?:contractor|developer)\b[\s\S]{0,120}\bown(?:s)?\b[\s\S]{0,80}\bwork\s+product\b/i.test(t) ||
    /\bown(?:s)?\s+(?:all\s+)?(?:their|his|her)\s+work\s+product\b/i.test(t) ||
    /\bthey\s+should\s+own\s+all\s+their\s+work\s+product\b/i.test(t);
  const companyExclusive =
    /\b(?:full\s+)?exclusive\s+ownership\b/i.test(t) ||
    /\b(?:we|company|client)\b[\s\S]{0,100}\b(?:own(?:s)?|ownership)\b[\s\S]{0,80}\beverything\b/i.test(t) ||
    /\bown(?:s)?\s+everything\s+they\s+create\b/i.test(t);
  return contractorOwns && companyExclusive;
}

export function detectTermStructureContradiction(intakeRaw: string): boolean {
  const low = intakeRaw.toLowerCase();
  const monthToMonth = /\bmonth[-\s]?to[-\s]?month\b/.test(low);
  const lockIn =
    /\b(?:lock(?:ed)?\s+in|locked\s+in|fixed\s+term)\b/.test(low) ||
    /\b(?:3|three)\s+years?\b/.test(low) ||
    /\bautomatically\s+(?:lock|renew|extend)\b/.test(low);
  return monthToMonth && lockIn;
}

export function detectContradictoryTerms(
  intakeRaw: string,
  family: CommercialFamilyHint = "generic_business_agreement",
): ContradictionGuidedSignal[] {
  const intake = (intakeRaw || "").trim();
  if (!intake) return [];
  const out: MaterialMissingItem[] = [];

  if (detectIpOwnershipContradiction(intake)) {
    out.push({
      id: "ip_ownership_contradiction",
      severity: "critical",
      label: "IP ownership",
      question: "Who should own the developer's work product?",
      whyItMatters:
        "The prompt says both the developer owns the work and the company gets exclusive ownership. The agreement needs one clear rule.",
      suggestedAnswerFormat: "e.g. company owns custom work; developer keeps reusable tools",
      affectsSections: ["Intellectual Property", "Work Product", "Assignment"],
      canProceedWithoutAnswer: false,
      agreementFamily: family,
    });
  }

  if (detectTermStructureContradiction(intake)) {
    out.push({
      id: "term_structure_contradiction",
      severity: "critical",
      label: "Term structure",
      question: "How should the month-to-month / 3-year term work?",
      whyItMatters:
        "Month-to-month and locked for 3 years can conflict unless the agreement explains how termination works.",
      suggestedAnswerFormat: "e.g. month-to-month with 30-day notice during a 3-year maximum term",
      affectsSections: ["Term", "Termination"],
      canProceedWithoutAnswer: false,
      agreementFamily: family,
    });
  }

  return out.map((item) => ({ id: item.id, item }));
}
