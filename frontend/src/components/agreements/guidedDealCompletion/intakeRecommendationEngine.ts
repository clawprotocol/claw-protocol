import { analyzeConsultingIntake } from "./consultingGuidedIntake";
import { analyzeServicesMigrationIntake } from "./servicesMigrationGuidedIntake";
import type { DealVariable, DealVariableDefault } from "./types";

export const RECOMMEND_PILL_ID = "recommend";

export type RecommendChoice = { pillId: string; label: string; value: string };

export type RecommendForMeResult = {
  explanation: string;
  why: string;
  primary: RecommendChoice;
  alternatives: RecommendChoice[];
  /** When true, apply primary immediately (single clear best default). */
  applyDirect: boolean;
};

/** @deprecated Use {@link RecommendForMeResult}.choices */
export type LegacyRecommendForMeResult = {
  explanation: string;
  choices: RecommendChoice[];
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

function findPill(variable: DealVariable, pillId: string): DealVariableDefault | undefined {
  return variable.suggestedDefaults.find((p) => p.id === pillId);
}

function choiceFromPill(variable: DealVariable, pillId: string, fallbackLabel?: string): RecommendChoice {
  const pill = findPill(variable, pillId);
  return {
    pillId,
    label: pill?.label ?? fallbackLabel ?? pillId,
    value: (pill?.value ?? pill?.label ?? fallbackLabel ?? "").trim(),
  };
}

/** Parse monthly fee hints like "monthly payment probably around 6k". */
export function parseMonthlyPaymentUsdHint(intakeRaw?: string | null): number | null {
  const intake = intakeRaw || "";
  const monthlySlice =
    intake.match(/(?:^|\n)[^\n]{0,120}\b(?:monthly|per\s+month|\/\s*mo)\b[^\n]{0,80}/i)?.[0] ?? intake;
  const m =
    monthlySlice.match(/(?:around|about|probably)?\s*\$?\s*(\d+(?:\.\d+)?)\s*(k\b)?/i) ??
    intake.match(/\b(?:around|about|probably)\s*\$?\s*(\d+(?:\.\d+)?)\s*(k\b)?/i);
  if (!m) return null;
  let n = parseFloat(m[1]);
  if (Number.isNaN(n) || n <= 0) return null;
  if ((m[2] || "").toLowerCase().startsWith("k")) n *= 1000;
  return n;
}

function buildRecommendResult(args: {
  explanation: string;
  why: string;
  primary: RecommendChoice;
  alternatives?: RecommendChoice[];
  applyDirect?: boolean;
}): RecommendForMeResult {
  const alternatives = (args.alternatives ?? []).filter((a) => a.pillId !== args.primary.pillId);
  return {
    explanation: args.explanation,
    why: args.why,
    primary: args.primary,
    alternatives,
    applyDirect: args.applyDirect ?? alternatives.length === 0,
  };
}

export function enrichDealVariableFromIntake(variable: DealVariable, intakeRaw?: string | null): DealVariable {
  const signals = analyzeConsultingIntake(intakeRaw);
  const migration = analyzeServicesMigrationIntake(intakeRaw);
  const pills = withRecommendPill(variable.suggestedDefaults);
  let recommendedPillId: string | undefined;
  let recommendedLabel: string | undefined;

  if (variable.id === "project_fee_phase_confirmation") {
    if (migration.mentionsPhases && migration.mentionsSupport) {
      recommendedPillId = "build_heavy";
      recommendedLabel = "Recommended from your intake";
    } else if (migration.mentionsPhases) {
      recommendedPillId = "even_split";
      recommendedLabel = "Recommended from your intake";
    }
  } else if (variable.id === "phase_payment_allocation") {
    recommendedPillId = migration.mentionsSupport ? "build_heavy" : "even_thirds";
    recommendedLabel = "Recommended from your intake";
  } else if (variable.id === "total_fee_confirmation") {
    if (parseMonthlyPaymentUsdHint(intakeRaw)) {
      recommendedPillId = "confirm_intake";
      recommendedLabel = "Recommended from your intake";
    } else if (migration.vagueFee) {
      recommendedPillId = "120k";
      recommendedLabel = "Most likely fit";
    }
  } else if (variable.id === "payment_structure") {
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
    project_fee_phase_confirmation:
      "Total fee and phase split drive invoices, milestones, and support economics.",
    phase_payment_allocation:
      "Phase allocation belongs in Schedule A so build, rollout, and support are enforceable.",
    total_fee_confirmation: "A stated total fee avoids “to be confirmed” disputes at signing.",
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
): RecommendForMeResult {
  const signals = analyzeConsultingIntake(intakeRaw);
  const migration = analyzeServicesMigrationIntake(intakeRaw);
  const monthlyUsd = parseMonthlyPaymentUsdHint(intakeRaw);

  if (variable.id === "project_fee_phase_confirmation") {
    const buildHeavy = choiceFromPill(variable, "build_heavy");
    const evenSplit = choiceFromPill(variable, "even_split");
    if (monthlyUsd && monthlyUsd < 20_000) {
      const generated: RecommendChoice = {
        pillId: "generated_monthly_phases",
        label: `~$${monthlyUsd.toLocaleString()}/month with phased build, rollout, and support`,
        value: `Total engagement priced at approximately $${monthlyUsd.toLocaleString()} per month, with fees allocated across build, rollout, and support phases as set out in Schedule A (suggested starting split: one-third each phase unless the parties agree otherwise).`,
      };
      return buildRecommendResult({
        explanation: `Your intake mentions about $${monthlyUsd.toLocaleString()} per month while the draft still needs a clear total and phase split.`,
        why: "A monthly services frame with an even phase split is a practical default when the total project fee is still informal.",
        primary: generated,
        alternatives: [buildHeavy, evenSplit],
        applyDirect: false,
      });
    }
    if (migration.mentionsPhases && migration.mentionsSupport) {
      return buildRecommendResult({
        explanation: "Your intake mentions build, rollout, and support — a build-heavy split is a common default for automation projects.",
        why: "More budget up front for build and rollout, with a smaller slice reserved for first-year support.",
        primary: buildHeavy,
        alternatives: [evenSplit],
        applyDirect: true,
      });
    }
    return buildRecommendResult({
      explanation: "When phases are mentioned but amounts are vague, an even split across build, rollout, and support is a simple starting point.",
      why: "Keeps phase economics balanced until you refine amounts in Schedule A.",
      primary: evenSplit,
      alternatives: [buildHeavy],
      applyDirect: true,
    });
  }

  if (variable.id === "phase_payment_allocation") {
    const buildHeavy = choiceFromPill(variable, "build_heavy", "Build-heavy split");
    const evenThirds = choiceFromPill(variable, "even_thirds", "Even thirds across phases");
    const milestone = choiceFromPill(variable, "milestone", "Milestone triggers");
    const primary = migration.mentionsSupport ? buildHeavy : evenThirds;
    return buildRecommendResult({
      explanation: "Schedule A should spell out how fees move across build, rollout, and support.",
      why: migration.mentionsSupport
        ? "Support is in scope — reserving part of the fee for post-launch support avoids surprises."
        : "Even thirds is the simplest default when phase amounts are still open.",
      primary,
      alternatives: [milestone, migration.mentionsSupport ? evenThirds : buildHeavy],
      applyDirect: true,
    });
  }

  if (variable.id === "total_fee_confirmation") {
    if (monthlyUsd) {
      const annual = monthlyUsd * 12;
      const generated: RecommendChoice = {
        pillId: "generated_monthly_total",
        label: `~$${monthlyUsd.toLocaleString()}/month (~$${annual.toLocaleString()}/year)`,
        value: `Total contract value estimated at approximately $${annual.toLocaleString()} USD annually, based on about $${monthlyUsd.toLocaleString()} per month as stated in the intake.`,
      };
      return buildRecommendResult({
        explanation: `Your intake suggests about $${monthlyUsd.toLocaleString()} per month — we can state an annual total for the agreement.`,
        why: "Converting a monthly estimate to an annual total gives a concrete fee line while staying close to your intake.",
        primary: generated,
        alternatives: [choiceFromPill(variable, "120k"), choiceFromPill(variable, "confirm_intake")],
        applyDirect: false,
      });
    }
    const primary = choiceFromPill(variable, "120k");
    return buildRecommendResult({
      explanation: "Your intake references a rough project budget — confirming a total fee reduces disputes later.",
      why: "A stated total fee is easier to enforce than “to be confirmed” language.",
      primary,
      alternatives: [choiceFromPill(variable, "confirm_intake")],
      applyDirect: migration.vagueFee,
    });
  }

  if (variable.id === "payment_structure") {
    if (signals.evolvingScope || signals.aiRebuild) {
      const retainer = choiceFromPill(variable, "retainer", "Monthly retainer");
      const milestone = choiceFromPill(variable, "milestone", "Milestone-based");
      return buildRecommendResult({
        explanation:
          "Because your intake described evolving scope, milestone-based or monthly retainer structures are usually safer than a single fixed fee.",
        why: "Retainers and milestones leave room for scope changes without renegotiating the whole deal.",
        primary: monthlyUsd ? retainer : milestone,
        alternatives: [monthlyUsd ? milestone : retainer],
        applyDirect: false,
      });
    }
    const fixed = choiceFromPill(variable, "fixed", "Fixed project fee");
    const milestone = choiceFromPill(variable, "milestone", "Milestone-based");
    return buildRecommendResult({
      explanation: "For defined deliverables, a fixed project fee or milestone schedule is often the simplest starting point.",
      why: "Fixed or milestone pricing matches a scoped automation build when requirements are relatively stable.",
      primary: fixed,
      alternatives: [milestone],
      applyDirect: false,
    });
  }

  if (variable.id === "support_obligations") {
    const business = choiceFromPill(variable, "business_hours", "Business-hours support");
    const handoff = choiceFromPill(variable, "handoff", "Reasonable handoff only");
    return buildRecommendResult({
      explanation: signals.aiRebuild
        ? "Rebuild projects usually include a short business-hours support window after launch."
        : "Most teams start with reasonable handoff support, then add maintenance only if needed.",
      why: signals.mentionsSupport
        ? "Your intake mentions support — a short post-launch window is a practical default."
        : "Handoff-only is the lightest option when ongoing support is not defined yet.",
      primary: signals.mentionsSupport || signals.aiRebuild ? business : handoff,
      alternatives: [signals.mentionsSupport || signals.aiRebuild ? handoff : business],
      applyDirect: true,
    });
  }

  if (variable.id === "scope_change_approval") {
    const email = choiceFromPill(variable, "email", "Email approval is enough");
    const sow = choiceFromPill(variable, "sow", "Signed SOW / change order");
    return buildRecommendResult({
      explanation: signals.evolvingScope
        ? "Written email approvals keep evolving scope organized without slowing delivery."
        : "A signed change order is clearest when scope might grow materially.",
      why: signals.evolvingScope
        ? "Matches flexible automation / workflow work where requirements change often."
        : "Stronger control when extra work should not start without a signed change.",
      primary: signals.evolvingScope ? email : sow,
      alternatives: [signals.evolvingScope ? sow : email],
      applyDirect: true,
    });
  }

  if (variable.id === "ip_ownership" || variable.id === "ip_allocation") {
    const company = choiceFromPill(variable, "company_deliverables", "Company owns deliverables");
    const developer = choiceFromPill(variable, "developer_tools", "Developer keeps reusable tools");
    return buildRecommendResult({
      explanation: signals.aiRebuild
        ? "For internal automation work, the company usually owns deliverables while the developer keeps reusable tools."
        : "Company ownership of project deliverables is the most common default for services work.",
      why: "Aligns with your intake asking for ownership of what gets built.",
      primary: company,
      alternatives: [developer],
      applyDirect: true,
    });
  }

  if (variable.id === "ip_ownership_contradiction") {
    const split = choiceFromPill(variable, "split_tools", "Developer keeps tools; company owns custom work");
    const companyAll = choiceFromPill(variable, "company_all", "Company owns all custom work product");
    return buildRecommendResult({
      explanation:
        "Your intake asks for both developer ownership and company exclusive ownership — a split is the usual fix.",
      why: "Company gets custom work product; developer keeps reusable libraries and tools.",
      primary: split,
      alternatives: [companyAll],
      applyDirect: false,
    });
  }

  if (variable.id === "term_structure_contradiction") {
    const cap = choiceFromPill(variable, "monthly_cap", "Month-to-month during a 3-year maximum term");
    const notice = choiceFromPill(variable, "monthly_notice", "Month-to-month with notice");
    return buildRecommendResult({
      explanation: "Month-to-month with a maximum term window is a common way to balance flexibility and commitment.",
      why: "Honors both month-to-month language and a longer cap mentioned in the intake.",
      primary: cap,
      alternatives: [notice],
      applyDirect: true,
    });
  }

  if (variable.id === "governing_law_notice" || variable.id === "governing_venue") {
    const de = choiceFromPill(variable, "de", "Delaware");
    const ca = choiceFromPill(variable, "ca", "California");
    return buildRecommendResult({
      explanation: "Delaware is a common B2B default when no home state is specified in your intake.",
      why: "Neutral, widely used governing law for technology services agreements.",
      primary: de,
      alternatives: [ca],
      applyDirect: true,
    });
  }

  return buildFallbackRecommendForMe(variable, intakeRaw);
}

/** Never return null — always surface a card or direct apply path. */
export function buildFallbackRecommendForMe(
  variable: DealVariable,
  intakeRaw?: string | null,
): RecommendForMeResult {
  void intakeRaw;
  if (variable.recommendedPillId) {
    const primary = choiceFromPill(variable, variable.recommendedPillId);
    if (primary.value) {
      return buildRecommendResult({
        explanation: variable.recommendedLabel
          ? `${variable.recommendedLabel} for this question.`
          : "LawDog picked the closest default for your intake.",
        why: "Based on patterns in your prompt and agreement type.",
        primary,
        alternatives: variable.suggestedDefaults
          .filter((p) => p.id !== RECOMMEND_PILL_ID && p.id !== "custom" && p.id !== variable.recommendedPillId && p.value)
          .slice(0, 2)
          .map((p) => ({ pillId: p.id, label: p.label, value: p.value })),
        applyDirect: true,
      });
    }
  }
  const selectable = variable.suggestedDefaults.filter(
    (p) => p.id !== RECOMMEND_PILL_ID && p.id !== "custom" && (p.value || "").trim().length > 0,
  );
  const primary = selectable[0]
    ? { pillId: selectable[0].id, label: selectable[0].label, value: selectable[0].value }
    : {
        pillId: "custom",
        label: "Custom",
        value: "Use commercially reasonable terms typical for this type of agreement.",
      };
  return buildRecommendResult({
    explanation: "LawDog does not have a single strong signal for this item — review the safest practical option below.",
    why: "Pick the closest match, or use Custom to describe your preference in plain language.",
    primary,
    alternatives: selectable.slice(1, 3).map((p) => ({ pillId: p.id, label: p.label, value: p.value })),
    applyDirect: false,
  });
}

export function enrichDealVariables(intakeRaw: string | null | undefined, variables: DealVariable[]): DealVariable[] {
  return variables.map((v) => enrichDealVariableFromIntake(v, intakeRaw));
}
