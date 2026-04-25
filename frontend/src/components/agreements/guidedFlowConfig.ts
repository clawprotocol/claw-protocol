/**
 * Type-specific guided conversation scripts (copy + field order).
 * Routing is driven by resolveGuidedFlowId — see agreementIntakeDraftModel.
 */

export type GuidedFlowId = "nda" | "contractor" | "consulting" | "payment_plan" | "default";

/** Keys used across flows; not every flow uses every key. */
export type GuidedFieldKey =
  | "parties"
  | "confidential_scope"
  | "confidentiality_structure"
  | "duration"
  | "extras"
  | "scope"
  | "payment"
  | "term";

export type GuidedFieldCopy = {
  question: string;
  example: string;
  /** Short labels for quick append (optional). */
  quickReplies?: string[];
};

export type GuidedFlowConfig = {
  id: GuidedFlowId;
  /** Short product label for progress / analytics. */
  label: string;
  /** Line shown after starter or first lock-in (replaces generic buildActionAcknowledgementLine when set). */
  actionAcknowledgement: string;
  fieldOrder: GuidedFieldKey[];
  fields: Partial<Record<GuidedFieldKey, GuidedFieldCopy>>;
};

const COMMON_EXTRAS: GuidedFieldCopy = {
  question: "Anything else to include, or should we draft now?",
  example: "For example: “Add Delaware governing law.” or “Draft now.”",
};

export const GUIDED_FLOW_CONFIGS: Record<GuidedFlowId, GuidedFlowConfig> = {
  nda: {
    id: "nda",
    label: "NDA",
    actionAcknowledgement: "✓ Got it — starting a simple NDA",
    fieldOrder: [
      "parties",
      "confidential_scope",
      "confidentiality_structure",
      "duration",
      "extras",
    ],
    fields: {
      parties: {
        question: "Who are the two parties?",
        example: "Between Acme Inc and John Smith.",
      },
      confidential_scope: {
        question: "What information needs to stay confidential?",
        example: "Product plans, financials, and customer data.",
      },
      confidentiality_structure: {
        question: "Should both sides keep information confidential, or just one side?",
        example: "Both sides.",
        quickReplies: ["Mutual — both sides protect confidential information", "One-way — only one side shares confidential information"],
      },
      duration: {
        question: "How long should the confidentiality obligation last?",
        example: "2 years.",
      },
      extras: COMMON_EXTRAS,
    },
  },
  contractor: {
    id: "contractor",
    label: "Contractor",
    actionAcknowledgement: "✓ Got it — starting a contractor agreement",
    fieldOrder: ["parties", "scope", "payment", "term", "extras"],
    fields: {
      parties: {
        question: "Who are the parties?",
        example: "Acme Inc and Jane Doe (contractor).",
      },
      scope: {
        question: "What is this agreement for?",
        example: "Design and implementation of the marketing site.",
      },
      payment: {
        question: "How much should be paid, and when?",
        example: "$5,000 flat, half on signing and half on delivery.",
      },
      term: {
        question: "How long should it last?",
        example: "Three months, with optional renewal.",
      },
      extras: COMMON_EXTRAS,
    },
  },
  consulting: {
    id: "consulting",
    label: "Consulting",
    actionAcknowledgement: "✓ Got it — starting a consulting agreement",
    fieldOrder: ["parties", "scope", "payment", "term", "extras"],
    fields: {
      parties: {
        question: "Who is the client, and who is the consultant?",
        example: "Between Acme Inc and Northwind Advisors LLC.",
      },
      scope: {
        question: "What is the consultant delivering?",
        example: "Quarterly strategy reviews and a written roadmap.",
      },
      payment: {
        question: "What are the fees and payment schedule?",
        example: "$10,000 monthly, invoiced on the first of each month.",
      },
      term: {
        question: "What’s the engagement period?",
        example: "Six months from the effective date.",
      },
      extras: COMMON_EXTRAS,
    },
  },
  payment_plan: {
    id: "payment_plan",
    label: "Payment plan",
    actionAcknowledgement: "✓ Got it — starting an agreement with a payment schedule",
    fieldOrder: ["parties", "scope", "payment", "term", "extras"],
    fields: {
      parties: {
        question: "Who are the two parties?",
        example: "You and the other business or person.",
      },
      scope: {
        question: "What is this payment for?",
        example: "Software license and onboarding support.",
      },
      payment: {
        question: "What’s the payment schedule?",
        example: "Three installments: 40% on signing, 30% at milestone A, 30% at completion.",
      },
      term: {
        question: "Over what period do payments run?",
        example: "90 days from the effective date.",
      },
      extras: COMMON_EXTRAS,
    },
  },
  default: {
    id: "default",
    label: "Agreement",
    actionAcknowledgement: "✓ Got it — we’ll shape this with you",
    fieldOrder: ["parties", "scope", "payment", "term", "extras"],
    fields: {
      parties: {
        question: "Who are the two parties?",
        example: "Between Acme Inc and John Smith.",
      },
      scope: {
        question: "What is this agreement for?",
        example: "A short purpose — what work or obligations are included.",
      },
      payment: {
        question: "How much should be paid?",
        example: "Fixed fee, hourly, milestones, or no payment if that applies.",
      },
      term: {
        question: "How long should it last?",
        example: "One year from signing, or until a stated end date.",
      },
      extras: COMMON_EXTRAS,
    },
  },
};

export function getGuidedFlowConfig(id: GuidedFlowId): GuidedFlowConfig {
  return GUIDED_FLOW_CONFIGS[id] ?? GUIDED_FLOW_CONFIGS.default;
}

/** Short transient line after a field advances (product copy, not internal IDs). */
export function getCaptureAcknowledgement(flowId: GuidedFlowId, field: GuidedFieldKey): string {
  switch (field) {
    case "parties":
      return "✓ Parties captured";
    case "confidential_scope":
      return "✓ Confidential information captured";
    case "confidentiality_structure":
      return "✓ Confidentiality structure captured";
    case "duration":
      return "✓ Duration captured";
    case "scope":
      return "✓ Scope captured";
    case "payment":
      return "✓ Payment captured";
    case "term":
      return "✓ Timeframe captured";
    case "extras":
      return flowId === "nda" ? "✓ Notes captured" : "✓ Details captured";
    default:
      return "✓ Saved";
  }
}
