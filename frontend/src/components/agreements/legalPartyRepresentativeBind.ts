/**
 * Bind representatives and contact details to legal parties without truncating
 * genuine contracting parties. Extraction rows are not authority.
 */

import { looksLikeEmail } from "./recipientEmailValidation";
import { isLikelyHumanSignerName } from "./intakeSignerMetadataAuthority";
import { parseIntakeToStructuredAgreement } from "./intakeStructuredAgreementModel";
import { matchSignerForEntityIsClauses } from "./intakeSignerInstructionParse";
import { isAuthoritativeLegalEntityName } from "./paidProPartyNamePreserve";
import { partyLegalNamesMatch } from "./paidProAcceptedCorpusPartyRoles";
import { classifyIdentityToken } from "./legalIdentityResolution";
import { extractBetweenPartySegmentRoleHints, isPreservableIntakeRole } from "./canonicalPartyRoleAuthority";
import { normalizeAgreementPartyName } from "./partySlotIdentityNormalize";

export type BindableParty = {
  name: string;
  role: string;
  email?: string;
  signerName?: string;
  signerTitle?: string;
};

export type BoundRepresentative = {
  name: string;
  boundTo: string;
  kind: "signer" | "email" | "role_label";
};

export type RepresentativeBindResult = {
  parties: BindableParty[];
  boundRepresentatives: BoundRepresentative[];
  unresolvedExtractionRows: BindableParty[];
  clarificationQuestion: string | null;
};

const ENTITY_SUFFIX_RE =
  /\b(?:LLC|L\.L\.C\.|Inc\.?|Incorporated|Corp\.?|Corporation|Ltd\.?|Limited|LLP|PLLC|LP|L\.P\.)\b/i;

const ENTITY_NAME =
  "[A-Z][A-Za-z0-9&'.-]+(?:\\s+[A-Z][A-Za-z0-9&'.-]+){0,6}\\s+(?:LLC|L\\.L\\.C\\.|Inc\\.?|Incorporated|Corp\\.?|Corporation|Ltd\\.?|Limited|LLP|PLLC|LP|L\\.P\\.)\\.?";

const ROLE_SIGNER_LINE_RE =
  /\b(consultant|client|customer|provider|service\s+provider|contractor)\s+signer[:\s]+([A-Z][A-Za-z'.-]+(?:\s+[A-Z][A-Za-z'.-]+){0,3})(?:[, ]+([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}))?/gi;

const ENTITY_SIGNER_LINE_RE = new RegExp(
  `(${ENTITY_NAME})\\s+signer[:\\s]+([A-Z][A-Za-z'.-]+(?:\\s+[A-Z][A-Za-z'.-]+){0,3})(?:[^@\\n]*?([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}))?`,
  "g",
);

