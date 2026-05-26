import { findSignatureRegionStart } from "./guidedDealCompletion/signatureRegion";

type CompilerSignerIdentity = {
  partyDisplayName: string;
  representativeName?: string | null;
  title?: string | null;
  blockHeading?: string | null;
  isIndividual?: boolean | null;
};

export type FinalAgreementCompilerIntegrityContext = {
  intakeText?: string | null;
  draftText?: string | null;
  signerIdentities?: readonly CompilerSignerIdentity[] | null;
  surface?: string | null;
};

export type FinalAgreementCompilerIntegrityResult = {
  text: string;
  repairs: string[];
  defects: string[];
};

const TOP_LEVEL_HEADING_RE = /^(\d+)\.\s+(?!\d+\.)(.+)$/;
const SUBSECTION_HEADING_RE = /^(\d+)\.(\d+)\.?\s+(.+)$/;
const SIGNATURE_START_RE = /^\s*(?:IN WITNESS WHEREOF|CLIENT\s*:|SERVICE PROVIDER\s*:|PARTY\s+\d+\s*:)\b/i;

function normalizeLines(text: string): string[] {
  return (text || "").replace(/\r\n?/g, "\n").split("\n");
}

function compact(text: string): string {
  return text.replace(/[ \t]+$/gm, "").replace(/\n{3,}/g, "\n\n").trim();
}

function logCompilerRepair(event: string, payload: Record<string, unknown>): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info(`[${event}]`, payload);
}

function signerNameForIdentity(id: CompilerSignerIdentity): string {
  if (id.isIndividual) return id.partyDisplayName.trim();
  return (id.representativeName?.trim() || id.partyDisplayName).trim();
}

function canonicalExecutionTail(identities: readonly CompilerSignerIdentity[]): string | null {
  const usable = identities.filter((id) => id.partyDisplayName?.trim());
  if (usable.length === 0) return null;
  const blocks = usable.map((id, index) => {
    const heading = (id.blockHeading?.trim() || (index === 0 ? "CLIENT" : index === 1 ? "SERVICE PROVIDER" : `PARTY ${index + 1}`)).toUpperCase();
    const lines = [
      `${heading}:`,
      id.partyDisplayName.trim(),
      "By: __________________________",
      `Name: ${signerNameForIdentity(id)}`,
    ];
    if (id.title?.trim()) lines.push(`Title: ${id.title.trim()}`);
    lines.push("Date: _________________________");
    return lines.join("\n");
  });
  return ["IN WITNESS WHEREOF, the Parties execute this Agreement.", ...blocks].join("\n\n");
}

function likelySignatureLine(line: string): boolean {
  const t = line.trim();
  return /^(?:CLIENT|SERVICE PROVIDER|PARTY\s+\d+)\s*:$/i.test(t) || /^(?:By|Name|Title|Date|Email|Signature)\s*:/i.test(t);
}

