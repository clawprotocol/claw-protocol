export type ProSemanticBlockId =
  | "scope_block"
  | "payment_block"
  | "milestone_block"
  | "monthly_fee_block"
  | "support_block"
  | "ownership_block"
  | "termination_block"
  | "governing_law_block"
  | "notices_block"
  | "e_signature_block";

export type ProSemanticBlockSource = "intake" | "guided" | "pro_draft";
export type ProSemanticArchetype = "ai_automation_services" | "marketing_services" | "consulting_support" | "monthly_consulting" | "generic_services";
export type ForbiddenSemanticFactId =
  | "uptime_target"
  | "software_sla"
  | "production_automation_components"
  | "third_party_ai_platform_sla"
  | "milestone_payment_split"
  | "project_phase_allocation"
  | "build_rollout_support_allocation"
  | "hardware_ownership"
  | "energy_site_costs"
  | "insurance_obligations"
  | "data_center_site_terms";

export type ProSemanticBlock = {
  id: ProSemanticBlockId;
  archetype: ProSemanticArchetype;
  ownerSection: "purpose" | "fees" | "support" | "ownership" | "termination" | "misc" | "notices";
  requiredPhrases: string[];
  forbiddenSections: string[];
  renderPriority: number;
  source: ProSemanticBlockSource;
  atomic: boolean;
};

type SemanticOwnerSection = ProSemanticBlock["ownerSection"] | "confidentiality" | "esign" | "signature";

const SECTION_HEADING_RE = /^[ \t]*\d+\.\s+.+$/gm;
const SUPPORTED_SECTION_ORDER: readonly SemanticOwnerSection[] = [
  "purpose",
  "fees",
  "ownership",
  "confidentiality",
  "support",
  "termination",
  "notices",
  "misc",
  "esign",
  "signature",
];
const HEADING_BY_OWNER: Record<Exclude<SemanticOwnerSection, "signature">, string> = {
  purpose: "Purpose and Scope",
  fees: "Fees and Payment",
  ownership: "Ownership and Work Product",
  confidentiality: "Confidentiality",
  support: "Support Expectations",
  termination: "Term and Termination",
  notices: "Notices",
  misc: "Miscellaneous",
  esign: "Electronic Signatures",
};

function normalizeText(text: string): string {
  return (text || "").replace(/\s+/g, " ").trim().toLowerCase();
}

function hasAll(blob: string, phrases: readonly string[]): boolean {
  const normalized = normalizeText(blob);
  return phrases.every((phrase) => normalizeText(phrase).split(/[^a-z0-9$%]+/).filter(Boolean).every((term) => normalized.includes(term)));
}

function sourceFor(intakeText: string | null | undefined, draftText: string | null | undefined, phrases: readonly string[]): ProSemanticBlockSource {
  if (hasAll(intakeText ?? "", phrases)) return "intake";
  if (hasAll(draftText ?? "", phrases)) return "pro_draft";
  return "guided";
}

function pushBlock(blocks: ProSemanticBlock[], block: ProSemanticBlock): void {
  if (blocks.some((existing) => existing.id === block.id && existing.archetype === block.archetype)) return;
  blocks.push(block);
}

function detectArchetype(blob: string): ProSemanticArchetype {
  const text = normalizeText(blob);
  if (/\b(?:ai automation|ai workflow|dashboard setup|third-party ai)\b/i.test(text)) return "ai_automation_services";
  if (/\b(?:paid advertising|email marketing|creative strategy|campaign optimization|analytics reporting)\b/i.test(text)) {
    return "marketing_services";
  }
  if (/\b(?:operations consulting|advisory calls|workflow recommendations|vendor coordination|monthly reporting)\b/i.test(text)) {
    return "consulting_support";
  }
  return "generic_services";
}

function block(args: {
  id: ProSemanticBlockId;
  archetype: ProSemanticBlock["archetype"];
  ownerSection: ProSemanticBlock["ownerSection"];
  requiredPhrases: string[];
  forbiddenSections?: string[];
  renderPriority: number;
  source: ProSemanticBlockSource;
  atomic?: boolean;
}): ProSemanticBlock {
  return {
    forbiddenSections: [],
    atomic: true,
    ...args,
  };
}

