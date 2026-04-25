import type { WorkspaceIndexAgreement } from "../agreement/agreementWorkspaceApi";

export type OrganizeAiScope = "selected" | "folder" | "all";

export type ProofFolderLike = { folder_id: string; folder_name: string };

export type OrganizeSuggestionRow = {
  agreementId: string;
  title: string;
  suggestedFolderName: string;
  suggestedTags: string[];
  reason: string;
  hasDelta: boolean;
};

const STOP = new Set([
  "the",
  "and",
  "for",
  "with",
  "from",
  "this",
  "that",
  "your",
  "agreement",
  "contract",
  "between",
  "party",
  "parties",
]);

type Rule = {
  test: (title: string) => boolean;
  folder: string;
  tags: string[];
};

const RULES: Rule[] = [
  { test: (t) => /\bnda\b|non-?disclosure/i.test(t), folder: "NDAs", tags: ["NDA"] },
  { test: (t) => /consult/i.test(t), folder: "Consulting", tags: ["Consulting"] },
  { test: (t) => /\bmsa\b|master\s+service/i.test(t), folder: "Services", tags: ["MSA", "Services"] },
  { test: (t) => /employ/i.test(t), folder: "Employment", tags: ["Employment"] },
  { test: (t) => /lease|rental|tenant/i.test(t), folder: "Leases", tags: ["Lease"] },
  { test: (t) => /purchase|sale|acquisition/i.test(t), folder: "Commercial", tags: ["Purchase"] },
  { test: (t) => /vendor|supplier|procurement/i.test(t), folder: "Vendors", tags: ["Vendor"] },
  { test: (t) => /partner|partnership|joint/i.test(t), folder: "Partnerships", tags: ["Partnership"] },
];

function titleTokens(title: string): string[] {
  return title
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .filter((w) => w.length > 3 && !STOP.has(w));
}

function firstRule(title: string): Rule | null {
  for (const r of RULES) {
    if (r.test(title)) return r;
  }
  return null;
}

function normTags(tags: string[] | undefined): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of tags || []) {
    const s = String(t).trim();
    if (!s) continue;
    const k = s.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(s);
  }
  return out;
}

function hasTagDelta(current: string[], next: string[]): boolean {
  const c = new Set(current.map((t) => t.toLowerCase()));
  return next.some((t) => !c.has(t.toLowerCase()));
}

function hasFolderDelta(
  currentId: string | null | undefined,
  currentName: string | null | undefined,
  suggested: string,
  folders: ProofFolderLike[],
): boolean {
  const s = suggested.trim();
  if (!s) return false;
  if (currentName && currentName.trim().toLowerCase() === s.toLowerCase()) return false;
  const match = folders.find((f) => f.folder_name.trim().toLowerCase() === s.toLowerCase());
  if (match) {
    return (currentId || "").trim() !== match.folder_id;
  }
  return true;
}

/**
 * Deterministic, client-side organization hints from titles and existing metadata.
 * Safe workspace-only signals — no proof or draft body changes.
 */
export function buildOrganizeSuggestions(
  allRows: WorkspaceIndexAgreement[],
  scope: OrganizeAiScope,
  opts: { selectedId?: string | null; folderId?: string | null },
  existingFolders: ProofFolderLike[],
): { rows: OrganizeSuggestionRow[]; weak?: "add_more" | "no_strong" } {
  let scopeRows = allRows;
  if (scope === "selected") {
    const sid = (opts.selectedId || "").trim();
    scopeRows = sid ? allRows.filter((r) => r.id === sid) : [];
  } else if (scope === "folder") {
    const fid = (opts.folderId || "").trim();
    scopeRows = fid ? allRows.filter((r) => (r.workspace_folder_id || "").trim() === fid) : [];
  }

  if (scopeRows.length === 0) {
    return { rows: [], weak: "add_more" };
  }

  const byFolderKey = new Map<string, WorkspaceIndexAgreement[]>();
  for (const row of scopeRows) {
    const rule = firstRule(row.title || "");
    const key = rule?.folder || "";
    if (!byFolderKey.has(key)) byFolderKey.set(key, []);
    byFolderKey.get(key)!.push(row);
  }

  const out: OrganizeSuggestionRow[] = [];
  for (const row of scopeRows) {
    const rule = firstRule(row.title || "");
    let suggestedFolder = rule?.folder || "";
    let suggestedTags = normTags([...(row.workspace_tags || []), ...(rule?.tags || [])]);
    const tokens = titleTokens(row.title || "");
    if (tokens.length && !rule) {
      const t1 = tokens[0];
      const cap = t1.slice(0, 1).toUpperCase() + t1.slice(1);
      if (!suggestedTags.some((x) => x.toLowerCase() === t1)) suggestedTags.push(cap);
    }

    let reason = "Based on title and related records";
    if (rule) {
      const group = byFolderKey.get(rule.folder) || [];
      if (group.length >= 2) reason = "Based on similar titles";
      else reason = "Based on title and related records";
    } else if ((row.workspace_tags || []).length) {
      reason = "Based on existing tags";
    } else if (tokens.length) {
      reason = "Based on title wording";
    }

    const curTags = normTags(row.workspace_tags);
    const curFid = (row.workspace_folder_id || "").trim() || null;

    const deltaFolder = hasFolderDelta(curFid, row.workspace_folder_name, suggestedFolder, existingFolders);
    const deltaTags = hasTagDelta(curTags, suggestedTags);

    const hasDelta = deltaFolder || deltaTags;

    out.push({
      agreementId: row.id,
      title: (row.title || "").trim() || "Untitled",
      suggestedFolderName: suggestedFolder,
      suggestedTags,
      reason,
      hasDelta,
    });
  }

  if (!out.some((r) => r.hasDelta)) {
    return { rows: [], weak: "no_strong" };
  }

  return { rows: out.filter((r) => r.hasDelta) };
}
