import { detectAgreementFamily, type AgreementFamily } from "../agreementFamilyRouter";
import type { CommercialFamilyHint, MaterialMissingItem } from "./types";

const VAGUE_COMMERCIAL_RE =
  /\b(to be agreed|tbd|as discussed|standard terms|mutually agreed|confirm in writing|supplemental schedule)\b/i;

function detectCommercialFamilyHint(intake: string, body: string): CommercialFamilyHint {
  const low = `${intake}\n${body}`.toLowerCase();
  if (/\b(?:saas|software as a service|msa|master\s+services)\b/.test(low)) return "saas_msa";
  if (/\b(?:referral|commission|channel\s+partner)\b/.test(low)) return "referral";
  if (/\b(?:license|licen[cs]ing|sublicen)\b/.test(low)) return "licensing";
  if (/\b(?:partnership|joint venture|profit\s+share)\b/.test(low)) return "partnership";
  if (/\b(?:vendor|supplier|procurement|purchase\s+order)\b/.test(low)) return "vendor";
  if (/\b(?:employment|employee|offer\s+letter)\b/.test(low)) return "employment";
  if (/\b(?:ai|infrastructure|deployment\s+milestone)\b/.test(low) && /\b(?:rollout|platform)\b/.test(low)) {
    return "ai_infrastructure";
  }
  return detectAgreementFamily(intake) as AgreementFamily;
}

function pushItem(
  items: MaterialMissingItem[],
  seen: Set<string>,
  item: Omit<MaterialMissingItem, "agreementFamily"> & { agreementFamily?: CommercialFamilyHint },
  family: CommercialFamilyHint,
) {
  if (seen.has(item.id)) return;
  seen.add(item.id);
  items.push({ ...item, agreementFamily: item.agreementFamily ?? family });
}

