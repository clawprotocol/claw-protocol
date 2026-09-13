/**
 * Core Paid Journey customer-acceptance matrix.
 *
 * Written before production-handler edits. Rows are customer-visible handoffs:
 * intake → clarifications → substantive visible agreement → recipient review
 * OR direct e-signing, plus refresh/dashboard continuity.
 *
 * Workflow proof uses production frontend/backend and isolated storage.
 * The live-model boundary may be stubbed. Stub output does **not** prove
 * live-model quality. See CORE_PAID_JOURNEY_LIVE_MODEL_PROPOSAL.
 */

export const CORE_PAID_JOURNEY_SCENARIO_ID = "harbor-ironvale-consulting-v1";

export const CORE_PAID_JOURNEY_SPARSE_INTAKE =
  "need a consulting agreement for about 48k";

export const CORE_PAID_JOURNEY_FILLED_INTAKE =
  "Draft a consulting services agreement between Harbor Peak Analytics LLC (Consultant) and Ironvale Manufacturing Inc. (Client). Scope is AI workflow implementation. Fixed fee $48,000. Term twelve months starting October 1, 2026. Governing law Delaware. Consultant owns pre-existing tools; Client owns deliverables after payment. Consultant signer Maya Chen, maya.chen@harborpeak.test. Client signer Jordan Hale, jordan.hale@ironvale.test.";

export type CorePaidJourneyExpectedFacts = {
  titleCue: string;
  parties: readonly { name: string; role: string }[];
  scope: string;
  economics: string;
  duration: string;
  startDate: string;
  governingLaw: string;
  ipConsultant: string;
  ipClient: string;
  signers: readonly { name: string; email: string; party: string }[];
  forbiddenInventedParties: readonly string[];
  forbiddenPlaceholders: readonly RegExp[];
};

export const CORE_PAID_JOURNEY_EXPECTED_FACTS: CorePaidJourneyExpectedFacts = {
  titleCue: "CONSULTING SERVICES AGREEMENT",
  parties: [
    { name: "Harbor Peak Analytics LLC", role: "Consultant" },
    { name: "Ironvale Manufacturing Inc.", role: "Client" },
  ],
  scope: "AI workflow implementation",
  economics: "$48,000",
  duration: "twelve months",
  startDate: "October 1, 2026",
  governingLaw: "Delaware",
  ipConsultant: "pre-existing tools",
  ipClient: "deliverables after payment",
  signers: [
    { name: "Maya Chen", email: "maya.chen@harborpeak.test", party: "Harbor Peak Analytics LLC" },
    { name: "Jordan Hale", email: "jordan.hale@ironvale.test", party: "Ironvale Manufacturing Inc." },
  ],
  forbiddenInventedParties: ["Orion Labs", "Contoso Retail", "Acme Corp", "Party A", "Party B"],
  forbiddenPlaceholders: [
    /\[insert[^\]]*\]/i,
    /lorem ipsum/i,
    /tbd\b/i,
    /tk\b/i,
    /\bxxx+\b/i,
    /your company here/i,
  ],
};

export type CorePaidJourneyRowId =
  | "I1_sparse_asks_targeted_questions"
  | "I2_retains_answers_does_not_reask"
  | "I3_missing_facts_are_not_invented"
  | "Q1_article_matches_expected_facts"
  | "Q2_article_rejects_placeholders_and_filler"
  | "A1_review_recipient_reads_correct_version"
  | "A2_review_recipient_can_approve"
  | "A3_review_propose_cannot_silently_replace"
  | "A4_owner_approved_change_is_explicit_revision"
  | "B1_direct_sign_skips_mandatory_review"
  | "B2_signer_reads_locked_version_and_completes"
  | "B3_owner_final_record_after_direct_sign"
  | "C1_refresh_preserves_paper_version_path"
  | "C2_dashboard_reopen_same_agreement";

export type CorePaidJourneyRow = {
  id: CorePaidJourneyRowId;
  area: "interview" | "quality" | "review" | "direct_sign" | "continuity";
  title: string;
  proof: "workflow" | "workflow_plus_stub_output";
};

