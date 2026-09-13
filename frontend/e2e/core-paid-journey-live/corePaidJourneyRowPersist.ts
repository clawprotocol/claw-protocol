import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { CORE_PAID_JOURNEY_MATRIX, type CorePaidJourneyRowId } from "../../src/launch/corePaidJourneyAcceptanceMatrix";

export const CORE_PAID_JOURNEY_REQUIRED_PROJECTS = ["desktop", "mobile"] as const;

export type CorePaidJourneyRowStatus = "pass" | "fail" | "blocked" | "missing";

export type CorePaidJourneyPersistedRow = {
  id: CorePaidJourneyRowId;
  status: CorePaidJourneyRowStatus;
  pass: boolean;
  detail: string;
  project: string;
  test: string;
  recordedAt: string;
  coverageOnly?: boolean;
};

function resultRoot(): string {
  const dest = process.env.CORE_PAID_JOURNEY_RESULT_DIR || "";
  if (dest) return dest;
  const legacy = process.env.CORE_PAID_JOURNEY_ROW_RESULTS || "";
  return legacy ? dirname(legacy) : "";
}

function slug(value: string): string {
  return (value || "unknown").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-").slice(0, 80);
}

export function persistCorePaidJourneyRow(row: Omit<CorePaidJourneyPersistedRow, "recordedAt" | "pass">): void {
  const root = resultRoot();
  if (!root) return;
  const file = join(root, "rows", slug(row.project), slug(row.test), `${row.id}.json`);
  mkdirSync(dirname(file), { recursive: true });
  const payload: CorePaidJourneyPersistedRow = {
    ...row,
    pass: row.status === "pass",
    recordedAt: new Date().toISOString(),
  };
  writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`);
  writeAggregatedMatrix(root);
}

export function persistCorePaidJourneyArticle(args: {
  project: string;
  test: string;
  agreementId: string;
  article: string;
}): void {
  const root = resultRoot();
  if (!root) return;
  const file = join(root, "articles", slug(args.project), slug(args.test), `${args.agreementId || "unknown"}.txt`);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${args.article}\n`);
}

export function persistCorePaidJourneyArticleCompare(args: {
  project: string;
  test: string;
  agreementId: string;
  label: string;
  diff: string;
}): void {
  const root = resultRoot();
  if (!root) return;
  const file = join(
    root,
    "articles",
    slug(args.project),
    slug(args.test),
    `${args.agreementId || "unknown"}-${slug(args.label)}.diff.txt`,
  );
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${args.diff}\n`);
}

export function persistCorePaidJourneyNetwork(args: {
  project: string;
  test: string;
  events: unknown;
}): void {
  const root = resultRoot();
  if (!root) return;
  const file = join(root, "network", slug(args.project), `${slug(args.test)}.json`);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(args.events, null, 2)}\n`);
}

export function writeAggregatedMatrix(root = resultRoot()): void {
  if (!root) return;
  const rowsDir = join(root, "rows");
  const collected: CorePaidJourneyPersistedRow[] = [];
  const walk = (dir: string) => {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const next = join(dir, entry.name);
      if (entry.isDirectory()) walk(next);
      else if (entry.name.endsWith(".json")) {
        collected.push(JSON.parse(readFileSync(next, "utf8")) as CorePaidJourneyPersistedRow);
      }
    }
  };
  walk(rowsDir);
  const journeyRows = collected.filter((row) => !row.coverageOnly);
  const byId = new Map<string, CorePaidJourneyPersistedRow[]>();
  for (const row of journeyRows) {
    const list = byId.get(row.id) || [];
    list.push(row);
    byId.set(row.id, list);
  }
  const required = CORE_PAID_JOURNEY_MATRIX.map((row) => row.id);
  const requiredPairs = required.flatMap((id) =>
    CORE_PAID_JOURNEY_REQUIRED_PROJECTS.map((project) => ({ id, project })),
  );
  const missing = requiredPairs
    .filter(({ id, project }) => !(byId.get(id) || []).some((row) => row.project === project))
    .map(({ id, project }) => `${project}/${id}`);
  const failed = journeyRows.filter((row) => row.status === "fail").map((row) => `${row.project}/${row.test}/${row.id}`);
  const blocked = journeyRows.filter((row) => row.status === "blocked").map((row) => `${row.project}/${row.test}/${row.id}`);
  const unknown = journeyRows
    .filter((row) => row.status !== "pass" && row.status !== "fail" && row.status !== "blocked")
    .map((row) => `${row.project}/${row.test}/${row.id}:${row.status}`);
  const viewportIncomplete = requiredPairs
    .filter(({ id, project }) => !(byId.get(id) || []).some((row) => row.project === project && row.status === "pass"))
    .map(({ id, project }) => `${project}/${id}`);
  writeFileSync(
    join(root, "matrix-rows.json"),
    `${JSON.stringify(
      {
        matrix: CORE_PAID_JOURNEY_MATRIX,
        rows: collected,
        required,
        required_projects: CORE_PAID_JOURNEY_REQUIRED_PROJECTS,
        missing,
        failed,
        blocked,
        unknown,
        viewport_incomplete: viewportIncomplete,
        gate_green:
          missing.length === 0 &&
          failed.length === 0 &&
          blocked.length === 0 &&
          unknown.length === 0 &&
          viewportIncomplete.length === 0,
      },
      null,
      2,
    )}\n`,
  );
}
