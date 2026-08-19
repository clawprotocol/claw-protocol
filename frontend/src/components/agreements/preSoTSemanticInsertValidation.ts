/**
 * Pre–Paid Pro SoT freeze validation: detect client-inserted substantive floors
 * that were not present on the server wire corpus and are not justified by intake.
 *
 * Production / test: fail-closed enforce (cannot be disabled via VITE_PRE_SOT_*).
 * Dev: enforce unless VITE_ALLOW_UNAUTHORIZED_SEMANTIC_INSERTS=1.
 *
 * Backend persistence remains the authoritative control.
 * Detector coverage is fingerprint-based (not full semantic equivalence) — see
 * evals/draft-quality/P0_PRE_SOT_VALIDATION_GAP.md.
 */

import {
  preSoTSemanticInsertGateMustEnforce,
  unauthorizedSemanticInsertsAllowed,
} from "./unauthorizedSemanticInsertPolicy";

export type SemanticInsertFinding = {
  id: string;
  severity: "blocker" | "warning";
  fingerprint: string;
  presentInFinal: boolean;
  presentInServerWire: boolean;
  presentInIntake: boolean;
  message: string;
};

export type PreSoTSemanticInsertResult = {
  ok: boolean;
  findings: SemanticInsertFinding[];
  gateMode: "observe" | "enforce";
  blocked: boolean;
};

const FLOOR_FINGERPRINTS: Array<{
  id: string;
  severity: "blocker" | "warning";
  re: RegExp;
  intakeOk?: RegExp;
  message: string;
}> = [
  {
    id: "uptime_99_5",
    severity: "blocker",
    re: /target\s+monthly\s+uptime\s+availability\s+of\s+99\.5%/i,
    intakeOk: /99\.5\s*%|uptime\s+sla|sla\s*[:\s].*99/i,
    message: "Unauthorized 99.5% uptime commitment without intake authority",
  },
  {
    id: "negotiation_15_business_days",
    severity: "blocker",
    re: /good\s+faith\s+negotiations\s+for\s+at\s+least\s+fifteen\s*\(\s*15\s*\)\s+business\s+days/i,
    intakeOk: /fifteen\s*\(?\s*15\s*\)?\s+business\s+days|15\s+business\s+days.*negotiat/i,
    message: "Unauthorized 15-day negotiation window without intake authority",
  },
  {
    id: "attorneys_fees_prevailing",
    severity: "blocker",
    re: /prevailing\s+Party\s+in\s+any\s+action\s+or\s+proceeding[\s\S]{0,200}attorneys['’]?\s+fees/i,
    intakeOk: /attorneys?\s*['’]?\s*fees|prevailing\s+party/i,
    message: "Unauthorized prevailing-party attorneys’ fees without intake authority",
  },
  {
    id: "mutual_consulting_lol_cap_12mo",
    severity: "blocker",
    re: /fees\s+paid\s+in\s+(?:the\s+)?(?:(?:prior|previous)\s+)?(?:twelve\s*\(\s*12\s*\)|12)\s+months/i,
    intakeOk: /12\s+months|liability\s+cap|limitation\s+of\s+liability/i,
    message: "Unauthorized liability-cap language without intake authority",
  },
  {
    id: "delaware_default_from_floor",
    severity: "blocker",
    re: /Governed\s+by\s+the\s+laws\s+of\s+the\s+State\s+of\s+Delaware/i,
    intakeOk: /Delaware|governing\s+law/i,
    message: "Unauthorized Delaware governing-law default without intake authority",
  },
  {
    id: "milestone_acceptance_invented",
    severity: "blocker",
    re: /Acceptance:\s*Each\s+milestone\s+is\s+deemed\s+accepted/i,
    intakeOk: /milestone|acceptance\s+criteria|deemed\s+accepted/i,
    message: "Unauthorized invented milestone acceptance language",
  },
  {
    id: "ai_workflow_acceptance_floor",
    severity: "blocker",
    re: /ACCEPTANCE\s+AND\s+DEMONSTRATION\s+REVIEW/i,
    intakeOk: /acceptance|demonstration\s+review|AI\s+workflow/i,
    message: "Unauthorized AI-workflow acceptance section without intake authority",
  },
];

/**
 * Compare server wire corpus vs final freeze candidate for known silent floor inserts.
 */
export function evaluatePreSoTSemanticInsertGate(args: {
  serverWireText: string;
  finalFreezeCandidateText: string;
  intakeText: string;
}): PreSoTSemanticInsertResult {
  const server = args.serverWireText || "";
  const final = args.finalFreezeCandidateText || "";
  const intake = args.intakeText || "";
  const findings: SemanticInsertFinding[] = [];

  for (const fp of FLOOR_FINGERPRINTS) {
    const inFinal = fp.re.test(final);
    if (!inFinal) continue;
    const inServer = fp.re.test(server);
    const inIntake = fp.intakeOk ? fp.intakeOk.test(intake) : false;
    if (inServer || inIntake) continue;
    findings.push({
      id: fp.id,
      severity: fp.severity,
      fingerprint: fp.id,
      presentInFinal: true,
      presentInServerWire: false,
      presentInIntake: false,
      message: fp.message,
    });
  }

  const blockers = findings.filter((f) => f.severity === "blocker");
  // Production cannot opt out via VITE_PRE_SOT_*; enforce when policy requires.
  const enforce = preSoTSemanticInsertGateMustEnforce() && !unauthorizedSemanticInsertsAllowed();
  const blocked = enforce && blockers.length > 0;
  return {
    ok: blockers.length === 0,
    findings,
    gateMode: enforce ? "enforce" : "observe",
    blocked,
  };
}

export function logPreSoTSemanticInsertResult(result: PreSoTSemanticInsertResult): void {
  if (!result.findings.length) return;
  try {
    // eslint-disable-next-line no-console
    console.warn("[pre-sot-semantic-insert]", {
      ok: result.ok,
      gateMode: result.gateMode,
      blocked: result.blocked,
      findings: result.findings.map((f) => ({ id: f.id, severity: f.severity, message: f.message })),
    });
  } catch {
    /* ignore */
  }
}