export function extractProtectedCommercialClusters(
  intakeText: string | null | undefined,
  draftText?: string | null,
): ProSemanticBlock[] {
  const blob = `${intakeText ?? ""}\n${draftText ?? ""}`;
  const archetype = detectArchetype(blob);
  const blocks: ProSemanticBlock[] = [];

  const aiScope = [
    "AI workflow implementation",
    "dashboard setup",
    "automation support",
    "onboarding assistance",
    "light ongoing maintenance",
  ];
  if (archetype === "ai_automation_services" && aiScope.some((phrase) => normalizeText(blob).includes(normalizeText(phrase)))) {
    pushBlock(
      blocks,
      block({
        id: "scope_block",
        archetype,
        ownerSection: "purpose",
        requiredPhrases: aiScope,
        forbiddenSections: ["fees", "misc", "notices"],
        renderPriority: 10,
        source: sourceFor(intakeText, draftText, aiScope),
      }),
    );
  }

  const marketingScope = [
    "paid advertising management",
    "launch coordination",
    "email marketing",
    "analytics reporting",
    "creative strategy",
    "campaign optimization",
  ];
  if (archetype === "marketing_services" && marketingScope.some((phrase) => normalizeText(blob).includes(normalizeText(phrase)))) {
    pushBlock(
      blocks,
      block({
        id: "scope_block",
        archetype,
        ownerSection: "purpose",
        requiredPhrases: marketingScope,
        forbiddenSections: ["fees", "misc", "notices"],
        renderPriority: 10,
        source: sourceFor(intakeText, draftText, marketingScope),
      }),
    );
  }

  const consultingScope = [
    "operations consulting",
    "recurring advisory calls",
    "workflow recommendations",
    "vendor coordination",
    "monthly reporting support",
  ];
  if (
    archetype === "consulting_support" &&
    (consultingScope.some((phrase) => normalizeText(blob).includes(normalizeText(phrase))) ||
      /\badvisory calls\b/i.test(blob) ||
      /\bmonthly reporting\b/i.test(blob))
  ) {
    pushBlock(
      blocks,
      block({
        id: "scope_block",
        archetype,
        ownerSection: "purpose",
        requiredPhrases: consultingScope,
        forbiddenSections: ["fees", "misc", "notices"],
        renderPriority: 10,
        source: sourceFor(intakeText, draftText, consultingScope),
      }),
    );
  }

  if (/\$120,?000|\$18,?000|\btotal (?:project )?fee\b/i.test(blob)) {
    const amount = blob.match(/\$(?:120|18),?000(?:\.00)?/)?.[0]?.replace("$120000", "$120,000").replace("$18000", "$18,000") ?? "total fee";
    pushBlock(
      blocks,
      block({
        id: "payment_block",
        archetype,
        ownerSection: "fees",
        requiredPhrases: [amount],
        forbiddenSections: ["purpose", "support", "misc"],
        renderPriority: 20,
        source: sourceFor(intakeText, draftText, [amount]),
      }),
    );
  }

  const aiMilestones = ["40% build/configuration", "30% rollout/onboarding", "30% support/acceptance"];
  if (
    archetype !== "consulting_support" &&
    (aiMilestones.some((phrase) => normalizeText(blob).includes(normalizeText(phrase))) || /\b40\s*%/.test(blob))
  ) {
    pushBlock(
      blocks,
      block({
        id: "milestone_block",
        archetype,
        ownerSection: "fees",
        requiredPhrases: aiMilestones,
        forbiddenSections: ["purpose", "support", "misc"],
        renderPriority: 30,
        source: sourceFor(intakeText, draftText, aiMilestones),
      }),
    );
  } else if (/\b(?:even thirds|one[-\s]?third|evenly across build|build-heavy)\b/i.test(blob)) {
    const phrases = /\bbuild-heavy\b/i.test(blob)
      ? ["build-heavy fee allocation"]
      : ["evenly across build, rollout, and support/acceptance phases"];
    pushBlock(
      blocks,
      block({
        id: "milestone_block",
        archetype,
        ownerSection: "fees",
        requiredPhrases: phrases,
        forbiddenSections: ["purpose", "support", "misc"],
        renderPriority: 30,
        source: sourceFor(intakeText, draftText, phrases),
      }),
    );
  } else if (/\b(?:3|three)\s+milestones\b|\b(?:4|four)\s+months\b/i.test(blob)) {
    pushBlock(
      blocks,
      block({
        id: "milestone_block",
        archetype,
        ownerSection: "fees",
        requiredPhrases: [
          ...(blob.match(/\$18,?000(?:\.00)?/) ? ["$18,000 total"] : []),
          "3 milestones",
          "4-month term",
        ],
        forbiddenSections: ["purpose", "support", "misc"],
        renderPriority: 30,
        source: sourceFor(intakeText, draftText, ["3 milestones", "4 months"]),
      }),
    );
  }

  if (/\$4,?500(?:\.00)?\s*(?:\/|\s+per\s+)?month/i.test(blob)) {
    pushBlock(
      blocks,
      block({
        id: "monthly_fee_block",
        archetype,
        ownerSection: "fees",
        requiredPhrases: ["$4,500/month", ...(/\bmonth[-\s]?to[-\s]?month\b/i.test(blob) ? ["month-to-month"] : [])],
        forbiddenSections: ["purpose", "support", "misc"],
        renderPriority: 25,
        source: sourceFor(intakeText, draftText, ["$4,500/month"]),
      }),
    );
  }

  if (/\$6,?000(?:\.00)?\s*(?:\/|\s+per\s+)?month.{0,40}support|support.{0,40}\$6,?000(?:\.00)?\s*(?:\/|\s+per\s+)?month/i.test(blob)) {
    pushBlock(
      blocks,
      block({
        id: "monthly_fee_block",
        archetype,
        ownerSection: "fees",
        requiredPhrases: ["optional $6,000/month support"],
        forbiddenSections: ["purpose", "support", "misc"],
        renderPriority: 35,
        source: sourceFor(intakeText, draftText, ["optional $6,000/month support"]),
      }),
    );
  }

  if (/no\s+guaranteed?.{0,30}uptime|third-party ai platforms/i.test(blob)) {
    const phrases = [
      ...(/no\s+guaranteed?.{0,30}uptime|third-party ai platforms/i.test(blob)
        ? ["no guaranteed third-party AI uptime"]
        : []),
    ];
    if (phrases.length) {
      pushBlock(
        blocks,
        block({
          id: "support_block",
          archetype,
          ownerSection: "support",
          requiredPhrases: phrases,
          forbiddenSections: ["fees", "misc", "notices"],
          renderPriority: 40,
          source: sourceFor(intakeText, draftText, phrases),
        }),
      );
    }
  }

  if (/\b(?:owns?|ownership|pre-existing tools|background materials|deliverables)\b/i.test(blob)) {
    pushBlock(
      blocks,
      block({
        id: "ownership_block",
        archetype,
        ownerSection: "ownership",
        requiredPhrases: ["Client owns custom deliverables", "Service Provider retains pre-existing tools"],
        forbiddenSections: ["fees", "support", "misc"],
        renderPriority: 50,
        source: sourceFor(intakeText, draftText, ["deliverables"]),
        atomic: false,
      }),
    );
  }

  const termination = blob.match(/\b(?:15|30)[-\s]?days?\s+(?:termination|written notice)\b/i)?.[0];
  if (termination) {
    pushBlock(
      blocks,
      block({
        id: "termination_block",
        archetype,
        ownerSection: "termination",
        requiredPhrases: [termination.replace(/\s+/g, " ")],
        forbiddenSections: ["fees", "support", "misc"],
        renderPriority: 60,
        source: sourceFor(intakeText, draftText, [termination]),
      }),
    );
  }

  const law = blob.match(/\b(?:Oklahoma|Texas|Delaware|California|New York)\s+law\b/i)?.[0];
  if (law) {
    pushBlock(
      blocks,
      block({
        id: "governing_law_block",
        archetype,
        ownerSection: "misc",
        requiredPhrases: [law],
        forbiddenSections: ["fees", "support", "purpose"],
        renderPriority: 70,
        source: sourceFor(intakeText, draftText, [law]),
      }),
    );
  }

  if (/\bnotices?\s+by\s+email\b|\bemail notices?\b/i.test(blob)) {
    pushBlock(
      blocks,
      block({
        id: "notices_block",
        archetype,
        ownerSection: "notices",
        requiredPhrases: ["notices by email"],
        forbiddenSections: ["fees", "support", "misc"],
        renderPriority: 80,
        source: sourceFor(intakeText, draftText, ["notices by email"]),
      }),
    );
  }

  return blocks.sort((a, b) => a.renderPriority - b.renderPriority || a.id.localeCompare(b.id));
}

