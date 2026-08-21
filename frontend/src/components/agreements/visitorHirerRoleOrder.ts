import type { ParsedDraftShape } from "./intakeSmartDefaults";

/** "need someone to …" — visitor is the hirer (Client); the unnamed doer is Service Provider. */
export function isVisitorHirerNeedSomeoneDump(raw: string): boolean {
  return /\bneed\s+someone\s+to\b/i.test((raw || "").replace(/\s+/g, " "));
}

function looksLikeUnnamedPlaceholderName(name: string): boolean {
  return /^(client|service provider|party [ab])$/i.test((name || "").trim());
}

/**
 * Role-order guard for unnamed Client + Service Provider placeholders.
 * Keeps the visitor (hirer) as Client first. Does not invent or rename a real person.
 */
export function orderUnnamedClientThenServiceProvider<T extends ParsedDraftShape>(draft: T): T {
  const parties = draft.parties || [];
  if (parties.length !== 2) return draft;
  const n0 = (parties[0].name || "").trim();
  const n1 = (parties[1].name || "").trim();
  const clientFirst = /^client$/i.test(n0) && /^service provider$/i.test(n1);
  const providerFirst = /^service provider$/i.test(n0) && /^client$/i.test(n1);
  if (!clientFirst && !providerFirst) return draft;
  const r0 = (parties[0].role || "").trim().toLowerCase();
  const r1 = (parties[1].role || "").trim().toLowerCase();
  if (clientFirst && r0 === "client" && r1 === "service_provider") return draft;
  const clientRow = clientFirst ? parties[0] : parties[1];
  const providerRow = clientFirst ? parties[1] : parties[0];
  return {
    ...draft,
    parties: [
      { ...clientRow, name: "Client", role: "client" },
      { ...providerRow, name: "Service Provider", role: "service_provider" },
    ],
  };
}

/**
 * "need someone to …" dumps already have two unnamed slots (Party A/B or swapped
 * Client / Service Provider). Force visitor = Client, doer = Service Provider.
 */
export function applyVisitorHirerUnnamedRoleOrderGuard<T extends ParsedDraftShape>(
  draft: T,
  intakeText: string,
): T {
  if (!isVisitorHirerNeedSomeoneDump(intakeText)) {
    return orderUnnamedClientThenServiceProvider(draft);
  }
  const parties = draft.parties || [];
  if (parties.length !== 2) return draft;
  if (!parties.every((p) => looksLikeUnnamedPlaceholderName(String(p?.name || "")))) {
    return orderUnnamedClientThenServiceProvider(draft);
  }
  return {
    ...draft,
    parties: [
      { ...parties[0], name: "Client", role: "client" },
      { ...parties[1], name: "Service Provider", role: "service_provider" },
    ],
  };
}
