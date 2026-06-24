/**
 * TEST428 — compact UX regression matrix.
 */

export type Test428UxSurface =
  | "review_surface"
  | "section_formatting"
  | "signer_hydration"
  | "sticky_cta"
  | "lifecycle_copy"
  | "authority_signals";

export type Test428MatrixRow = {
  scenarioId: string;
  label: string;
  parties: number;
  surface: Test428UxSurface;
  pass: boolean;
  reason: string | null;
};

export const TEST428_MATRIX_RESULTS: Test428MatrixRow[] = [];

export class Test428UxError extends Error {
  readonly surface: Test428UxSurface;

  constructor(surface: Test428UxSurface, message: string) {
    super(message);
    this.name = "Test428UxError";
    this.surface = surface;
  }
}

export function test428Fail(surface: Test428UxSurface, message: string): void {
  throw new Test428UxError(surface, message);
}

export function recordTest428Result(row: Test428MatrixRow): void {
  TEST428_MATRIX_RESULTS.push(row);
}

export function runTest428UxCell(
  scenarioId: string,
  label: string,
  parties: number,
  surface: Test428UxSurface,
  fn: () => void,
): Test428MatrixRow {
  try {
    fn();
    const row: Test428MatrixRow = {
      scenarioId,
      label,
      parties,
      surface,
      pass: true,
      reason: null,
    };
    recordTest428Result(row);
    return row;
  } catch (e) {
    const err = e as Test428UxError & Error;
    const row: Test428MatrixRow = {
      scenarioId,
      label,
      parties,
      surface: err.surface ?? surface,
      pass: false,
      reason: err.message ?? String(e),
    };
    recordTest428Result(row);
    return row;
  }
}

export function formatTest428Matrix(results: readonly Test428MatrixRow[]): string {
  const header = ["Scenario", "Parties", "UX surface", "Result"];
  const rows = results.map((r) => [
    r.label.slice(0, 32),
    String(r.parties),
    r.surface,
    r.pass ? "PASS" : `FAIL: ${(r.reason ?? "").slice(0, 48)}`,
  ]);
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((row) => row[i]!.length)));
  const pad = (s: string, w: number) => s.padEnd(w);
  const line = (cols: string[]) => cols.map((c, i) => pad(c, widths[i]!)).join(" | ");
  return [line(header), line(widths.map((w) => "-".repeat(w))), ...rows.map((r) => line(r))].join("\n");
}

export const TEST428_UX_SURFACES: Test428UxSurface[] = [
  "review_surface",
  "section_formatting",
  "signer_hydration",
  "sticky_cta",
  "lifecycle_copy",
  "authority_signals",
];