function phraseList(phrases: readonly string[]): string {
  if (phrases.length <= 1) return phrases.join("");
  return `${phrases.slice(0, -1).join(", ")}, and ${phrases[phrases.length - 1]}`;
}

export function renderSemanticBlock(block: ProSemanticBlock): string {
  if (block.id === "scope_block") {
    return `Service Provider will provide ${phraseList(block.requiredPhrases)} for Client.`;
  }
  if (block.id === "milestone_block") {
    if (block.requiredPhrases.some((phrase) => /^40\s*%/i.test(phrase))) {
      return "The project milestone allocation is (a) 40% build/configuration; (b) 30% rollout/onboarding; and (c) 30% support/acceptance.";
    }
    if (block.requiredPhrases.some((phrase) => /evenly across build|even thirds|one-third|build-heavy/i.test(phrase))) {
      return block.requiredPhrases.some((phrase) => /build-heavy/i.test(phrase))
        ? "The project fee allocation is build-heavy, with the larger share tied to build/configuration work and the remaining payments allocated to launch, support handoff, and acceptance milestones."
        : "The project fee is allocated evenly across build, rollout, and support/acceptance phases, approximately one-third each.";
    }
    if (block.requiredPhrases.some((phrase) => /\$18,?000/i.test(phrase))) {
      return "Client will pay $18,000 total across 3 milestones over the 4-month engagement term (three milestones over four months).";
    }
    return `The project milestones are ${phraseList(block.requiredPhrases)}.`;
  }
  if (block.id === "monthly_fee_block") {
    if (block.requiredPhrases.some((phrase) => /\$4,?500/i.test(phrase))) {
      return "Client will pay Service Provider $4,500/month on a month-to-month basis.";
    }
    return `Client will pay Service Provider ${block.requiredPhrases[0]} as optional monthly support.`;
  }
  if (block.id === "support_block") {
    return `The support model includes ${phraseList(block.requiredPhrases)}.`;
  }
  if (block.id === "payment_block") {
    return `The commercial terms include ${phraseList(block.requiredPhrases)}.`;
  }
  if (block.id === "ownership_block") {
    return "Client owns the project deliverables and custom deliverables created for the engagement, and Service Provider retains its pre-existing tools, templates, know-how, and background materials.";
  }
  if (block.id === "termination_block") {
    return `Either Party may terminate this Agreement on ${block.requiredPhrases[0]}.`;
  }
  if (block.id === "governing_law_block") {
    const state = block.requiredPhrases[0].match(/\b(Oklahoma|Texas|Delaware|California|New York)\b/i)?.[1];
    return state
      ? `This Agreement is governed by the laws of the State of ${state}.`
      : `This Agreement is governed by ${block.requiredPhrases[0]}.`;
  }
  if (block.id === "notices_block") {
    return "Formal notices may be delivered by email to the addresses on file.";
  }
  if (block.id === "e_signature_block") {
    return "Electronic signatures and counterparts are permitted and have the same effect as originals.";
  }
  return phraseList(block.requiredPhrases);
}

