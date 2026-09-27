/**
 * Persist intake-confirmed signer identity on durable party IDs.
 * Empty later shells must not erase confirmed signer name/title/email.
 */

export type PersistableParty = {
  id?: string | null;
  name?: string | null;
  role?: string | null;
  email?: string | null;
  phone?: string | null;
  signerName?: string | null;
  signer_name?: string | null;
  signerTitle?: string | null;
  signer_title?: string | null;
};

const ENTITY_SUFFIX = /\b(?:LLC|L\.L\.C\.|Inc\.?|Incorporated|Corp\.?|Corporation|Ltd\.?|Limited|LLP|PLLC|LP)\b/i;

export function nonemptyPartyField(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text || null;
}

export function normalizePartyLegalName(name: string): string {
  return String(name || "").replace(/\s+/g, " ").trim().toLowerCase().replace(/[.,;:]+$/, "");
}

export function partyIdOf(row: PersistableParty | undefined | null): string {
  return String(row?.id || "").trim();
}

export function signerNameOf(row: PersistableParty | undefined | null): string | null {
  return nonemptyPartyField(row?.signerName ?? row?.signer_name);
}

export function signerTitleOf(row: PersistableParty | undefined | null): string | null {
  return nonemptyPartyField(row?.signerTitle ?? row?.signer_title);
}

export function isEntityNameCopy(signerName: string | null, entityName: string | null): boolean {
  const signer = nonemptyPartyField(signerName);
  const entity = nonemptyPartyField(entityName);
  if (!signer) return false;
  if (entity && normalizePartyLegalName(signer) === normalizePartyLegalName(entity)) return true;
  return ENTITY_SUFFIX.test(signer);
}

export function acceptedHumanSignerName(signerName: string | null, entityName: string | null): string | null {
  const name = nonemptyPartyField(signerName);
  if (!name) return null;
  if (isEntityNameCopy(name, entityName)) return null;
  return name;
}

export function preferConfirmed(incoming: string | null, prior: string | null): string | null {
  return nonemptyPartyField(incoming) || nonemptyPartyField(prior);
}

function uniqueCurrentByLegalName(
  name: string,
  current: PersistableParty[],
  usedIds: Set<string>,
): PersistableParty | null {
  const key = normalizePartyLegalName(name);
  if (!key) return null;
  const matches = current.filter(
    (row) => normalizePartyLegalName(String(row.name || "")) === key && !usedIds.has(partyIdOf(row)),
  );
  return matches.length === 1 ? matches[0]! : null;
}

function emitParty(row: PersistableParty, entity: string, role: string, pid: string): PersistableParty {
  const signer = acceptedHumanSignerName(signerNameOf(row), entity);
  const title = signerTitleOf(row);
  const email = nonemptyPartyField(row.email);
  return {
    ...(pid ? { id: pid } : {}),
    name: entity,
    role: role || "party",
    ...(email ? { email } : {}),
    ...(nonemptyPartyField(row.phone) ? { phone: nonemptyPartyField(row.phone)! } : {}),
    ...(signer ? { signerName: signer, signer_name: signer } : {}),
    ...(title ? { signerTitle: title, signer_title: title } : {}),
  };
}

export function mergeStructuredPartyIdentity(args: {
  current: readonly PersistableParty[] | null | undefined;
  incoming: readonly PersistableParty[] | null | undefined;
}): PersistableParty[] {
  const currentRows = (args.current ?? []).filter((row) => nonemptyPartyField(row.name));
  const incomingRows = (args.incoming ?? []).filter((row) => nonemptyPartyField(row.name));
  if (!incomingRows.length) {
    return currentRows.map((row) =>
      emitParty(row, nonemptyPartyField(row.name) || "", nonemptyPartyField(row.role) || "party", partyIdOf(row)),
    );
  }
  const currentById = new Map<string, PersistableParty>();
  for (const row of currentRows) {
    const id = partyIdOf(row);
    if (id) currentById.set(id, row);
  }
  const usedIds = new Set<string>();
  const merged: PersistableParty[] = [];

  for (const incoming of incomingRows) {
    const pid = partyIdOf(incoming);
    let prior: PersistableParty | null = null;
    if (pid && currentById.has(pid)) prior = currentById.get(pid) ?? null;
    else if (!pid) prior = uniqueCurrentByLegalName(String(incoming.name || ""), currentRows, usedIds);

    if (prior) {
      const priorId = partyIdOf(prior);
      if (priorId) usedIds.add(priorId);
      const entity = nonemptyPartyField(incoming.name) || nonemptyPartyField(prior.name) || "";
      const role = nonemptyPartyField(incoming.role) || nonemptyPartyField(prior.role) || "party";
      const signer = preferConfirmed(
        acceptedHumanSignerName(signerNameOf(incoming), entity),
        acceptedHumanSignerName(signerNameOf(prior), entity),
      );
      const title = preferConfirmed(signerTitleOf(incoming), signerTitleOf(prior));
      const email = preferConfirmed(nonemptyPartyField(incoming.email), nonemptyPartyField(prior.email));
      const phone = preferConfirmed(nonemptyPartyField(incoming.phone), nonemptyPartyField(prior.phone));
      merged.push({
        ...(priorId || pid ? { id: priorId || pid } : {}),
        name: entity,
        role,
        ...(email ? { email } : {}),
        ...(phone ? { phone } : {}),
        ...(signer ? { signerName: signer, signer_name: signer } : {}),
        ...(title ? { signerTitle: title, signer_title: title } : {}),
      });
      continue;
    }

    merged.push(
      emitParty(
        incoming,
        nonemptyPartyField(incoming.name) || "",
        nonemptyPartyField(incoming.role) || "party",
        pid,
      ),
    );
  }

  for (const row of currentRows) {
    const pid = partyIdOf(row);
    if (pid && usedIds.has(pid)) continue;
    if (!pid) {
      const key = normalizePartyLegalName(String(row.name || ""));
      if (merged.some((item) => normalizePartyLegalName(String(item.name || "")) === key)) continue;
    }
    merged.push(emitParty(row, nonemptyPartyField(row.name) || "", nonemptyPartyField(row.role) || "party", pid));
  }
  return merged;
}

export function missingConfirmedSignerNames(parties: readonly PersistableParty[]): string[] {
  const missing: string[] = [];
  for (const row of parties) {
    const entity = nonemptyPartyField(row.name);
    if (!entity) continue;
    if (acceptedHumanSignerName(signerNameOf(row), entity)) continue;
    missing.push(partyIdOf(row) || entity);
  }
  return missing;
}

export function signingPreparationBlockedForMissingSigners(parties: readonly PersistableParty[]): boolean {
  return missingConfirmedSignerNames(parties).length > 0;
}
