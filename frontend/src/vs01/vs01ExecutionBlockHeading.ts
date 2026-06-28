/**
 * Witness / execution-block heading detection for VS01 signature anchor extraction.
 * Supports CLIENT/SERVICE PROVIDER/PARTY N and Paid Pro role-faithful entity legal names.
 */

const ENTITY_SUFFIX_RE =
  /\b(?:LLC|L\.L\.C\.|Inc\.?|INC|Incorporated|Corp\.?|Corporation|Ltd\.?|Limited|LLP|PLLC|LP|L\.P\.)\b/i;

const CANONICAL_ROLE_BLOCK_HEADINGS = [
  { re: /^\s*CLIENT\s*:?\s*$/i, partyIndex: 0, label: "CLIENT" },
  { re: /^\s*SERVICE PROVIDER\s*:?\s*$/i, partyIndex: 1, label: "SERVICE PROVIDER" },
  { re: /^\s*PARTY\s+(\d+)\s*:?\s*$/i, partyIndex: -1, label: "PARTY" },
] as const;

export type ExecutionBlockHeadingMatch = {
  partyIndex: number;
  blockHeading: string;
};

export type ExecutionBlockHeadingScanState = {
  inWitnessBlock: boolean;
  nextSequentialPartyIndex: number;
  current: ExecutionBlockHeadingMatch | null;
};

export function createExecutionBlockHeadingScanState(
  initial?: Partial<Pick<ExecutionBlockHeadingScanState, "inWitnessBlock" | "nextSequentialPartyIndex">>,
): ExecutionBlockHeadingScanState {
  return {
    inWitnessBlock: initial?.inWitnessBlock ?? false,
    nextSequentialPartyIndex: initial?.nextSequentialPartyIndex ?? 0,
    current: null,
  };
}

export function isWitnessBlockMarkerLine(trimmed: string): boolean {
  return /^IN WITNESS WHEREOF\b/i.test(trimmed);
}

function normalizeEntityLabel(label: string): string {
  return label.replace(/:\s*$/, "").replace(/\s+/g, " ").trim().toLowerCase();
}

export function isEntityExecutionBlockHeadingLine(trimmed: string, inWitnessBlock: boolean): boolean {
  if (!trimmed) return false;
  if (!inWitnessBlock) return false;
  return isEntityLegalNameHeadingLine(trimmed);
}

/** Entity legal-name line suitable for witness / execution-block party indexing. */
export function isEntityLegalNameHeadingLine(trimmed: string): boolean {
  if (!trimmed) return false;
  if (!/:\s*$/.test(trimmed)) return false;
  if (/^(?:By|Signature|Name|Title|Date|Email|Address)\s*:/i.test(trimmed)) return false;
  if (/\bif\s+to\b/i.test(trimmed)) return false;
  if (/^(?:CLIENT|SERVICE PROVIDER|PARTY\s+\d+)\s*:?\s*$/i.test(trimmed)) return false;
  const entity = trimmed.replace(/:\s*$/, "").trim();
  if (entity.length < 4 || entity.length > 160) return false;
  if (/^\d+\.\s+/.test(entity)) return false;
  return ENTITY_SUFFIX_RE.test(entity);
}

export function matchCanonicalRoleBlockHeading(trimmed: string): ExecutionBlockHeadingMatch | null {
  for (const h of CANONICAL_ROLE_BLOCK_HEADINGS) {
    const m = trimmed.match(h.re);
    if (!m) continue;
    const partyIndex = h.partyIndex >= 0 ? h.partyIndex : Math.max(0, Number(m[1]) - 1);
    return { partyIndex, blockHeading: h.label };
  }
  return null;
}

export function partyIndexForEntityLabel(
  entityLabel: string,
  roleEntityNames?: readonly string[],
): number | null {
  if (!roleEntityNames?.length) return null;
  const norm = normalizeEntityLabel(entityLabel);
  const idx = roleEntityNames.findIndex((name) => normalizeEntityLabel(name) === norm);
  return idx >= 0 ? idx : null;
}

