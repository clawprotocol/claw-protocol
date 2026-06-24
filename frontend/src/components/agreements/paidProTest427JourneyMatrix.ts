/**
 * TEST427 — Genesis Dog production simulation matrix.
 */

export type Test427FailureStage =
  | "draft_generation"
  | "freeze_establish"
  | "review_render"
  | "revision_flow"
  | "signer_setup"
  | "recipient_handoff"
  | "vs01_bridge"
  | "signature_completion"
  | "completed_corpus"
  | "dashboard_state"
  | "recovery_workflow"
  | "coordinator_exclusion"
  | "metadata_completion"
  | "unknown";

export type Test427FixPriority = "P0" | "P1" | "P2" | "P3";

export type Test427UserImpact =
  | "blocks_customer_workflow"
  | "visible_agreement_defect"
  | "signing_defect"
  | "dashboard_status_wrong"
  | "internal_only";

export type Test427MatrixRow = {
  scenarioId: string;
  label: string;
  category: string;
  parties: number;
  pass: boolean;
  failureStage: Test427FailureStage | null;
  rootCause: string | null;
  userImpact: Test427UserImpact | null;
  fixPriority: Test427FixPriority | null;
};

export const TEST427_MATRIX_RESULTS: Test427MatrixRow[] = [];

export class Test427StageError extends Error {
  readonly stage: Test427FailureStage;

  constructor(stage: Test427FailureStage, message: string) {
    super(message);
    this.name = "Test427StageError";
    this.stage = stage;
  }
}

export function test427Fail(stage: Test427FailureStage, message: string): void {
  throw new Test427StageError(stage, message);
}

function classifyFailure(stage: Test427FailureStage): {
  userImpact: Test427UserImpact;
  fixPriority: Test427FixPriority;
} {
  switch (stage) {
    case "draft_generation":
    case "freeze_establish":
    case "recovery_workflow":
      return { userImpact: "blocks_customer_workflow", fixPriority: "P0" };
    case "review_render":
    case "revision_flow":
      return { userImpact: "visible_agreement_defect", fixPriority: "P1" };
    case "signer_setup":
    case "recipient_handoff":
    case "vs01_bridge":
    case "signature_completion":
    case "completed_corpus":
      return { userImpact: "signing_defect", fixPriority: "P1" };
    case "dashboard_state":
      return { userImpact: "dashboard_status_wrong", fixPriority: "P1" };
    case "coordinator_exclusion":
    case "metadata_completion":
      return { userImpact: "visible_agreement_defect", fixPriority: "P2" };
    default:
      return { userImpact: "internal_only", fixPriority: "P3" };
  }
}

export function recordTest427Result(row: Test427MatrixRow): void {
  TEST427_MATRIX_RESULTS.push(row);
}

export function runTest427Scenario(
  scenarioId: string,
  label: string,
  category: string,
  parties: number,
  fn: () => void,
): Test427MatrixRow {
  try {
    fn();
    const row: Test427MatrixRow = {
      scenarioId,
      label,
      category,
      parties,
      pass: true,
      failureStage: null,
      rootCause: null,
      userImpact: null,
      fixPriority: null,
    };
    recordTest427Result(row);
    return row;
  } catch (e) {
    const err = e as Test427StageError & Error;
    const stage: Test427FailureStage =
      err.stage ?? (err.name === "Test427StageError" ? "unknown" : "unknown");
    const classified = classifyFailure(stage);
    const row: Test427MatrixRow = {
      scenarioId,
      label,
      category,
      parties,
      pass: false,
      failureStage: stage,
      rootCause: err.message ?? String(e),
      userImpact: classified.userImpact,
      fixPriority: classified.fixPriority,
    };
    recordTest427Result(row);
    return row;
  }
}

export function formatTest427Matrix(results: readonly Test427MatrixRow[]): string {
  const header = ["Scenario", "Parties", "Type", "Result"];
  const rows = results.map((r) => [
    r.label.slice(0, 36),
    String(r.parties),
    r.category,
    r.pass ? "PASS" : `FAIL (${r.failureStage})`,
  ]);
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((row) => row[i]!.length)));
  const pad = (s: string, w: number) => s.padEnd(w);
  const line = (cols: string[]) => cols.map((c, i) => pad(c, widths[i]!)).join(" | ");
  return [line(header), line(widths.map((w) => "-".repeat(w))), ...rows.map((r) => line(r))].join("\n");
}

export function formatTest427SuiteSummary(scenarioCount = 21): string {
  return `TEST427: ${scenarioCount} production scenarios; ${scenarioCount + 1} tests in paidProTest427GenesisDogSimulation.test.ts`;
}

export function formatTest427FailureReport(results: readonly Test427MatrixRow[]): string {
  const failures = results.filter((r) => !r.pass);
  if (!failures.length) return "No failures.";
  const lines = ["Failures Found", ""];
  for (const f of failures) {
    lines.push(
      `- ${f.label} (${f.parties}p ${f.category})`,
      `  Stage: ${f.failureStage}`,
      `  Root cause: ${(f.rootCause ?? "").slice(0, 200)}`,
      `  User impact: ${f.userImpact}`,
      `  Priority: ${f.fixPriority}`,
      "",
    );
  }
  const p0 = failures.filter((f) => f.fixPriority === "P0").length;
  const p1 = failures.filter((f) => f.fixPriority === "P1").length;
  const p2 = failures.filter((f) => f.fixPriority === "P2").length;
  const p3 = failures.filter((f) => f.fixPriority === "P3").length;
  lines.push(
    "Recommended Fix Priority",
    `P0 (blocks workflow): ${p0}`,
    `P1 (visible/signing): ${p1}`,
    `P2 (quality): ${p2}`,
    `P3 (cleanup): ${p3}`,
  );
  return lines.join("\n");
}