export const CORE_PAID_JOURNEY_MATRIX: readonly CorePaidJourneyRow[] = [
  {
    id: "I1_sparse_asks_targeted_questions",
    area: "interview",
    title: "Sparse paid intake asks targeted questions for missing material facts",
    proof: "workflow",
  },
  {
    id: "I2_retains_answers_does_not_reask",
    area: "interview",
    title: "Filled answers are retained and completed questions are not re-asked",
    proof: "workflow",
  },
  {
    id: "I3_missing_facts_are_not_invented",
    area: "interview",
    title: "Missing material information is not invented and is not a ready-to-sign claim",
    proof: "workflow",
  },
  {
    id: "Q1_article_matches_expected_facts",
    area: "quality",
    title: "Rendered document article contains parties, roles, scope, obligations, economics, dates, and law",
    proof: "workflow_plus_stub_output",
  },
  {
    id: "Q2_article_rejects_placeholders_and_filler",
    area: "quality",
    title: "Article has no placeholders, filler, or unexplained invented counterparties",
    proof: "workflow_plus_stub_output",
  },
  {
    id: "A1_review_recipient_reads_correct_version",
    area: "review",
    title: "Send for review: recipient reads the same durable agreement and version",
    proof: "workflow",
  },
  {
    id: "A2_review_recipient_can_approve",
    area: "review",
    title: "Recipient can approve the owner paper",
    proof: "workflow",
  },
  {
    id: "A3_review_propose_cannot_silently_replace",
    area: "review",
    title: "Recipient proposed changes cannot silently replace owner-approved paper",
    proof: "workflow",
  },
  {
    id: "A4_owner_approved_change_is_explicit_revision",
    area: "review",
    title: "An owner-approved change creates an explicit revision before signing",
    proof: "workflow",
  },
  {
    id: "B1_direct_sign_skips_mandatory_review",
    area: "direct_sign",
    title: "Send directly for signature does not require a recipient-review round",
    proof: "workflow",
  },
  {
    id: "B2_signer_reads_locked_version_and_completes",
    area: "direct_sign",
    title: "Intended signer reads the locked version, completes ceremony, durable completion",
    proof: "workflow",
  },
  {
    id: "B3_owner_final_record_after_direct_sign",
    area: "direct_sign",
    title: "Owner final record shows the same agreement after direct signing",
    proof: "workflow",
  },
  {
    id: "C1_refresh_preserves_paper_version_path",
    area: "continuity",
    title: "Refresh preserves answers, visible paper, participants, version, and delivery path",
    proof: "workflow",
  },
  {
    id: "C2_dashboard_reopen_same_agreement",
    area: "continuity",
    title: "Dashboard reopen keeps the same server-issued agreement; no Free Starter reset",
    proof: "workflow",
  },
] as const;

/** Stub padding retained as a failing negative case — never a quality pass. */
export const CORE_PAID_JOURNEY_REPETITIVE_FILLER_PHRASE =
  "Operative consulting detail on discovery, implementation, acceptance, and handoff.";

export type ArticlePresentationIssue = {
  code: "date_line_broken" | "section_order";
  detail: string;
};

