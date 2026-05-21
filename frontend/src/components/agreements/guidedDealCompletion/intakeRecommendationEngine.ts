import { analyzeConsultingIntake } from "./consultingGuidedIntake";
import type { DealVariable, DealVariableDefault } from "./types";

export const RECOMMEND_PILL_ID = "recommend";

export type RecommendForMeResult = {
  explanation: string;
  choices: Array<{ pillId: string; label: string; value: string }>;
};

function withRecommendPill(pills: DealVariableDefault[]): DealVariableDefault[] {
  if (pills.some((p) => p.id === RECOMMEND_PILL_ID)) return pills;
  return [
    ...pills.filter((p) => p.id !== "custom"),
    {
      id: RECOMMEND_PILL_ID,
      label: "Recommend for me",
      value: "",
      rationale: "LawDog will suggest options based on your intake — you can still change them.",
    },
    ...pills.filter((p) => p.id === "custom"),
  ];
}

export function enrichDealVariableFromIntake(variable: DealVariable, intakeRaw?: string | null): DealVariable {
  const signals = analyzeConsultingIntake(intakeRaw);
  const pills = withRecommendPill(variable.suggestedDefaults);
  let recommendedPillId: string | undefined;
  let recommendedLabel: string | undefined;

  if (variable.id === "payment_structure") {
    if (signals.evolvingScope || signals.aiRebuild) {
      recommendedPillId = signals.milestoneHints ? "milestone" : "retainer";
      recommendedLabel = "Recommended from your intake";
    } else if (signals.milestoneHints) {
      recommendedPillId = "milestone";
      recommendedLabel = "Most likely fit";
    }
  } else if (variable.id === "support_obligations") {
    recommendedPillId = signals.mentionsSupport && signals.aiRebuild ? "business_hours" : "handoff";
    recommendedLabel = signals.mentionsSupport ? "Recommended from your intake" : undefined;
  } else if (variable.id === "scope_change_approval") {
    recommendedPillId = signals.evolvingScope ? "email" : "sow";
    recommendedLabel = signals.evolvingScope ? "Recommended from your intake" : undefined;
  } else if (variable.id === "ip_ownership" || variable.id === "ip_allocation") {
    recommendedPillId = signals.aiRebuild || signals.mentionsIp ? "company_deliverables" : "company_deliverables";
    recommendedLabel = "Most likely fit";
  } else if (variable.id === "ip_ownership_contradiction") {
    recommendedPillId = "split_tools";
    recommendedLabel = "Recommended from your intake";
  } else if (variable.id === "term_structure_contradiction") {
    recommendedPillId = "monthly_cap";
    recommendedLabel = "Recommended from your intake";
  } else if (variable.id === "payment_structure" && /\bmonth[-\s]?to[-\s]?month\b/i.test(intakeRaw || "")) {
    recommendedPillId = "retainer";
    recommendedLabel = "Recommended from your intake";
  } else if (variable.id === "governing_law_notice" || variable.id === "governing_venue") {
    recommendedPillId = "de";
  }

  const pillExplanations = pillExplanationsForVariable(variable.id);

  return {
    ...variable,
    suggestedDefaults: pills.map((p) =>
      p.id === recommendedPillId ? { ...p, rationale: recommendedLabel ?? p.rationale } : p,
    ),
    recommendedPillId,
    recommendedLabel,
    pillExplanations,
    agreementImpact: whyThisMattersForVariable(variable.id) || variable.agreementImpact,
  };
}

function whyThisMattersForVariable(id: string): string | undefined {
  const map: Record<string, string> = {
    ip_ownership_contradiction:
      "The prompt says both the developer owns the work and the company gets exclusive ownership. The agreement needs one clear rule.",
    term_structure_contradiction:
      "Month-to-month and locked for 3 years can conflict unless the agreement explains how termination works.",
    deliverables_scope: "Defined deliverables set expectations for what is in and out of scope.",
    payment_structure:
      "Clear payment structure reduces disputes if scope expands later.",
    support_obligations:
      "This determines whether bug fixes and maintenance are included after delivery.",
    scope_change_approval:
      "This helps prevent disagreements when requirements evolve.",
    ip_ownership:
      "Ownership rules control who can use, modify, and resell the work product.",
    ip_allocation:
      "Ownership rules control who can use, modify, and resell the work product.",
    governing_law_notice:
      "Governing law and notice details affect how disputes and formal notices are handled.",
    governing_venue:
      "Governing law and venue affect how disputes and formal notices are handled.",
    payment_timing:
      "Clear payment timing keeps cash flow predictable for both sides.",
  };
  return map[id];
}

function pillExplanationsForVariable(id: string): Record<string, string> | undefined {
  if (id === "payment_structure") {
    return {
      hourly: "Pay for time worked.",
      fixed: "One total price regardless of hours.",
      retainer: "Recurring monthly payment for ongoing work or availability.",
      milestone: "Payments tied to defined phases or deliverables.",
    };
  }
  if (id === "support_obligations") {
    return {
      handoff: "Reasonable transition only — no ongoing maintenance.",
      business_hours: "Help during standard business hours for a limited period.",
      maintenance: "Ongoing monthly maintenance and fixes.",
      separate_sow: "Support handled under a separate written scope.",
    };
  }
  if (id === "scope_change_approval") {
    return {
      email: "Email approval is enough to add or change scope.",
      sow: "Signed SOW or change order before extra work starts.",
      ticket: "Tracked ticket approval in your project system.",
      written: "Formal written approval from the company.",
    };
  }
  if (id === "ip_ownership" || id === "ip_allocation") {
    return {
      company_deliverables: "The company owns project-specific deliverables.",
      developer_tools: "Developer keeps reusable tools; company gets project deliverables.",
      shared: "Custom split — describe in your own words.",
    };
  }
  return undefined;
}

