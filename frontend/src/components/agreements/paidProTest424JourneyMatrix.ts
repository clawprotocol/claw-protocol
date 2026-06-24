/**
 * TEST424 — journey QA matrix collector (production workflow failures first).
 */

export type Test424JourneyId = "A" | "B" | "C" | "D" | "E";

export type Test424JourneyCellResult = {
  journey: Test424JourneyId;
  partyCount: number;
  fixture: string;
  pass: boolean;
  failureLocation: string | null;
  rootCause: string | null;
};

export const TEST424_JOURNEY_RESULTS: Test424JourneyCellResult[] = [];

export class JourneyStageError extends Error {
  readonly stage: string;

  constructor(stage: string, message: string) {
    super(message);
    this.name = "JourneyStageError";
    this.stage = stage;
  }
}

export function journeyFail(stage: string, message: string): void {
  throw new JourneyStageError(stage, message);
}

export function recordTest424JourneyResult(result: Test424JourneyCellResult): void {
  TEST424_JOURNEY_RESULTS.push(result);
}

export function runTest424JourneyCell(
  journey: Test424JourneyId,
  partyCount: number,
  fixture: string,
  fn: () => void,
): Test424JourneyCellResult {
  try {
    fn();
    const result: Test424JourneyCellResult = {
      journey,
      partyCount,
      fixture,
      pass: true,
      failureLocation: null,
      rootCause: null,
    };
    recordTest424JourneyResult(result);
    return result;
  } catch (e) {
    const err = e as JourneyStageError & Error;
    const result: Test424JourneyCellResult = {
      journey,
      partyCount,
      fixture,
      pass: false,
      failureLocation: err.stage ?? err.name ?? "unknown",
      rootCause: err.message ?? String(e),
    };
    recordTest424JourneyResult(result);
    return result;
  }
}

export function formatTest424JourneyMatrix(results: readonly Test424JourneyCellResult[]): string {
  const header = ["Journey", "Party count", "Fixture", "Pass/fail", "Failure location", "Root cause"];
  const rows = results.map((r) => [
    r.journey,
    String(r.partyCount),
    r.fixture,
    r.pass ? "PASS" : "FAIL",
    r.failureLocation ?? "",
    (r.rootCause ?? "").replace(/\s+/g, " ").slice(0, 120),
  ]);
  const widths = header.map((h, i) =>
    Math.max(h.length, ...rows.map((row) => row[i]!.length)),
  );
  const pad = (s: string, w: number) => s.padEnd(w);
  const line = (cols: string[]) => cols.map((c, i) => pad(c, widths[i]!)).join(" | ");
  return [line(header), line(widths.map((w) => "-".repeat(w))), ...rows.map((r) => line(r))].join("\n");
}