function escapeRe(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function normalizeArticleWhitespace(article: string): string {
  return (article || "").replace(/\s+/g, " ").trim();
}

/** Signature/ceremony lines are compared separately from the operative paper. */
export function stripSignatureMetadataForOperativeCompare(article: string): string {
  const withoutWitness = (article || "").replace(/\r\n/g, "\n").replace(/\bIN WITNESS WHEREOF[\s\S]*$/i, "");
  return normalizeArticleWhitespace(
    withoutWitness.replace(/^\s*(?:By|Name|Title|Date)\s*:\s*.*$/gim, ""),
  );
}

/**
 * UI chrome and the non-binding template banner are presentation, not operative wording.
 * Do not treat them as a passing integrity result unless this strip is applied.
 */
export function stripPresentationChromeForOperativeCompare(article: string): string {
  const withoutBanner = (article || "")
    .replace(/\r\n/g, "\n")
    .replace(/^\s*Document\s*$/gim, "")
    .replace(/Draft Agreement\s*\(non-binding template\)/gi, "");
  return stripSignatureMetadataForOperativeCompare(withoutBanner);
}

export function operativeArticleFingerprint(article: string): string {
  const body = stripPresentationChromeForOperativeCompare(article);
  let h = 2166136261;
  for (let i = 0; i < body.length; i += 1) {
    h ^= body.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `${body.length}:${(h >>> 0).toString(16).padStart(8, "0")}`;
}

export function describeOperativeArticleCompare(
  leftLabel: string,
  left: string,
  rightLabel: string,
  right: string,
): {
  sameOperative: boolean;
  presentationOnly: boolean;
  rawEqual: boolean;
  leftFingerprint: string;
  rightFingerprint: string;
  diff: string;
} {
  const leftOp = stripPresentationChromeForOperativeCompare(left);
  const rightOp = stripPresentationChromeForOperativeCompare(right);
  const leftFingerprint = operativeArticleFingerprint(left);
  const rightFingerprint = operativeArticleFingerprint(right);
  const sameOperative = leftFingerprint === rightFingerprint && leftOp.length > 4;
  const rawEqual = normalizeArticleWhitespace(left) === normalizeArticleWhitespace(right);
  const leftWords = leftOp.split(" ");
  const rightWords = rightOp.split(" ");
  const first = leftWords.findIndex((word, idx) => word !== rightWords[idx]);
  const snippet = (words: string[], at: number) =>
    words.slice(Math.max(0, at - 6), at + 10).join(" ");
  const diff = sameOperative
    ? rawEqual
      ? `${leftLabel} === ${rightLabel} (raw and operative)`
      : `${leftLabel} vs ${rightLabel}: presentation-only (${leftFingerprint}); chrome/signature metadata stripped`
    : [
        `${leftLabel} ${leftFingerprint}`,
        `${rightLabel} ${rightFingerprint}`,
        first >= 0
          ? `first operative mismatch near: «${snippet(leftWords, first)}» vs «${snippet(rightWords, first)}»`
          : `operative length ${leftOp.length} vs ${rightOp.length}`,
      ].join("\n");
  return {
    sameOperative,
    presentationOnly: !rawEqual && sameOperative,
    rawEqual,
    leftFingerprint,
    rightFingerprint,
    diff,
  };
}

function nameRoleBindingPresent(text: string, name: string, role: string): boolean {
  const n = escapeRe(name);
  const r = escapeRe(role);
  const paren = new RegExp(`${n}\\s*\\(\\s*["'“”]?${r}["'“”]?\\s*\\)`, "i");
  const labeled = new RegExp(`${r}\\s*:\\s*${n}`, "i");
  const prose = new RegExp(`${n}[\\s\\S]{0,48}${r}|${r}[\\s\\S]{0,48}${n}`, "i");
  return paren.test(text) || labeled.test(text) || prose.test(normalizeArticleWhitespace(text));
}

function nameBoundToRole(text: string, name: string, role: string): boolean {
  const n = escapeRe(name);
  const r = escapeRe(role);
  return new RegExp(`${n}\\s*\\(\\s*["'“”]?${r}["'“”]?\\s*\\)`, "i").test(text);
}

export function articlePresentationIssues(
  article: string,
  facts = CORE_PAID_JOURNEY_EXPECTED_FACTS,
): ArticlePresentationIssue[] {
  const issues: ArticlePresentationIssue[] = [];
  const raw = article || "";
  if (/October\s*1,?\s*\n+\s*2026/i.test(raw) && /October\s+1,?\s*2026/i.test(normalizeArticleWhitespace(raw))) {
    issues.push({
      code: "date_line_broken",
      detail: `${facts.startDate} is semantically present but split across lines`,
    });
  }
  return issues;
}

export const CORE_PAID_JOURNEY_LIVE_MODEL_PROPOSAL = {
  needed: true,
  reason:
    "Deterministic workflow proof can stub the model boundary. Live-model commercial quality is a separate evaluation.",
  inputSet: [
    CORE_PAID_JOURNEY_SCENARIO_ID,
    "one additional two-party SaaS subscription with named parties and a fee",
  ],
  maxPrimaryDraftCalls: 2,
  maxRepairCalls: 2,
  approvalRequired: true,
} as const;

export function countRepetitiveFiller(
  article: string,
  phrase = CORE_PAID_JOURNEY_REPETITIVE_FILLER_PHRASE,
): number {
  if (!article || !phrase) return 0;
  return (article.match(new RegExp(escapeRe(phrase), "gi")) || []).length;
}

export function articleContainsExpectedFacts(article: string, facts = CORE_PAID_JOURNEY_EXPECTED_FACTS): string[] {
  const missing: string[] = [];
  const text = article || "";
  const semantic = normalizeArticleWhitespace(text);
  if (!new RegExp(facts.titleCue, "i").test(semantic)) missing.push("title");
  for (const party of facts.parties) {
    if (!semantic.includes(party.name)) missing.push(`party:${party.name}`);
    const contradicted = ["Client", "Service Provider", "Consultant", "Customer", "Provider"].some(
      (role) => role.toLowerCase() !== party.role.toLowerCase() && nameBoundToRole(text, party.name, role),
    );
    if (contradicted || !nameRoleBindingPresent(text, party.name, party.role)) {
      missing.push(`party_role:${party.name}->${party.role}`);
    }
  }
  for (const signer of facts.signers) {
    if (!semantic.includes(signer.name)) missing.push(`signer:${signer.name}`);
    if (!nameRoleBindingPresent(text, signer.name, signer.party) && !semantic.includes(signer.party)) {
      missing.push(`signer_party:${signer.name}->${signer.party}`);
    }
  }
  if (!new RegExp(facts.scope, "i").test(semantic)) missing.push("scope");
  if (!semantic.includes(facts.economics)) missing.push("economics");
  if (!new RegExp(facts.duration, "i").test(semantic)) missing.push("duration");
  if (!/October\s+1,?\s*2026/i.test(semantic)) missing.push("startDate");
  if (!new RegExp(facts.governingLaw, "i").test(semantic)) missing.push("governingLaw");
  if (!new RegExp(facts.ipConsultant, "i").test(semantic)) missing.push("ipConsultant");
  if (!new RegExp(facts.ipClient, "i").test(semantic)) missing.push("ipClient");
  return missing;
}

export function articleQualityDefects(article: string, facts = CORE_PAID_JOURNEY_EXPECTED_FACTS): string[] {
  const defects: string[] = [];
  const text = article || "";
  const semantic = normalizeArticleWhitespace(text);
  if (!semantic) {
    defects.push("empty_article");
    return defects;
  }
  for (const re of facts.forbiddenPlaceholders) {
    if (re.test(text)) defects.push(`placeholder:${re.source}`);
  }
  for (const name of facts.forbiddenInventedParties) {
    if (text.includes(name)) defects.push(`invented:${name}`);
  }
  const fillerCount = countRepetitiveFiller(text);
  if (fillerCount >= 8) {
    defects.push(`repetitive_filler:${CORE_PAID_JOURNEY_REPETITIVE_FILLER_PHRASE.slice(0, 32)}×${fillerCount}`);
  }
  const otherRoles = ["Client", "Service Provider", "Consultant", "Customer", "Provider"];
  for (const party of facts.parties) {
    for (const role of otherRoles) {
      if (role.toLowerCase() === party.role.toLowerCase()) continue;
      if (nameBoundToRole(text, party.name, role)) {
        defects.push(`role_contradiction:${party.name}->${role}`);
      }
    }
  }
  const harbor = facts.parties[0]?.name ?? "";
  const ironvale = facts.parties[1]?.name ?? "";
  if (harbor && ironvale) {
    if (facts.signers[0] && nameRoleBindingPresent(text, facts.signers[0].name, ironvale) && !nameRoleBindingPresent(text, facts.signers[0].name, harbor)) {
      defects.push(`signer_party_mismatch:${facts.signers[0].name}->${ironvale}`);
    }
    if (facts.signers[1] && nameRoleBindingPresent(text, facts.signers[1].name, harbor) && !nameRoleBindingPresent(text, facts.signers[1].name, ironvale)) {
      defects.push(`signer_party_mismatch:${facts.signers[1].name}->${harbor}`);
    }
  }
  return defects;
}