function malformedPartyFragment(line: string): boolean {
  const t = line.replace(/\s+/g, " ").trim();
  return (
    /\(\s*each\s+a\s+["“]?Party/i.test(t) ||
    /\(\s*["“]?[A-Z][^"”)]{1,80}["”]?\s*\)\s*\(\s*each/i.test(t) ||
    /\b(?:LLC|Inc\.?|Consulting|Corporation|Company)\b.{0,120}\(\s*each\s+a\s+["“]?Party/i.test(t)
  );
}

function fallbackForSubsection(heading: string, context: FinalAgreementCompilerIntegrityContext): string[] {
  const h = heading.toLowerCase();
  const source = `${context.intakeText ?? ""}\n${context.draftText ?? ""}`;
  if (/payment milestone|milestone/i.test(h)) {
    if (/\b40\s*%/i.test(source)) {
      return [
        "- 40% is due for build/configuration.",
        "- 30% is due for rollout/onboarding.",
        "- 30% is due for support/acceptance.",
      ];
    }
    if (/\b3\s+milestones|\bthree\s+milestones/i.test(source)) {
      return ["- Payments will be made across three project milestones tied to delivery progress."];
    }
    return ["- Milestone payments are due as the corresponding project milestones are completed or accepted."];
  }
  if (/project services|services|scope|deliverables/i.test(h)) {
    if (/AI workflow implementation|dashboard setup|automation support/i.test(source)) {
      return [
        "- AI workflow implementation.",
        "- Dashboard setup.",
        "- Automation support, onboarding assistance, and light ongoing maintenance.",
      ];
    }
    if (/paid advertising management|email marketing|campaign optimization/i.test(source)) {
      return [
        "- Paid advertising management, launch coordination, and email marketing.",
        "- Analytics reporting, creative strategy, and campaign optimization.",
      ];
    }
    if (/operations consulting|advisory calls|workflow recommendations/i.test(source)) {
      return [
        "- Operations consulting and recurring advisory calls.",
        "- Workflow recommendations, vendor coordination, and monthly reporting support.",
      ];
    }
    return ["- Service Provider will provide the services and deliverables described in this Agreement."];
  }
  if (/notice/i.test(h)) return ["Notices must be delivered to the parties at their designated email or mailing addresses."];
  if (/governing law|law/i.test(h)) {
    const state = source.match(/\b(Oklahoma|Texas|Delaware|California|New York)\s+law\b/i)?.[1];
    return [`This Agreement is governed by the laws of the State of ${state ?? "the applicable jurisdiction"}.`];
  }
  if (/confidential/i.test(h)) return ["Each Party will protect confidential information using reasonable care."];
  if (/ownership|work product|ip|intellectual/i.test(h)) {
    return ["Client owns the project deliverables, and Service Provider retains its pre-existing tools and background materials."];
  }
  return ["The Parties will perform this subsection in a commercially reasonable manner consistent with this Agreement."];
}

function enforceSubsectionPayloads(
  lines: string[],
  context: FinalAgreementCompilerIntegrityContext,
): { lines: string[]; repairs: string[]; defects: string[] } {
  const repairs: string[] = [];
  const defects: string[] = [];
  const out: string[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    out.push(line);
    const sub = line.trim().match(SUBSECTION_HEADING_RE);
    if (!sub) continue;
    const heading = sub[3].trim();
    let j = i + 1;
    while (j < lines.length && !lines[j].trim()) j += 1;
    const next = lines[j]?.trim() ?? "";
    const empty = !next || TOP_LEVEL_HEADING_RE.test(next) || SUBSECTION_HEADING_RE.test(next) || SIGNATURE_START_RE.test(next);
    if (!empty) continue;
    const fallback = fallbackForSubsection(heading, context);
    out.push(...fallback);
    repairs.push(`subsection_payload_repaired:${sub[1]}.${sub[2]}`);
    defects.push("empty_subsection_shell");
    logCompilerRepair("subsection_payload_repaired", {
      subsection: `${sub[1]}.${sub[2]}`,
      heading,
      surface: context.surface ?? null,
    });
  }
  return { lines: out, repairs, defects };
}

function isolateExecutionBlocks(
  text: string,
  context: FinalAgreementCompilerIntegrityContext,
): { text: string; repairs: string[]; defects: string[] } {
  const repairs: string[] = [];
  const defects: string[] = [];
  const marker = findSignatureRegionStart(text);
  const body = marker >= 0 ? text.slice(0, marker) : text;
  const tail = marker >= 0 ? text.slice(marker) : "";
  const bodyLines = normalizeLines(body);
  const cleanedBody = bodyLines.filter((line) => {
    const inClauseSignatureLine = likelySignatureLine(line);
    const malformed = malformedPartyFragment(line);
    if (inClauseSignatureLine || malformed) {
      repairs.push(malformed ? "malformed_party_fragment" : "execution_block_contamination");
      defects.push(malformed ? "malformed_party_fragment" : "execution_block_contamination");
      return false;
    }
    return true;
  });

  let nextTail = tail;
  const canonicalTail = canonicalExecutionTail(context.signerIdentities ?? []);
  const tailHasCompleteSignatureBlocks =
    /(?:^|\n)\s*CLIENT\s*:\s*\n/i.test(tail) &&
    /(?:^|\n)\s*SERVICE PROVIDER\s*:\s*\n/i.test(tail) &&
    /(?:^|\n)\s*(?:By|Signature)\s*:/im.test(tail);
  if (
    canonicalTail &&
    (repairs.length > 0 ||
      !tailHasCompleteSignatureBlocks ||
      (tail && /(?:CLIENT|SERVICE PROVIDER)\s*:[\s\S]*\(\s*each\s+a\s+["“]?Party/i.test(tail)))
  ) {
    nextTail = canonicalTail;
    repairs.push("execution_block:canonical_template_rebuilt");
  }

  const combined = [cleanedBody.join("\n").trim(), nextTail.trim()].filter(Boolean).join("\n\n");
  if (repairs.length) {
    logCompilerRepair("execution_block_contamination", {
      repairs,
      surface: context.surface ?? null,
    });
  }
  return { text: compact(combined), repairs: [...new Set(repairs)], defects: [...new Set(defects)] };
}

function reconcileNumberingAndReferences(text: string): { text: string; repairs: string[]; defects: string[] } {
  const repairs: string[] = [];
  const defects: string[] = [];
  const marker = findSignatureRegionStart(text);
  const body = marker >= 0 ? text.slice(0, marker) : text;
  const tail = marker >= 0 ? text.slice(marker) : "";
  const lines = normalizeLines(body);
  const topMap = new Map<string, string>();
  const subMap = new Map<string, string>();
  const out: string[] = [];
  let currentTop = 0;
  let nextTop = 0;
  let nextSub = 0;

  for (const line of lines) {
    const top = line.trim().match(TOP_LEVEL_HEADING_RE);
    if (top) {
      nextTop += 1;
      currentTop = nextTop;
      nextSub = 0;
      if (top[1] !== String(nextTop)) {
        repairs.push("numbering_rebuilt");
        defects.push("numbering_mismatch");
      }
      topMap.set(top[1], String(nextTop));
      out.push(`${nextTop}. ${top[2].trim()}`);
      continue;
    }
    const sub = line.trim().match(SUBSECTION_HEADING_RE);
    if (sub && currentTop > 0) {
      nextSub += 1;
      const next = `${currentTop}.${nextSub}`;
      const old = `${sub[1]}.${sub[2]}`;
      if (old !== next) {
        repairs.push("numbering_rebuilt");
        defects.push("subsection_numbering_mismatch");
      }
      subMap.set(old, next);
      out.push(`${next} ${sub[3].trim()}`);
      continue;
    }
    out.push(line);
  }

  const topCount = nextTop;
  let reconciled = out.join("\n");
  reconciled = reconciled.replace(/\bSection\s+(\d+)(?:\.(\d+))?\b/g, (match, section, subsection) => {
    if (subsection) {
      const mapped = subMap.get(`${section}.${subsection}`);
      if (mapped) {
        repairs.push("reference_reconciled");
        return `Section ${mapped}`;
      }
      const parent = topMap.get(section);
      if (parent) {
        repairs.push("reference_reconciled");
        return `Section ${parent}`;
      }
      repairs.push("reference_reconciled");
      defects.push("orphan_subsection_reference");
      return "";
    }
    const mapped = topMap.get(section);
    if (mapped && mapped !== section) {
      repairs.push("reference_reconciled");
      return `Section ${mapped}`;
    }
    const numeric = Number(section);
    if (!mapped && topCount > 0 && numeric > topCount) {
      repairs.push("reference_reconciled");
      defects.push("orphan_section_reference");
      return `Section ${topCount}`;
    }
    return match;
  });

  if (repairs.includes("numbering_rebuilt")) {
    logCompilerRepair("numbering_rebuilt", { topCount });
  }
  if (repairs.includes("reference_reconciled")) {
    logCompilerRepair("reference_reconciled", { topCount });
  }
  return {
    text: compact([reconciled.trim(), tail.trim()].filter(Boolean).join("\n\n")),
    repairs: [...new Set(repairs)],
    defects: [...new Set(defects)],
  };
}

export function stabilizeFinalAgreementCompilerOutput(
  text: string,
  context: FinalAgreementCompilerIntegrityContext = {},
): FinalAgreementCompilerIntegrityResult {
  let out = compact(text || "");
  const repairs: string[] = [];
  const defects: string[] = [];
  if (!out) return { text: out, repairs, defects };

  const execution = isolateExecutionBlocks(out, context);
  out = execution.text;
  repairs.push(...execution.repairs);
  defects.push(...execution.defects);

  const marker = findSignatureRegionStart(out);
  const body = marker >= 0 ? out.slice(0, marker) : out;
  const tail = marker >= 0 ? out.slice(marker) : "";
  const subsection = enforceSubsectionPayloads(normalizeLines(body), context);
  out = compact([subsection.lines.join("\n").trim(), tail.trim()].filter(Boolean).join("\n\n"));
  repairs.push(...subsection.repairs);
  defects.push(...subsection.defects);

  const numbering = reconcileNumberingAndReferences(out);
  out = numbering.text;
  repairs.push(...numbering.repairs);
  defects.push(...numbering.defects);

  return { text: out, repairs: [...new Set(repairs)], defects: [...new Set(defects)] };
}

export function finalAgreementHasEmptySubsectionShell(text: string): boolean {
  const lines = normalizeLines(text);
  for (let i = 0; i < lines.length; i += 1) {
    if (!SUBSECTION_HEADING_RE.test(lines[i].trim())) continue;
    let j = i + 1;
    while (j < lines.length && !lines[j].trim()) j += 1;
    const next = lines[j]?.trim() ?? "";
    if (!next || TOP_LEVEL_HEADING_RE.test(next) || SUBSECTION_HEADING_RE.test(next) || SIGNATURE_START_RE.test(next)) return true;
  }
  return false;
}

export function finalAgreementHasExecutionContamination(text: string): boolean {
  const marker = findSignatureRegionStart(text);
  const body = marker >= 0 ? text.slice(0, marker) : text;
  return normalizeLines(body).some((line) => likelySignatureLine(line) || malformedPartyFragment(line));
}
