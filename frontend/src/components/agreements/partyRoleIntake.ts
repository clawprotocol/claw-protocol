/**
 * Optional party *relationship* labels for simple-create intake (never required for progress).
 */

import type { ParsedDraftShape } from "./intakeSmartDefaults";

export type IntakePartyRelationship =
  | "unset"
  | "services"
  | "collaboration"
  | "confidentiality_one_way"
  | "confidentiality_mutual"
  | "custom";

export type IntakePartyRoleLabels = {
  relationship: IntakePartyRelationship;
  /** Role label aligned with first party in `parsed.parties[0]` */
  label1: string;
  /** Role label aligned with second party */
  label2: string;
};

export const defaultIntakePartyRoleLabels = (): IntakePartyRoleLabels => ({
  relationship: "unset",
  label1: "",
  label2: "",
});

const SERVICES: [string, string] = ["Service Provider", "Client"];
const COLLAB: [string, string] = ["Party A", "Party B"];
const CONF_OW: [string, string] = ["Disclosing Party", "Receiving Party"];
const CONF_MUTUAL: [string, string] = ["Party", "Party"];

export function presetLabelsFor(relationship: Exclude<IntakePartyRelationship, "unset" | "custom">): [string, string] {
  switch (relationship) {
    case "services":
      return SERVICES;
    case "collaboration":
      return COLLAB;
    case "confidentiality_one_way":
      return CONF_OW;
    case "confidentiality_mutual":
      return CONF_MUTUAL;
    default:
      return COLLAB;
  }
}

/** Suggested order for relationship options (first = most relevant). */
export function inferRelationshipOptionOrder(corpus: string): Array<"services" | "collaboration" | "confidentiality"> {
  const c = corpus.toLowerCase();
  const hasNda =
    /\b(nda|non[-\s]?disclosure|confidential|proprietary\s+information|trade\s+secret)\b/i.test(c) ||
    /\b(mutual\s+nda|one[-\s]?way\s+nda)\b/i.test(c);
  const hasSvc =
    /\b(services|consulting|consultant|contractor|freelance|client|customer|vendor|provider|subscription|saas)\b/i.test(
      c,
    );
  const hasCollab = /\b(partnership|joint\s+venture|collaborat|co[-\s]?develop|together\s+we)\b/i.test(c);
  const out: Array<"services" | "collaboration" | "confidentiality"> = [];
  const push = (x: "services" | "collaboration" | "confidentiality") => {
    if (!out.includes(x)) out.push(x);
  };
  if (hasNda) push("confidentiality");
  if (hasSvc) push("services");
  if (hasCollab) push("collaboration");
  push("services");
  push("collaboration");
  push("confidentiality");
  return out;
}

/**
 * Maps optional UI labels onto API draft parties. When unset, both sides use generic `party`.
 * Preserves all parties (2+), applying role labels to the first two.
 */
export function applyIntakePartyRoleOverlay(parsed: ParsedDraftShape, roles: IntakePartyRoleLabels): ParsedDraftShape {
  const parties = parsed.parties || [];
  if (parties.length < 2) return parsed;
  const [p0, p1, ...rest] = parties;
  if (roles.relationship === "unset") {
    return {
      ...parsed,
      parties: [
        { ...p0, role: "party" },
        { ...p1, role: "party" },
        ...rest.map((p) => ({ ...p, role: p.role || "party" })),
      ],
    };
  }
  const a = (roles.label1 || "").trim() || "party";
  const b = (roles.label2 || "").trim() || "party";
  return {
    ...parsed,
    parties: [
      { ...p0, role: a },
      { ...p1, role: b },
      ...rest.map((p) => ({ ...p, role: p.role || "party" })),
    ],
  };
}