export function resolveRecommendForMe(
  variable: DealVariable,
  intakeRaw?: string | null,
): RecommendForMeResult | null {
  const signals = analyzeConsultingIntake(intakeRaw);
  const find = (pillId: string) => variable.suggestedDefaults.find((p) => p.id === pillId);

  if (variable.id === "payment_structure") {
    if (signals.evolvingScope || signals.aiRebuild) {
      return {
        explanation:
          "Because your intake described an evolving workflow rebuild with changing scope, milestone-based or monthly retainer structures are usually safer than fixed-fee pricing.",
        choices: [
          { pillId: "retainer", label: "Monthly retainer", value: find("retainer")?.value ?? "Monthly retainer with written approval for extra work." },
          { pillId: "milestone", label: "Milestone-based", value: find("milestone")?.value ?? "Milestone-based fees with written approvals before each phase." },
        ],
      };
    }
    return {
      explanation: "For defined consulting deliverables, a fixed project fee or milestone schedule is often the simplest starting point.",
      choices: [
        { pillId: "fixed", label: "Fixed project fee", value: find("fixed")?.value ?? "Fixed project fee for agreed deliverables." },
        { pillId: "milestone", label: "Milestone-based", value: find("milestone")?.value ?? "Milestone-based payments tied to deliverables." },
      ],
    };
  }

  if (variable.id === "support_obligations") {
    return {
      explanation: signals.aiRebuild
        ? "Rebuild projects usually include a short business-hours support window after launch, unless you plan a separate maintenance agreement."
        : "Most teams start with reasonable handoff support, then add maintenance only if they need ongoing fixes.",
      choices: [
        { pillId: "business_hours", label: "Business-hours support", value: find("business_hours")?.value ?? "Business-hours support for 30 days after delivery." },
        { pillId: "handoff", label: "Reasonable handoff only", value: find("handoff")?.value ?? "Reasonable handoff and knowledge transfer only." },
      ],
    };
  }

  if (variable.id === "scope_change_approval") {
    return {
      explanation: signals.evolvingScope
        ? "Most teams in this situation use written email approvals so scope changes stay organized without slowing the project."
        : "A signed change order is the clearest option when scope might grow materially.",
      choices: [
        { pillId: "email", label: "Email approval is enough", value: find("email")?.value ?? "Scope changes approved by email from an authorized contact." },
        { pillId: "sow", label: "Signed SOW / change order", value: find("sow")?.value ?? "Material scope changes require a signed SOW or change order." },
      ],
    };
  }

  if (variable.id === "ip_ownership" || variable.id === "ip_allocation") {
    return {
      explanation: signals.aiRebuild
        ? "For internal tooling and automation rebuilds, companies usually own project deliverables while the developer keeps general reusable tools."
        : "Company ownership of project deliverables is the most common default for consulting work.",
      choices: [
        { pillId: "company_deliverables", label: "Company owns deliverables", value: find("company_deliverables")?.value ?? "Company owns project deliverables; developer retains pre-existing tools." },
        { pillId: "developer_tools", label: "Developer keeps reusable tools", value: find("developer_tools")?.value ?? "Company owns deliverables; developer retains reusable libraries and tools." },
      ],
    };
  }

  if (variable.id === "ip_ownership_contradiction") {
    return {
      explanation:
        "Your intake asks for both developer ownership and company exclusive ownership. Most founder-friendly contractor deals give the company the deliverables and let the developer keep reusable tools.",
      choices: [
        { pillId: "split_tools", label: "Developer keeps tools; company owns custom work", value: find("split_tools")?.value ?? "" },
        { pillId: "company_all", label: "Company owns all custom work product", value: find("company_all")?.value ?? "" },
      ],
    };
  }

  if (variable.id === "term_structure_contradiction") {
    return {
      explanation:
        "Month-to-month billing with a three-year maximum term is a common way to honor both flexibility and a longer commitment window.",
      choices: [
        { pillId: "monthly_cap", label: "Month-to-month during a 3-year maximum term", value: find("monthly_cap")?.value ?? "" },
        { pillId: "monthly_notice", label: "Month-to-month with notice", value: find("monthly_notice")?.value ?? "" },
      ],
    };
  }

  if (variable.id === "governing_law_notice" || variable.id === "governing_venue") {
    return {
      explanation: "Delaware is a common default for B2B services agreements when no home state is specified in your intake.",
      choices: [
        { pillId: "de", label: "Delaware", value: find("de")?.value ?? "Governed by the laws of the State of Delaware." },
        { pillId: "ca", label: "California", value: find("ca")?.value ?? "Governed by the laws of the State of California." },
      ],
    };
  }

  return null;
}

export function enrichDealVariables(intakeRaw: string | null | undefined, variables: DealVariable[]): DealVariable[] {
  return variables.map((v) => enrichDealVariableFromIntake(v, intakeRaw));
}