/** Update scan state from a non-empty line; returns heading match when a block opens. */
export function scanExecutionBlockHeadingLine(
  trimmed: string,
  state: ExecutionBlockHeadingScanState,
  roleEntityNames?: readonly string[],
): ExecutionBlockHeadingMatch | null {
  if (!trimmed) return null;
  if (isWitnessBlockMarkerLine(trimmed)) {
    state.inWitnessBlock = true;
    state.nextSequentialPartyIndex = 0;
    state.current = null;
    return null;
  }

  const canonical = matchCanonicalRoleBlockHeading(trimmed);
  if (canonical) {
    state.current = canonical;
    return canonical;
  }

  if (state.inWitnessBlock && isEntityLegalNameHeadingLine(trimmed)) {
    const entityLabel = trimmed.replace(/:\s*$/, "").trim();
    const fromRoles = partyIndexForEntityLabel(entityLabel, roleEntityNames);
    const partyIndex = fromRoles ?? state.nextSequentialPartyIndex;
    const match: ExecutionBlockHeadingMatch = { partyIndex, blockHeading: entityLabel };
    state.current = match;
    state.nextSequentialPartyIndex = Math.max(state.nextSequentialPartyIndex, partyIndex + 1);
    return match;
  }

  if (!state.inWitnessBlock && isEntityLegalNameHeadingLine(trimmed)) {
    state.inWitnessBlock = true;
    const entityLabel = trimmed.replace(/:\s*$/, "").trim();
    const fromRoles = partyIndexForEntityLabel(entityLabel, roleEntityNames);
    const partyIndex = fromRoles ?? state.nextSequentialPartyIndex;
    const match: ExecutionBlockHeadingMatch = { partyIndex, blockHeading: entityLabel };
    state.current = match;
    state.nextSequentialPartyIndex = Math.max(state.nextSequentialPartyIndex, partyIndex + 1);
    return match;
  }

  return null;
}

/** Resolve partyIndex for a By:/Signature: execution line. */
export function resolveSignatureExecutionPartyIndex(args: {
  state: ExecutionBlockHeadingScanState;
  priorSignatureExecutionLineCount: number;
}): number {
  if (args.state.current != null) return args.state.current.partyIndex;
  if (args.state.inWitnessBlock) {
    return args.priorSignatureExecutionLineCount;
  }
  return args.priorSignatureExecutionLineCount === 0 ? 0 : 1;
}

export function executionBlockHeadingStateAfterPage(
  state: ExecutionBlockHeadingScanState,
): Pick<ExecutionBlockHeadingScanState, "inWitnessBlock" | "nextSequentialPartyIndex"> {
  return {
    inWitnessBlock: state.inWitnessBlock,
    nextSequentialPartyIndex: state.nextSequentialPartyIndex,
  };
}

/** Party block index for a witness-region line (entity legal names + CLIENT/SERVICE PROVIDER). */
export function partyIndexAtWitnessLine(
  lines: readonly string[],
  targetLineIndex: number,
  patchStart: number,
  roleEntityNames?: readonly string[],
): number {
  const state = createExecutionBlockHeadingScanState();
  let byLineIndex = -1;
  let dateLineIndex = -1;
  for (let i = 0; i <= targetLineIndex; i += 1) {
    const lineStart = i === 0 ? 0 : lines.slice(0, i).join("\n").length + 1;
    if (lineStart < patchStart) continue;
    const trimmed = lines[i]!.trim();
    scanExecutionBlockHeadingLine(trimmed, state, roleEntityNames);
    if (/^by\s*:/i.test(trimmed)) {
      byLineIndex += 1;
      if (i === targetLineIndex) {
        const prevTrimmed = i > 0 ? lines[i - 1]!.trim() : "";
        const prev2Trimmed = i > 1 ? lines[i - 2]!.trim() : "";
        const prevEntity =
          isEntityLegalNameHeadingLine(prevTrimmed) || isEntityLegalNameHeadingLine(prev2Trimmed);
        if (prevEntity) {
          return state.current?.partyIndex ?? Math.max(0, byLineIndex);
        }
        return Math.max(0, byLineIndex);
      }
    }
    if (/^date\s*:/i.test(trimmed)) {
      dateLineIndex += 1;
      if (i === targetLineIndex) {
        const prevTrimmed = i > 0 ? lines[i - 1]!.trim() : "";
        const prev2Trimmed = i > 1 ? lines[i - 2]!.trim() : "";
        const prevEntity =
          isEntityLegalNameHeadingLine(prevTrimmed) || isEntityLegalNameHeadingLine(prev2Trimmed);
        if (prevEntity) {
          return state.current?.partyIndex ?? Math.max(0, dateLineIndex);
        }
        return Math.max(0, dateLineIndex);
      }
    }
  }
  if (state.current != null) return state.current.partyIndex;
  return 0;
}

export function extractRoleEntityNamesFromPortableRoles(
  roles: readonly { partyIndex?: number; entityName?: string; partyName?: string }[],
): string[] {
  return [...roles]
    .sort((a, b) => (a.partyIndex ?? 0) - (b.partyIndex ?? 0))
    .map((r) => (r.entityName || r.partyName || "").trim())
    .filter(Boolean);
}