const INDIVIDUAL_CONTRACTING_RE =
  /\b([A-Z][a-z]+(?:\s+[A-Z][a-z'.-]+){0,3})\s+(?:as\s+an\s+individual|\(individual\)|\(an\s+individual\))(?:\s*\(\s*([A-Za-z][A-Za-z\s-]{1,40})\s*\))?/g;

const CONTRACTING_PARTY_RE =
  /\b([A-Z][a-z]+(?:\s+[A-Z][a-z'.-]+){0,3})\s+is\s+(?:a|the)\s+(?:(?:second|third|fourth)\s+)?(?:contracting|legal)\s+party/gi;

const REPRESENTATIVE_ROLE_RE =
  /\b(?:signer|signatory|authorized\s+signer|notice\s+contact|email)\b/i;

function titleCaseRole(role: string): string {
  return role
    .split(/\s+/)
    .map((w) => (w.length ? w[0]!.toUpperCase() + w.slice(1).toLowerCase() : w))
    .join(" ");
}

function normKey(value: string): string {
  return normalizeAgreementPartyName(value).toLowerCase();
}

function personNamesMatch(a: string, b: string): boolean {
  const left = normKey(a);
  const right = normKey(b);
  if (!left || !right) return false;
  return left === right || left.replace(/\.$/, "") === right.replace(/\.$/, "");
}

function isLegalEntityName(name: string): boolean {
  const cleaned = normalizeAgreementPartyName(name);
  if (!cleaned) return false;
  if (looksLikeEmail(cleaned) || /@/.test(cleaned)) return false;
  if (classifyIdentityToken(cleaned) === "legal_entity") return true;
  return isAuthoritativeLegalEntityName(cleaned) && ENTITY_SUFFIX_RE.test(cleaned);
}

function isRepresentativeRole(role: string): boolean {
  return REPRESENTATIVE_ROLE_RE.test(role || "");
}

function parentRoleFromRepresentativeRole(role: string): string | null {
  const labeled = String(role || "").match(/^\s*(.+?)\s+signer(?:\s+email)?\s*$/i);
  if (labeled?.[1]) return labeled[1].toLowerCase().replace(/\s+/g, " ").trim();
  const m = String(role || "").match(
    /\b(consultant|client|customer|provider|service\s+provider|contractor)\b/i,
  );
  return m ? m[1]!.toLowerCase().replace(/\s+/g, " ") : null;
}

export function extractRoleSignerInstructions(
  intake: string,
): Array<{ role: string; signerName: string; email: string }> {
  const out: Array<{ role: string; signerName: string; email: string }> = [];
  const re = new RegExp(ROLE_SIGNER_LINE_RE.source, "gi");
  let match: RegExpExecArray | null;
  while ((match = re.exec(intake || "")) !== null) {
    out.push({
      role: (match[1] || "").toLowerCase().replace(/\s+/g, " "),
      signerName: (match[2] || "").replace(/\s+/g, " ").trim(),
      email: (match[3] || "").trim(),
    });
  }
  return out;
}

export function extractEntitySignerInstructions(
  intake: string,
): Array<{ entity: string; signerName: string; email: string }> {
  const out: Array<{ entity: string; signerName: string; email: string }> = [];
  const re = new RegExp(ENTITY_SIGNER_LINE_RE.source, "g");
  let match: RegExpExecArray | null;
  while ((match = re.exec(intake || "")) !== null) {
    out.push({
      entity: (match[1] || "").replace(/\s+/g, " ").trim(),
      signerName: (match[2] || "").replace(/\s+/g, " ").trim(),
      email: (match[3] || "").trim(),
    });
  }
  return out;
}

function intakeRoleHints(intake: string, entities: readonly string[]): Record<string, string> {
  const structured = parseIntakeToStructuredAgreement(intake);
  const between = extractBetweenPartySegmentRoleHints(intake);
  const merged: Record<string, string> = { ...structured.partyRoleHints, ...between };
  const out: Record<string, string> = {};
  for (const entity of entities) {
    const key = normKey(entity);
    const direct = merged[key] || merged[entity.toLowerCase()];
    if (direct) {
      out[key] = direct;
      continue;
    }
    for (const [hintKey, role] of Object.entries(merged)) {
      if (key === hintKey || key.replace(/\.$/, "") === hintKey.replace(/\.$/, "")) {
        out[key] = role;
        break;
      }
    }
  }
  return out;
}

function entityForRoleHint(
  entities: readonly string[],
  hints: Record<string, string>,
  role: string,
  slotRoles?: Record<string, string>,
): string | null {
  const want = role.toLowerCase().replace(/\s+/g, " ");
  if (!want || want.length < 3) return null;
  for (const entity of entities) {
    const hint = (hints[normKey(entity)] || slotRoles?.[normKey(entity)] || "").toLowerCase().replace(/\s+/g, " ");
    if (hint && (hint === want || hint.includes(want) || want.includes(hint))) return entity;
  }
  return null;
}

function individualContracting(intake: string): Record<string, string> {
  const found: Record<string, string> = {};
  const individualRe = new RegExp(INDIVIDUAL_CONTRACTING_RE.source, "g");
  let match: RegExpExecArray | null;
  while ((match = individualRe.exec(intake || "")) !== null) {
    const name = (match[1] || "").replace(/\s+/g, " ").trim();
    const role = (match[2] || "").replace(/\s+/g, " ").trim();
    if (name && isLikelyHumanSignerName(name)) found[name] = role ? titleCaseRole(role) : "Individual";
  }
  const contractingRe = new RegExp(CONTRACTING_PARTY_RE.source, "gi");
  while ((match = contractingRe.exec(intake || "")) !== null) {
    const name = (match[1] || "").replace(/\s+/g, " ").trim();
    if (name && isLikelyHumanSignerName(name) && !Object.keys(found).some((prev) => personNamesMatch(prev, name))) {
      found[name] = "Individual";
    }
  }
  return found;
}

export function applyExplicitIntakeRolesToParties<T extends BindableParty>(
  parties: readonly T[],
  intake: string | null | undefined,
): T[] {
  const names = parties.map((p) => String(p.name || "").trim()).filter(Boolean);
  const hints = intakeRoleHints(intake || "", names);
  const individuals = individualContracting(intake || "");
  return parties.map((party) => {
    const hint = hints[normKey(party.name || "")];
    if (hint && isPreservableIntakeRole(hint)) return { ...party, role: titleCaseRole(hint) };
    const individualRole = Object.entries(individuals).find(([name]) => personNamesMatch(name, party.name || ""))?.[1];
    if (individualRole && (!party.role || party.role === "party" || isRepresentativeRole(party.role))) {
      return { ...party, role: individualRole };
    }
    return party;
  });
}

/**
 * Collapse signer/email rows onto the represented legal parties.
 * Does not drop people who are explicitly contracting as individuals.
 * Email resemblance never establishes representation.
 */
export function bindRepresentativesToLegalParties(
  parties: readonly BindableParty[],
  rawIntake: string | null | undefined,
): RepresentativeBindResult {
  const intake = String(rawIntake || "");
  const rows = (parties || []).map((p) => ({
    name: String(p.name || "").replace(/\s+/g, " ").trim(),
    role: String(p.role || "").trim(),
    email: String(p.email || "").trim(),
    signerName: String(p.signerName || "").trim(),
    signerTitle: String(p.signerTitle || "").trim(),
  }));

  const structured = parseIntakeToStructuredAgreement(intake);
  const intakeEntities = structured.parties.filter((name) => isLegalEntityName(name));
  const rowEntities = rows.filter((r) => isLegalEntityName(r.name)).map((r) => r.name);
  const entities: string[] = [];
  for (const name of [...intakeEntities, ...rowEntities]) {
    if (!entities.some((prev) => partyLegalNamesMatch(prev, name))) entities.push(name);
  }

  const hints = intakeRoleHints(intake, entities);
  const roleSigners = extractRoleSignerInstructions(intake);
  const entityLineSigners = extractEntitySignerInstructions(intake);
  const entitySigners = [
    ...matchSignerForEntityIsClauses(intake),
    ...entityLineSigners.map((item) => ({
      entity: item.entity,
      signerName: item.signerName,
      signerTitle: "",
    })),
  ];
  const slotRoles: Record<string, string> = {};
  const individuals = individualContracting(intake);
  const bound: BoundRepresentative[] = [];
  const confirmedIndividuals: BindableParty[] = [];
  const unresolved: BindableParty[] = [];

  const slots = new Map<string, BindableParty>();
  for (const entity of entities) {
    const row = rows.find((r) => partyLegalNamesMatch(r.name, entity));
    slots.set(normKey(entity), {
      name: row?.name || entity,
      role: row?.role && !isRepresentativeRole(row.role) ? row.role : titleCaseRole(hints[normKey(entity)] || "") || "party",
      email: row?.email && looksLikeEmail(row.email) ? row.email : "",
      signerName: row?.signerName && isLikelyHumanSignerName(row.signerName) ? row.signerName : "",
      signerTitle: row?.signerTitle || "",
    });
    slotRoles[normKey(entity)] = slots.get(normKey(entity))!.role;
  }

  const bindTo = (entityName: string, patch: Partial<BindableParty>, sourceName: string, kind: BoundRepresentative["kind"]) => {
    const key = normKey(entityName);
    const current = slots.get(key);
    if (!current) return false;
    slots.set(key, {
      ...current,
      email: current.email || (patch.email && looksLikeEmail(patch.email) ? patch.email : ""),
      signerName:
        current.signerName ||
        (patch.signerName && isLikelyHumanSignerName(patch.signerName) ? patch.signerName : ""),
      signerTitle: current.signerTitle || patch.signerTitle || "",
      role: current.role && current.role !== "party" ? current.role : patch.role || current.role,
    });
    bound.push({ name: sourceName, boundTo: current.name, kind });
    return true;
  };

  for (const row of rows) {
    if (!row.name) continue;
    if (entities.some((entity) => partyLegalNamesMatch(entity, row.name))) continue;

    const emailOnly = looksLikeEmail(row.name) && !isLikelyHumanSignerName(row.name);
    if (emailOnly) {
      const roleEntity = entityForRoleHint(
        entities,
        hints,
        parentRoleFromRepresentativeRole(row.role) || "",
        slotRoles,
      );
      if (roleEntity && bindTo(roleEntity, { email: row.name }, row.name, "email")) continue;
      unresolved.push({ ...row, email: row.name });
      continue;
    }

    if (isLikelyHumanSignerName(row.name) || isRepresentativeRole(row.role)) {
      const individualEntry = Object.entries(individuals).find(([name]) => personNamesMatch(name, row.name));
      if (individualEntry) {
        confirmedIndividuals.push({
          ...row,
          role: row.role && !isRepresentativeRole(row.role) ? row.role : individualEntry[1],
        });
        continue;
      }
      const instruction = roleSigners.find((item) => personNamesMatch(item.signerName, row.name));
      const entityInstruction = entitySigners.find((item) => personNamesMatch(item.signerName, row.name));
      const entityLine = entityLineSigners.find((item) => personNamesMatch(item.signerName, row.name));
      const roleEntity = entityForRoleHint(
        entities,
        hints,
        instruction?.role || parentRoleFromRepresentativeRole(row.role) || "",
        slotRoles,
      );
      const target = entityInstruction?.entity || roleEntity;
      if (
        target &&
        bindTo(
          target,
          {
            signerName: row.name,
            email: instruction?.email || entityLine?.email || row.email,
            role: instruction?.role ? titleCaseRole(instruction.role) : undefined,
          },
          row.name,
          isRepresentativeRole(row.role) ? "role_label" : "signer",
        )
      ) {
        continue;
      }
      unresolved.push(row);
      continue;
    }

    unresolved.push(row);
  }

  for (const item of roleSigners) {
    const target = entityForRoleHint(entities, hints, item.role, slotRoles);
    if (target) bindTo(target, { signerName: item.signerName, email: item.email }, item.signerName, "signer");
  }
  for (const item of entitySigners) {
    const target = entities.find((entity) => partyLegalNamesMatch(entity, item.entity));
    if (target) bindTo(target, { signerName: item.signerName, signerTitle: item.signerTitle }, item.signerName, "signer");
  }
  for (const item of entityLineSigners) {
    const target = entities.find((entity) => partyLegalNamesMatch(entity, item.entity));
    if (target) bindTo(target, { signerName: item.signerName, email: item.email }, item.signerName, "signer");
  }

  const partiesOut = applyExplicitIntakeRolesToParties(
    [...entities.map((entity) => slots.get(normKey(entity))!).filter(Boolean), ...confirmedIndividuals],
    intake,
  );

  const unresolvedHumans = unresolved.filter((row) => isLikelyHumanSignerName(row.name));
  const clarificationQuestion =
    unresolvedHumans.length > 0 && entities.length >= 2
      ? `Is ${unresolvedHumans[0]!.name} signing for one of the named companies, or contracting as their own legal party?`
      : null;

  return {
    parties: partiesOut,
    boundRepresentatives: bound,
    unresolvedExtractionRows: unresolved,
    clarificationQuestion,
  };
}