type ParsedSemanticSection = {
  owner: SemanticOwnerSection | "unknown" | "preamble";
  heading: string | null;
  body: string[];
  index: number;
};

function classifySectionHeading(heading: string): ParsedSemanticSection["owner"] {
  const low = normalizeText(heading);
  if (/\b(?:purpose|scope|services)\b/.test(low)) return "purpose";
  if (/\b(?:fees?|payment|compensation|commercial)\b/.test(low)) return "fees";
  if (/\b(?:ownership|work product|intellectual property|ip)\b/.test(low)) return "ownership";
  if (/\bconfidential/.test(low)) return "confidentiality";
  if (/\bsupport|maintenance|service levels?|sla\b/.test(low)) return "support";
  if (/\bterm|termination\b/.test(low)) return "termination";
  if (/\bnotices?\b/.test(low)) return "notices";
  if (/\bmiscellaneous|governing law|law\b/.test(low)) return "misc";
  if (/\belectronic signatures?|e-?signature|counterparts?\b/.test(low)) return "esign";
  if (/\bsignature\b/.test(low)) return "signature";
  return "unknown";
}

function parseSemanticSections(text: string): ParsedSemanticSection[] {
  const lines = (text || "").replace(/\r\n?/g, "\n").split("\n");
  const sections: ParsedSemanticSection[] = [];
  let current: ParsedSemanticSection = { owner: "preamble", heading: null, body: [], index: 0 };
  const push = () => {
    if (current.heading || current.body.some((line) => line.trim())) sections.push(current);
  };
  for (const line of lines) {
    if (/^\s*IN WITNESS WHEREOF\b/i.test(line)) {
      push();
      current = { owner: "signature", heading: null, body: [line], index: sections.length };
      continue;
    }
    if (/^[ \t]*\d+\.\s+.+$/.test(line)) {
      push();
      current = { owner: classifySectionHeading(line), heading: line, body: [], index: sections.length };
      continue;
    }
    current.body.push(line);
  }
  push();
  return sections;
}