function familyQuestions(
  family: CommercialFamilyHint,
  body: string,
  intake: string,
): MaterialMissingItem[] {
  const items: MaterialMissingItem[] = [];
  const seen = new Set<string>();
  const low = body.toLowerCase();
  const intakeLow = intake.toLowerCase();

  const needsPayment =
    !/\b(?:invoice|due within|net\s+\d+|payment|fee|compensation)\b/i.test(low) ||
    VAGUE_COMMERCIAL_RE.test(intakeLow);
  if (needsPayment) {
    pushItem(
      items,
      seen,
      {
        id: "payment_timing",
        severity: "material",
        label: "Payment timing",
        question: "Confirm invoice due date, late payment policy, and currency.",
        whyItMatters: "Payment timing affects cash flow, default risk, and enforceability.",
        suggestedAnswerFormat: "e.g. Net 30, 1.5% monthly late fee, USD",
        affectsSections: ["Payment", "Fees", "Invoicing"],
        canProceedWithoutAnswer: true,
      },
      family,
    );
  }

  if (family === "saas_msa" || /\bsla|uptime|availability\b/i.test(intakeLow)) {
    if (!/\b(?:uptime|service level|sla|maintenance window)\b[\s\S]{0,80}\d+\s*%/i.test(low)) {
      pushItem(
        items,
        seen,
        {
          id: "saas_sla",
          severity: "material",
          label: "SLA targets",
          question: "Confirm uptime target, maintenance windows, and SLA remedies.",
          whyItMatters: "SLA terms define service expectations and buyer remedies.",
          suggestedAnswerFormat: "e.g. 99.9% uptime, 4h critical response, service credits",
          affectsSections: ["Service Levels", "Support", "SLA"],
          canProceedWithoutAnswer: true,
        },
        family,
      );
    }
  }

  if (family === "referral" || /\breferral|commission\b/i.test(intakeLow)) {
    if (!/\b\d+\s*%|\bpercent|\bcommission rate\b/i.test(low)) {
      pushItem(
        items,
        seen,
        {
          id: "referral_economics",
          severity: "material",
          label: "Referral compensation",
          question:
            "What revenue share percentage or formula applies, and for how long after introduction?",
          whyItMatters: "Referral economics must be explicit to avoid disputes on earned fees.",
          suggestedAnswerFormat: "e.g. 15% net revenue, 30-day payout, 12-month clawback",
          affectsSections: ["Compensation", "Referral Fees", "Payment"],
          canProceedWithoutAnswer: true,
        },
        family,
      );
    }
  }

  if (family === "licensing" || /\blicen[cs]e\b/i.test(intakeLow)) {
    if (!/\bsublicen|permitted use|license grant\b/i.test(low)) {
      pushItem(
        items,
        seen,
        {
          id: "license_scope",
          severity: "material",
          label: "License scope",
          question: "Confirm whether sublicensing is permitted and describe permitted use.",
          whyItMatters: "License scope defines what the licensee may do with the IP.",
          suggestedAnswerFormat: "e.g. non-exclusive, no sublicense, internal business use only",
          affectsSections: ["License Grant", "Restrictions", "IP"],
          canProceedWithoutAnswer: true,
        },
        family,
      );
    }
  }

  if (
    family === "consulting_agreement" ||
    family === "services_agreement" ||
    family === "independent_contractor_agreement" ||
    /\bmilestone|deliverable|statement of work\b/i.test(intakeLow)
  ) {
    if (!/\bmilestone[\s\S]{0,120}\b(?:date|due|amount|\$)/i.test(low) && /\bmilestone|deliverable\b/i.test(intakeLow)) {
      pushItem(
        items,
        seen,
        {
          id: "milestone_schedule",
          severity: "material",
          label: "Milestones",
          question: "Confirm milestone approval and acceptance process with dates or amounts.",
          whyItMatters: "Milestone clarity prevents scope drift and payment disputes.",
          suggestedAnswerFormat: "e.g. Phase 1 acceptance by 2026-06-01, $50k on approval",
          affectsSections: ["Deliverables", "Milestones", "Acceptance"],
          canProceedWithoutAnswer: true,
        },
        family,
      );
    }
  }

  if (family === "partnership" || /\b(?:joint\s+venture|jv\b|profit\s+split)\b/i.test(intakeLow)) {
    pushItem(
      items,
      seen,
      {
        id: "jv_contributions",
        severity: "material",
        label: "JV contributions",
        question: "What is each party contributing (capital, labor, deal sourcing, operations)?",
        whyItMatters: "JV disputes often start from unclear contribution expectations.",
        suggestedAnswerFormat: "e.g. Party A funds earnest money; Party B manages rehab",
        affectsSections: ["Contributions", "Roles", "Capital"],
        canProceedWithoutAnswer: true,
      },
      family,
    );
    pushItem(
      items,
      seen,
      {
        id: "jv_ip_governance",
        severity: "material",
        label: "JV IP and governance",
        question: "Who owns resulting IP, and what governance/voting rules apply?",
        whyItMatters: "Ownership and deadlock rules prevent project paralysis.",
        suggestedAnswerFormat: "e.g. 50/50 profit split; unanimous budget approval over $25k",
        affectsSections: ["Intellectual Property", "Governance", "Voting"],
        canProceedWithoutAnswer: true,
      },
      family,
    );
  }

  if (family === "ai_infrastructure" || /\bdeployment|rollout\b/i.test(intakeLow)) {
    if (!/\b(?:uptime|insurance|energy|hardware)\b/i.test(low)) {
      pushItem(
        items,
        seen,
        {
          id: "ai_ops_economics",
          severity: "material",
          label: "Infrastructure operations",
          question:
            "Who owns hardware, who pays energy/site costs, what uptime target applies, and who carries insurance?",
          whyItMatters: "AI infrastructure deals fail without operational and cost allocation clarity.",
          suggestedAnswerFormat: "e.g. Client owns GPUs; vendor ops; 99.5% uptime; mutual insurance",
          affectsSections: ["Operations", "SLA", "Insurance"],
          canProceedWithoutAnswer: true,
        },
        family,
      );
    }
  }

  if (family === "ai_infrastructure" || /\bdeployment|rollout\b/i.test(intakeLow)) {
    if (!/\b(?:launch|go-live|deployment)\b[\s\S]{0,100}\b(?:owner|target|date)\b/i.test(low)) {
      pushItem(
        items,
        seen,
        {
          id: "ai_deployment",
          severity: "material",
          label: "Deployment responsibilities",
          question:
            "Confirm deployment milestone owners, launch targets, and operational responsibilities.",
          whyItMatters: "Infrastructure rollouts need clear ownership before go-live.",
          suggestedAnswerFormat: "e.g. Vendor owns prod deploy; Client owns UAT sign-off by DATE",
          affectsSections: ["Implementation", "Milestones", "Operations"],
          canProceedWithoutAnswer: true,
        },
        family,
      );
    }
  }

  if (family === "nda" || family === "confidentiality_commercial_protections_agreement") {
    if (!/\bsurviv|return|destroy|confidential/i.test(low)) {
      pushItem(
        items,
        seen,
        {
          id: "nda_survival",
          severity: "recommended",
          label: "Confidentiality survival",
          question: "Confirm confidentiality survival period and return/destruction of materials.",
          whyItMatters: "NDAs should state how long duties survive after termination.",
          suggestedAnswerFormat: "e.g. 3 years survival; return materials within 30 days",
          affectsSections: ["Confidentiality", "Term", "Return of Materials"],
          canProceedWithoutAnswer: true,
        },
        family,
      );
    }
  }

  if (!/\b(?:governing law|laws of the state|jurisdiction)\b/i.test(low) || VAGUE_COMMERCIAL_RE.test(intakeLow)) {
    pushItem(
      items,
      seen,
      {
        id: "governing_venue",
        severity: "recommended",
        label: "Governing law / venue",
        question: "Confirm governing law and venue for disputes.",
        whyItMatters: "Forum selection affects litigation cost and enforceability.",
        suggestedAnswerFormat: "e.g. Delaware law; courts in San Francisco County",
        affectsSections: ["Governing Law", "Dispute Resolution"],
        canProceedWithoutAnswer: true,
      },
      family,
    );
  }

  if (!/\b(?:intellectual property|work product|assignment|ownership)\b/i.test(low) && /\bdeliverable|work product|ip\b/i.test(intakeLow)) {
    pushItem(
      items,
      seen,
      {
        id: "ip_allocation",
        severity: "material",
        label: "IP / deliverables ownership",
        question: "Confirm ownership of deliverables and pre-existing IP.",
        whyItMatters: "IP allocation is often the core commercial term in services deals.",
        suggestedAnswerFormat: "e.g. Client owns deliverables; consultant retains pre-existing IP",
        affectsSections: ["Intellectual Property", "Work Product"],
        canProceedWithoutAnswer: true,
      },
      family,
    );
  }

  if (/\bexclusiv|territor/i.test(intakeLow) && !/\bexclusiv|territor|non-compet/i.test(low)) {
    pushItem(
      items,
      seen,
      {
        id: "exclusivity_scope",
        severity: "material",
        label: "Exclusivity scope",
        question: "Confirm exclusivity scope, territory, and carve-outs.",
        whyItMatters: "Exclusivity limits each party's freedom to operate in the market.",
        suggestedAnswerFormat: "e.g. exclusive in US enterprise SaaS; carve-out for existing clients",
        affectsSections: ["Exclusivity", "Territory"],
        canProceedWithoutAnswer: true,
      },
      family,
    );
  }

  if (/\baudit\b/i.test(intakeLow) && !/\baudit\b[\s\S]{0,120}\b(?:notice|scope|records)\b/i.test(low)) {
    pushItem(
      items,
      seen,
      {
        id: "audit_scope",
        severity: "recommended",
        label: "Audit scope",
        question: "Confirm audit scope, notice period, and frequency.",
        whyItMatters: "Audit clauses must be bounded to avoid operational disruption.",
        suggestedAnswerFormat: "e.g. annual SOC2 report; 30 days notice; fees capped",
        affectsSections: ["Audit", "Compliance"],
        canProceedWithoutAnswer: true,
      },
      family,
    );
  }

  return items.slice(0, 14);
}