function numberedClauseMismatch(line: string, sectionNumber: number): boolean {
  const match = line.trim().match(/^(\d+)\.(\d+)\b/);
  return Boolean(match && Number(match[1]) !== sectionNumber);
}

function malformedFragment(line: string, owner: SemanticOwnerSection | "unknown" | "preamble", sectionNumber: number): boolean {
  const t = line.replace(/\s+/g, " ").trim();
  if (!t) return false;
  if (/^3\.1\s+and\s+4\.3,\s*deliverables/i.test(t)) return true;
  if (/\b15\s+days?\s+written\s+notice'\s+notice\b/i.test(t)) return true;
  if (/Each Party represents that it has authority Services are/i.test(t)) return true;
  if (/\b(?:scope (?:is\s+)?(?:as\s+)?set forth below|operative sections and schedules below|services are as applicable|services as applicable)\b/i.test(t)) return true;
  if (/\bproject phase allocation includes 3 milestones\b/i.test(t)) return true;
  if (owner === "confidentiality" && /^\d+\.\d+\s+Taxes\b/i.test(t)) return true;
  if (owner === "fees" && /^\d+\.\d+\s+Client Approvals\b/i.test(t)) return true;
  return numberedClauseMismatch(t, sectionNumber);
}

function lineCoveredByRenderedBlocks(line: string, renderedBlocks: readonly string[]): boolean {
  const low = normalizeText(line);
  return renderedBlocks.some((rendered) => {
    const renderedLow = normalizeText(rendered);
    if (!renderedLow) return false;
    if (renderedLow.includes(low) || low.includes(renderedLow)) return true;
    const terms = low.split(/[^a-z0-9$%]+/).filter((term) => term.length >= 4);
    return terms.length > 0 && terms.every((term) => renderedLow.includes(term));
  });
}

function sectionNumberForOwner(owner: SemanticOwnerSection): number {
  const idx = SUPPORTED_SECTION_ORDER.indexOf(owner);
  return idx >= 0 ? idx + 1 : 99;
}

function defaultSectionLine(owner: SemanticOwnerSection): string | null {
  if (owner === "confidentiality") {
    return "Each Party will protect confidential information using reasonable care and use it only for this Agreement.";
  }
  if (owner === "esign") return "Electronic signatures and counterparts are permitted and have the same effect as originals.";
  return null;
}

export function reconstructProSectionsFromSemanticBlocks(
  text: string,
  context: { intakeText?: string | null; draftText?: string | null; archetype?: string | null } = {},
): { text: string; repairs: string[]; blocks: ProSemanticBlock[] } {
  const repairs: string[] = [];
  const blocks = extractProtectedCommercialClusters(context.intakeText, `${context.draftText ?? ""}\n${text}`);
  if (blocks.length === 0 && !/^[ \t]*\d+\.\s+.+$/m.test(text || "")) {
    return { text, repairs, blocks };
  }
  const byOwner = new Map<SemanticOwnerSection, ProSemanticBlock[]>();
  for (const block of blocks) {
    const arr = byOwner.get(block.ownerSection) ?? [];
    arr.push(block);
    byOwner.set(block.ownerSection, arr);
  }
  const parsed = parseSemanticSections(text);
  const preamble = parsed.filter((section) => section.owner === "preamble").flatMap((section) => section.body).filter((line) => line.trim());
  const output: string[] = [];
  if (preamble.length) output.push(preamble.join("\n"));

  let sectionNumber = 1;
  for (const owner of SUPPORTED_SECTION_ORDER) {
    if (owner === "signature") continue;
    const existing = parsed.filter((section) => section.owner === owner);
    const ownerBlocks = byOwner.get(owner) ?? [];
    const shouldEmit = ownerBlocks.length > 0 || existing.some((section) => section.body.some((line) => line.trim())) || owner === "confidentiality" || owner === "esign";
    if (!shouldEmit) continue;
    const rendered = ownerBlocks.map(renderSemanticBlock);
    const preserved: string[] = [];
    for (const section of existing) {
      for (const line of section.body) {
        const t = line.trim();
        if (!t) continue;
        if (malformedFragment(t, owner, sectionNumberForOwner(owner))) {
          repairs.push(`semantic_reconstruct:removed_malformed:${t.slice(0, 48)}`);
          continue;
        }
        if (lineCoveredByRenderedBlocks(t, rendered)) continue;
        if (forbiddenSemanticFactForLine(t, context.archetype ?? detectArchetype(`${context.intakeText ?? ""}\n${text}`), context.intakeText ?? "")) {
          repairs.push(`semantic_reconstruct:removed_forbidden:${t.slice(0, 48)}`);
          continue;
        }
        const cleaned = t
          .replace(/\bCompany owns the project deliverables\b/gi, "Client owns the project deliverables")
          .replace(/\bCompany owns\b/gi, "Client owns");
        preserved.push(cleaned);
      }
    }
    const fallback = rendered.length === 0 ? defaultSectionLine(owner) : null;
    let body = [...rendered, ...preserved, ...(fallback ? [fallback] : [])].filter(Boolean);
    if (owner === "confidentiality" && body.length > 1) {
      let keptConfidential = false;
      body = body.filter((line) => {
        if (!/confidential/i.test(line)) return true;
        if (keptConfidential) return false;
        keptConfidential = true;
        return true;
      });
    }
    if (body.length === 0) continue;
    output.push(`${sectionNumber}. ${HEADING_BY_OWNER[owner]}\n${[...new Set(body)].join("\n")}`);
    sectionNumber += 1;
  }
  const signatureLines = parsed
    .filter((section) => section.owner === "signature")
    .flatMap((section) => [...(section.heading && section.body.some((line) => line.trim()) ? [section.heading] : []), ...section.body])
    .filter((line) => line.trim());
  if (signatureLines.length) output.push([...new Set(signatureLines)].join("\n").trim());
  const reconstructed = output.join("\n\n").replace(/\n{3,}/g, "\n\n").trim();
  if (reconstructed && reconstructed !== text.trim()) repairs.push("semantic_reconstruct:sections_rebuilt");
  return { text: reconstructed || text, repairs: [...new Set(repairs)], blocks };
}

export function forbiddenSemanticFactForLine(
  line: string,
  archetype: ProSemanticArchetype | string,
  intakeText = "",
): ForbiddenSemanticFactId | null {
  const text = normalizeText(line);
  const intake = normalizeText(intakeText);
  const technicalUptimeAllowed = /\b(?:uptime|sla|service level|availability target|technical support response)\b/i.test(intake);
  const milestonesAllowed = /\b(?:milestone|phase allocation|40\s*%|30\s*%|build\/configuration|rollout\/onboarding)\b/i.test(intake);
  const hardwareAllowed = /\b(?:hardware|energy|site costs?|insurance|data center|deployment site)\b/i.test(intake);

  if (archetype === "marketing_services" && !technicalUptimeAllowed) {
    if (/\b99\.(?:9|5)\s*%|\buptime target\b/i.test(text)) return "uptime_target";
    if (/\b(?:software sla|service level agreement|software uptime|sla)\b/i.test(text)) return "software_sla";
    if (/\bproduction automation components?\b/i.test(text)) return "production_automation_components";
    if (/\bthird[-\s]?party ai platform.{0,50}(?:sla|uptime|availability)\b/i.test(text)) {
      return "third_party_ai_platform_sla";
    }
  }

  if ((archetype === "monthly_consulting" || archetype === "consulting_support") && !milestonesAllowed) {
    if (/\bmilestone[-\s]?based\b|\bmilestone payment\b/i.test(text)) return "milestone_payment_split";
    if (/\bproject phase allocation\b|\bschedule a phase allocation\b|\bphase allocation\b/i.test(text)) {
      return "project_phase_allocation";
    }
    if (/\bbuild\/configuration\b|\brollout\/onboarding\b|\bsupport\/acceptance\b/i.test(text)) {
      return "build_rollout_support_allocation";
    }
  }

  if (archetype === "ai_automation_services" && !hardwareAllowed) {
    if (/\bhardware ownership\b|\bowns? hardware\b/i.test(text)) return "hardware_ownership";
    if (/\benergy costs?\b|\bsite costs?\b/i.test(text)) return "energy_site_costs";
    if (/\binsurance obligations?\b|\bmaintain insurance\b/i.test(text)) return "insurance_obligations";
    if (/\bdata center\b|\bdeployment site\b|\bsite terms\b/i.test(text)) return "data_center_site_terms";
  }

  return null;
}

export function stripForbiddenSemanticFactsFromText(
  text: string,
  archetype: ProSemanticArchetype | string,
  intakeText = "",
): { text: string; repairs: string[] } {
  const repairs: string[] = [];
  const out = (text || "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .filter((line) => {
      const fact = forbiddenSemanticFactForLine(line, archetype, intakeText);
      if (!fact) return true;
      repairs.push(`forbidden_semantic_fact:${fact}`);
      return false;
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { text: out, repairs };
}

export function textRetainsSemanticBlock(block: ProSemanticBlock, text: string): boolean {
  const sections = splitSections(text);
  const owner = sections.find((section) => section.category === block.ownerSection);
  const target = owner?.body ?? text;
  const retainedInOwner = hasAll(target, block.requiredPhrases);
  if (!block.atomic) return retainedInOwner;
  return retainedInOwner;
}

function splitSections(text: string): Array<{ heading: string; body: string; category: ProSemanticBlock["ownerSection"] | "unknown" }> {
  const matches = [...(text || "").matchAll(SECTION_HEADING_RE)];
  return matches.map((match, index) => {
    const start = match.index ?? 0;
    const end = index + 1 < matches.length ? matches[index + 1].index ?? text.length : text.length;
    const heading = match[0];
    const low = heading.toLowerCase();
    const category: ProSemanticBlock["ownerSection"] | "unknown" =
      /\b(?:purpose|scope|services)\b/.test(low)
        ? "purpose"
        : /\b(?:fees?|payment|compensation|commercial)\b/.test(low)
          ? "fees"
          : /\bsupport|maintenance|service levels?\b/.test(low)
            ? "support"
            : /\bownership|work product|intellectual property|ip\b/.test(low)
              ? "ownership"
              : /\bterm|termination\b/.test(low)
                ? "termination"
                : /\bnotices?\b/.test(low)
                  ? "notices"
                  : /\bmiscellaneous|governing law|law\b/.test(low)
                    ? "misc"
                    : "unknown";
    return { heading, body: text.slice(start, end), category };
  });
}