export function buildMaterialMissingItems(args: {
  intakeRaw?: string | null;
  body: string;
  structuralIssues?: readonly { code: string; message: string }[];
  serverMissing?: readonly string[];
}): MaterialMissingItem[] {
  const intake = (args.intakeRaw || "").trim();
  const body = (args.body || "").trim();
  const family = detectCommercialFamilyHint(intake, body);
  const items = familyQuestions(family, body, intake);
  const seen = new Set(items.map((i) => i.id));

  for (const code of args.structuralIssues || []) {
    if (code.code === "empty_clause") {
      pushItem(
        items,
        seen,
        {
          id: `struct_${code.code}_${items.length}`,
          severity: "polish",
          label: "Section completeness",
          question: `Fill in substance for: ${code.message.slice(0, 120)}`,
          whyItMatters: "Empty headings undermine review confidence.",
          suggestedAnswerFormat: "Short commercial paragraph for the referenced section",
          affectsSections: [],
          canProceedWithoutAnswer: true,
        },
        family,
      );
    }
  }

  for (const m of args.serverMissing || []) {
    const t = String(m || "").trim();
    if (t.length < 4) continue;
    const id = `server_${t.slice(0, 40).replace(/\W+/g, "_")}`;
    pushItem(
      items,
      seen,
      {
        id,
        severity: "material",
        label: "Deal-specific detail",
        question: t.endsWith("?") ? t : `Confirm: ${t}`,
        whyItMatters: "This term was flagged as missing from your intake.",
        suggestedAnswerFormat: "Specific commercial term in plain language",
        affectsSections: [],
        canProceedWithoutAnswer: true,
      },
      family,
    );
  }

  return items;
}

export function materialItemsToClarificationStrings(items: readonly MaterialMissingItem[]): string[] {
  return items.map((i) => i.question).filter(Boolean);
}

export function formatMaterialItemsForRevisePanel(items: readonly MaterialMissingItem[]): string {
  if (!items.length) return "";
  const important = items.filter(
    (i) => i.severity === "critical" || i.severity === "material",
  );
  const optional = items.filter((i) => i.severity === "recommended" || i.severity === "polish");
  const lines: string[] = [];
  if (important.length) {
    lines.push("Confirm these deal terms before execution:");
    for (const i of important.slice(0, 7)) {
      lines.push(`• ${i.question}`);
    }
  }
  if (optional.length) {
    lines.push("", "Recommended before signature:");
    for (const i of optional.slice(0, 4)) {
      lines.push(`• ${i.question}`);
    }
  }
  return lines.join("\n");
}
