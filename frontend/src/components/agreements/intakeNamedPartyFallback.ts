/**
 * Cheap local fallback when structured extraction left generic Party A / Party B
 * but the intake names a person + entity (e.g. employment-style phrasing).
 */
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { extractBetweenPartyPair } from "./partyBetweenParse";
import { stripPartyRoleAnnotations } from "./partyRoleAnnotations";

const MAX_NAME = 280;

/**
 * Universal cleanup applied to every name produced by this fallback. Strips trailing
 * "(landlord)" / "(seller)" / "as guarantor" role hints so they don't leak into the
 * party name. Role metadata is dropped here because callers tag with role: "party".
 */
function cleanFallbackName(raw: string): string {
  const { name } = stripPartyRoleAnnotations((raw || "").trim());
  return name.replace(/\s+/g, " ").trim();
}

/**
 * Money, term, and clause fragments must never occupy a party slot
 * ("$3k, Two Weeks", "They Pay Monthly", "two weeks", "3k/month").
 */
export function looksLikeMoneyTermOrClausePartyName(raw: string): boolean {
  const t = (raw || "").replace(/\s+/g, " ").trim();
  if (!t) return false;
  if (/\b(?:LLC|L\.L\.C\.|Inc\.?|Corp\.?|Corporation|Ltd\.?|Limited|LLP|PLLC)\b/i.test(t)) return false;
  if (/\$/.test(t)) return true;
  if (/\b\d+(?:\.\d+)?\s*k\b/i.test(t)) return true;
  if (/\/\s*(?:mo(?:nth)?|wk|week|yr|year|hr|hour)\b/i.test(t)) return true;
  if (/\bthey\s+pay\b/i.test(t)) return true;
  if (/^(?:pay|paid|pays)\s+(?:monthly|weekly|daily|annually|hourly)\b/i.test(t)) return true;
  if (/^(?:daily|weekly|monthly|yearly|annually|hourly)$/i.test(t)) return true;
  if (/^(?:(?:a|an|one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+)?(?:days?|weeks?|months?|years?)$/i.test(t)) return true;
  if (
    /\b(?:one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+(?:days?|weeks?|months?|years?)\b/i.test(t) &&
    !/\b(?:LLC|Inc\.?|Corp\.?|Ltd\.?)\b/i.test(t)
  ) {
    const leftover = t
      .replace(/\b(?:one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+(?:days?|weeks?|months?|years?)\b/gi, " ")
      .replace(/[$,]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!leftover || leftover.length < 3) return true;
  }
  return false;
}

function looksLikeGenericPartyRow(parties: { name: string; role: string }[]): boolean {
  if (parties.length < 2) return true;
  if (parties.some((p) => looksLikeMoneyTermOrClausePartyName(p.name))) return true;
  const blob = parties.map((p) => p.name).join(" ").toLowerCase();
  return (
    /\bparty\s*a\b|\bparty\s*b\b|edit\s+in\s+review|placeholder/i.test(blob) ||
    (/\bparty\s+a\b/i.test(blob) && /\bparty\s+b\b/i.test(blob))
  );
}

/**
 * Extract explicit signer/party rows from intake text.
 * Matches patterns like:
 *   "Sender/signer 1: Anthem Blanchard, anthem@example.com"
 *   "Signer 2: Sarah Collins (sarah@test.com)"
 *   "Party 3 - Michael Reed"
 *   "Signer: Jamie Chen jamie@x.com"
 */
const SIGNER_LINE_RE =
  /(?:sender\s*[/&]?\s*)?(?:signer|party|signatory|recipient|reviewer)\s*(?:#?\d+)?[:\s—–-]+([A-Z][a-zA-Z'-]+(?:\s+[A-Z][a-zA-Z'-]+)+)/gi;

const EMAIL_AFTER_NAME_RE = /[,\s(]+([^\s,()@]+@[^\s,()]+)/;

function extractExplicitSignerRows(raw: string): { name: string; role: string; email?: string }[] | null {
  const lines = raw.split(/[\n\r]+/).map((l) => l.trim()).filter(Boolean);
  const results: { name: string; role: string; email?: string }[] = [];
  const seenNames = new Set<string>();

  for (const line of lines) {
    SIGNER_LINE_RE.lastIndex = 0;
    const m = SIGNER_LINE_RE.exec(line);
    if (!m || !m[1]) continue;
    const name = m[1].trim().slice(0, MAX_NAME);
    if (name.length < 3) continue;
    const nameKey = name.toLowerCase();
    if (seenNames.has(nameKey)) continue;
    seenNames.add(nameKey);
    const rest = line.slice(m.index + m[0].length);
    const emailMatch = rest.match(EMAIL_AFTER_NAME_RE) || line.slice(m.index).match(EMAIL_AFTER_NAME_RE);
    const email = emailMatch?.[1]?.trim();
    results.push({ name, role: "party", ...(email ? { email } : {}) });
  }

  if (results.length < 2) {
    const fullText = raw.replace(/\s+/g, " ").trim();
    SIGNER_LINE_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = SIGNER_LINE_RE.exec(fullText)) !== null) {
      const name = match[1].trim().slice(0, MAX_NAME);
      if (name.length < 3) continue;
      const nameKey = name.toLowerCase();
      if (seenNames.has(nameKey)) continue;
      seenNames.add(nameKey);
      results.push({ name, role: "party" });
    }
  }

  return results.length >= 2 ? results : null;
}

/** "Ada Lopez of Studio is hiring Beau Ortiz of Agency LLC to …" → two stated parties, not four. */
const HIRING_PERSON_OF_ENTITY_RE =
  /\b([A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+)+)\s+of\s+([A-Z][A-Za-z0-9&.'’\-\s]{1,72}?)\s+is\s+(?:hiring|engaging|retaining|commissioning)\s+([A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+)+)\s+of\s+([A-Z][A-Za-z0-9&.'’\-\s]{1,80}?)(?=\s+to\s+|\s*[.,;]|$)/i;

/**
 * Two-party "A of Org is hiring B of Org" — person+entity stay one party each.
 * Never expands into four contracting parties.
 */
export function extractStatedTwoPartyHiringPair(
  raw: string,
): { name: string; role: string }[] | null {
  const m = HIRING_PERSON_OF_ENTITY_RE.exec(String(raw || "").replace(/\s+/g, " ").trim());
  if (!m?.[1] || !m[2] || !m[3] || !m[4]) return null;
  const leftOrg = m[2].replace(/[.,;:]+$/g, "").replace(/\s+/g, " ").trim();
  const rightOrg = m[4].replace(/[.,;:]+$/g, "").replace(/\s+/g, " ").trim();
  if (!leftOrg || !rightOrg) return null;
  return [
    { name: `${m[1].trim()} of ${leftOrg}`, role: "client" },
    { name: `${m[3].trim()} of ${rightOrg}`, role: "service_provider" },
  ];
}

/**
 * e.g. "employment agreement for John Smith at Acme LLC" / "for Jane Doe in Widget Inc."
 */
export function tryInferNamedPartiesFromIntake(raw: string): { name: string; role: string; email?: string }[] | null {
  const hiringPair = extractStatedTwoPartyHiringPair(raw);
  if (hiringPair && hiringPair.length === 2) return hiringPair;

  const explicit = extractExplicitSignerRows(raw);
  if (explicit && explicit.length >= 2) return explicit;

  const t = raw.replace(/\s+/g, " ").trim();
  if (t.length < 12) return null;

  const emp = t.match(
    /\b(?:employment|hire|hiring)\s+(?:agreement|contract)\s+for\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\s+(?:at|in|with)\s+([^.,;]{2,120}?(?:LLC|L\.L\.C\.|Inc\.?|Corp\.?|Corporation|Ltd\.?|Limited|Company|Co\.))\b/i,
  );
  if (emp && emp[1] && emp[2]) {
    return [
      { name: cleanFallbackName(emp[1]).slice(0, MAX_NAME), role: "party" },
      { name: cleanFallbackName(emp[2]).slice(0, MAX_NAME), role: "party" },
    ];
  }

  const forOrg = t.match(
    /\bfor\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\s+(?:at|in|with)\s+([^.,;]{2,120}?(?:LLC|L\.L\.C\.|Inc\.?|Corp\.?|Corporation|Ltd\.?|Limited|Company))\b/i,
  );
  if (forOrg && forOrg[1] && forOrg[2] && /\b(?:agreement|contract|employment)\b/i.test(t)) {
    return [
      { name: cleanFallbackName(forOrg[1]).slice(0, MAX_NAME), role: "party" },
      { name: cleanFallbackName(forOrg[2]).slice(0, MAX_NAME), role: "party" },
    ];
  }

  const betweenPair = extractBetweenPartyPair(t);
  if (betweenPair) {
    const a = cleanFallbackName(betweenPair.left);
    const b = cleanFallbackName(betweenPair.right);
    if (a.length >= 2 && b.length >= 2 && !/^the\s+/i.test(a)) {
      return [
        { name: a.slice(0, MAX_NAME), role: "party" },
        { name: b.slice(0, MAX_NAME), role: "party" },
      ];
    }
  }

  const casual = inferCasualTwoPartyFromDump(raw);
  if (casual) return casual;

  return null;
}

const CASUAL_NAME_STOP = new Set([
  "i", "we", "the", "a", "an", "this", "that", "my", "our", "your",
  "draft", "create", "make", "need", "want", "please", "agreement",
  "contract", "deal", "simple", "for", "and",
  "lol", "pizza", "biscuit", "teal", "testing",
  "provide", "using", "statutory", "proprietary", "parties", "party",
]);

const PERSON_NAME_CAPTURE = "([A-Z][a-z]{2,}(?:\\s+[A-Z][a-z]{2,})?)";

/** Verbs a named person/company will/is doing in a casual dump. */
const CASUAL_DO_VERBS =
  "paint|design|fix|repair|build|clean|consult|write|create|install|photograph|photo|shoot|film|mow|walk|tutor|coach|edit|deliver|cater|sell|buy|split|share|handle|redo|remodel|renovate|dogsit|dogsitting|babysit|housesit";

const CASUAL_WORK_STEM =
  "(?:paint(?:ing)?|design(?:ing)?|fix(?:ing)?|repair(?:ing)?|build(?:ing)?|clean(?:ing)?|consult(?:ing)?|writ(?:e|ing)|creat(?:e|ing)|install(?:ing)?|photograph(?:ing)?|photo(?:graphing)?|shoot(?:ing)?|film(?:ing)?|mow(?:ing)?|walk(?:ing)?|tutor(?:ing)?|coach(?:ing)?|edit(?:ing)?|deliver(?:ing)?|cater(?:ing)?|sell(?:ing)?|buy(?:ing)?|split(?:ting)?|shar(?:e|ing)|handl(?:e|ing)|redo(?:ing)?|remodel(?:ing)?|renovat(?:e|ing)|dogsit(?:ting)?|babysit(?:ting)?|housesit(?:ting)?)";

const CASUAL_WILL_CONNECTOR = "(?:will|is going to|are going to|is|are)";

const COMPANY_CAPTURE =
  "([A-Z][A-Za-z0-9&'.-]+(?:\\s+[A-Z][A-Za-z0-9&'.-]+){0,4}\\s+(?:LLC|L\\.L\\.C\\.|Inc\\.?|Corp\\.?|Corporation|Ltd\\.?|Limited|Company|LLP|PLLC))";

const CASUAL_CALENDAR_STOP = new Set([
  "january", "february", "march", "april", "may", "june", "july", "august",
  "september", "october", "november", "december",
  "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
]);

function looksLikePersonName(raw: string): boolean {
  const name = (raw || "").trim();
  if (looksLikeMoneyTermOrClausePartyName(name)) return false;
  if (!/^[A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,})?$/.test(name)) return false;
  const first = name.split(/\s+/)[0].toLowerCase();
  if (CASUAL_NAME_STOP.has(first) || CASUAL_CALENDAR_STOP.has(first) || CASUAL_CALENDAR_STOP.has(name.toLowerCase())) {
    return false;
  }
  return true;
}

function looksLikeCompanyName(raw: string): boolean {
  return /(?:LLC|L\.L\.C\.|Inc\.?|Corp\.?|Corporation|Ltd\.?|Limited|Company|LLP|PLLC)\s*$/i.test(
    (raw || "").trim(),
  );
}

/** Visitor speaking in first person — Party 1 even when they never name themselves. */
export function hasFirstPersonVisitor(raw: string): boolean {
  return /\b(?:I(?:'m|'ve|'d)?|me|my)\b/.test(String(raw || ""));
}

function addUniqueCasualName(out: string[], seen: Set<string>, raw: string): void {
  const name = (raw || "").replace(/\s+/g, " ").trim();
  if (name.length < 2 || name.length > MAX_NAME) return;
  const key = name.toLowerCase();
  if (seen.has(key)) return;
  const overlap = out.findIndex(
    (existing) => existing.toLowerCase().includes(key) || key.includes(existing.toLowerCase()),
  );
  if (overlap >= 0) {
    if (name.length > out[overlap].length) {
      seen.delete(out[overlap].toLowerCase());
      out[overlap] = name;
      seen.add(key);
    }
    return;
  }
  seen.add(key);
  out.push(name);
}

/** Named person or company counterparties — not months, junk, or money fragments. */
export function extractCasualNamedCounterparties(raw: string): string[] {
  const t = String(raw || "");
  const out: string[] = [];
  const seen = new Set<string>();

  const companyRe = new RegExp(COMPANY_CAPTURE, "g");
  for (const match of t.matchAll(companyRe)) {
    if (match[1]) addUniqueCasualName(out, seen, match[1]);
  }

  const personRe = new RegExp(`\\b${PERSON_NAME_CAPTURE}\\b`, "g");
  for (const match of t.matchAll(personRe)) {
    const name = (match[1] || "").trim();
    if (!looksLikePersonName(name)) continue;
    const after = t.slice((match.index ?? 0) + match[0].length);
    if (/^\s+law\b/i.test(after)) continue;
    if (out.some((existing) => existing.toLowerCase().includes(name.toLowerCase()))) continue;
    addUniqueCasualName(out, seen, name);
  }
  return out;
}

function namedHirerAndCompany(
  person: string,
  company: string,
): { name: string; role: string }[] {
  return [
    { name: person.trim().slice(0, MAX_NAME), role: "client" },
    { name: company.trim().replace(/\s+/g, " ").slice(0, MAX_NAME), role: "service_provider" },
  ];
}

/**
 * Visitor + one named other person/company is a free two-party deal.
 * Person + company (Jordan Hale hiring Pine Street Media LLC) is two parties.
 * Three-plus named counterparties stay out so Pro can take the multi-party path.
 */
function inferVisitorPlusNamedTwoParty(raw: string): { name: string; role: string }[] | null {
  const named = extractCasualNamedCounterparties(raw);
  if (named.length === 0 || named.length >= 3) return null;
  const firstPerson = hasFirstPersonVisitor(raw);

  // I / my / me + exactly one named person or company.
  if (named.length === 1) {
    return firstPerson ? clientAndNamedPerson(named[0]) : null;
  }

  // Person + company (Jordan Hale hiring Pine Street Media LLC). Do not invent
  // a two-party deal from two random title-case words ("Provide" + "Texas").
  const company = named.find(looksLikeCompanyName);
  if (!company) return null;
  const person = named.find((n) => n !== company);
  if (person) return namedHirerAndCompany(person, company);
  return firstPerson ? clientAndNamedPerson(company) : null;
}

function clientAndNamedPerson(name: string): { name: string; role: string }[] {
  return [
    { name: "Client", role: "client" },
    { name: name.trim().slice(0, MAX_NAME), role: "service_provider" },
  ];
}

/** Money, hire/pay/sold, NDA/deal words, or a named counterparty — not pizza/lol. */
function hasCasualDealShape(t: string): boolean {
  return (
    /\$\s*[\d,]/.test(t) ||
    /\b(?:\d+\s*\/\s*\d+|cash|agreed|hire[ds]?|engage[ds]?|sold|pay(?:ing)?|splitt?ing|starts?|starting)\b/i.test(t) ||
    /\b(?:nda|n\.?d\.?a\.?|agreement|contract|deal|job)\b/i.test(t) ||
    /\b(?:me and|i and|between me and)\s+[A-Z]/i.test(t) ||
    /\b(?:lawn|paint|photo(?:graphy)?)?\s*guy\s+[A-Z]/i.test(t)
  );
}

function cleanScope(raw: string): string {
  return raw.trim().replace(/[.,;:]+$/, "").replace(/\s+/g, " ").trim();
}

/** Scope fragment from a casual two-party dump (paint my office, consulting work). */
export function inferCasualScopeFromDump(raw: string): string {
  const t = (raw || "").replace(/\s+/g, " ").trim();
  const hiredTo = t.match(
    new RegExp(`\\b(?:hired|engaged|contracted|retained|brought in)\\s+${PERSON_NAME_CAPTURE}\\s+to\\s+(.{3,80}?)(?:\\.|$)`),
  );
  if (hiredTo?.[2]) return cleanScope(hiredTo[2]);
  const hireTo = t.match(
    new RegExp(`\\b(?:[Hh]ire|[Ee]ngage)\\s+${PERSON_NAME_CAPTURE}\\s+to\\s+(.{3,80}?)(?:\\.|$)`),
  );
  if (hireTo?.[2]) return cleanScope(hireTo[2]);
  const needDeal = t.match(
    /\b(?:need|want)\s+(?:a|an)\s+(.{3,40}?)\s+(?:deal|agreement|contract|job)\b/i,
  );
  if (needDeal?.[1]) return needDeal[1].trim();
  const willWork = t.match(new RegExp(`\\b(?:will|is going to|are going to|is|are)\\s+(${CASUAL_WORK_STEM}[^.\\n]{0,60})`, "i"));
  if (willWork?.[1]) return cleanScope(willWork[1]);
  const forWork = t.match(/\bfor\s+(?:some\s+)?(.{3,40}?\b(?:work|services?|painting|consulting|design))\b/i);
  if (forWork?.[1]) return forWork[1].trim();
  const someoneTo = t.match(/\b(?:need|want)\s+someone\s+to\s+(.{3,80}?)(?:\.|$)/i);
  if (someoneTo?.[1]) return cleanScope(someoneTo[1]);
  const payTo = t.match(
    new RegExp(`\\bpay(?:ing)?\\s+${PERSON_NAME_CAPTURE}\\b[^.\\n]{0,48}\\bto\\s+(.{3,60}?)(?:\\.|$)`),
  );
  if (payTo?.[2]) return cleanScope(payTo[2]);
  const soldThing = t.match(/\bsold\s+(?:my|our|the)\s+(.{2,40}?)\s+to\s+[A-Z]/i);
  if (soldThing?.[1]) return cleanScope(soldThing[1]);
  const splitThing = t.match(/\bsplitt?(?:ing|s)?\s+(?:the\s+)?(.{3,40}?)(?:\s+\d+\s*\/\s*\d+|[.,;]|$)/i);
  if (splitThing?.[1]) return cleanScope(splitThing[1]);
  const labeledScope = t.match(/\bscope\s*[:\-]\s*(.{3,80}?)(?:\.|$)/i);
  if (labeledScope?.[1]) return cleanScope(labeledScope[1]);
  if (hasCasualDealShape(t)) {
    const keyword = t.match(
      /\b(photograph(?:ing|y)?(?:\s+our\s+wedding)?|wedding|lawn(?:\s+(?:care|guy))?|walk(?:ing)?(?:\s+the)?\s+dog|etsy(?:\s+shop)?|shopify(?:\s+theme)?|app\s+idea|bike|kitchen cabinets|dogsit(?:ting)?)\b/i,
    );
    if (keyword?.[1]) return cleanScope(keyword[1]);
  }
  const bareWork = t.match(/\b((?:fix|repair|paint|design|build|clean|install)(?:ing)?(?:\s+the)?\s+(?:broken\s+)?[a-z][a-z\s]{1,40})\b/i);
  if (bareWork?.[1]) return bareWork[1].trim();
  return "";
}

/**
 * First-person / named-person dumps the between-regex misses:
 * "I hired Mike to paint my office", "need a painting deal with Mike",
 * "Sarah will photograph our wedding", "lawn guy Luis", "pay Riley".
 */
export function inferCasualTwoPartyFromDump(raw: string): { name: string; role: string }[] | null {
  const t = (raw || "").replace(/\s+/g, " ").trim();
  if (t.length < 10) return null;

  const hired = t.match(
    new RegExp(`\\b(?:I|We|I've|We've)\\s+(?:hired|engaged|contracted|retained|brought in)\\s+${PERSON_NAME_CAPTURE}\\b`),
  );
  if (hired?.[1] && looksLikePersonName(hired[1])) return clientAndNamedPerson(hired[1]);

  const withName = t.match(
    new RegExp(`\\b(?:deal|agreement|contract|job)\\s+with\\s+${PERSON_NAME_CAPTURE}\\b`),
  );
  if (withName?.[1] && looksLikePersonName(withName[1])) return clientAndNamedPerson(withName[1]);

  const nameWill = t.match(
    new RegExp(`\\b${PERSON_NAME_CAPTURE}\\s+${CASUAL_WILL_CONNECTOR}\\s+(?:${CASUAL_DO_VERBS})`),
  );
  if (nameWill?.[1] && looksLikePersonName(nameWill[1])) return clientAndNamedPerson(nameWill[1]);

  const neighbor = t.match(
    new RegExp(`\\b(?:my|our)\\s+neighbor\\s+${PERSON_NAME_CAPTURE}\\b`),
  );
  if (neighbor?.[1] && looksLikePersonName(neighbor[1])) return clientAndNamedPerson(neighbor[1]);

  const nameHiringCompany = t.match(
    new RegExp(`\\b${PERSON_NAME_CAPTURE}\\s+(?:is\\s+)?hiring\\s+${COMPANY_CAPTURE}`),
  );
  if (nameHiringCompany?.[1] && nameHiringCompany?.[2] && looksLikePersonName(nameHiringCompany[1])) {
    return namedHirerAndCompany(nameHiringCompany[1], nameHiringCompany[2]);
  }

  const imHiring = t.match(
    new RegExp(`\\bI(?:'m|\\s+am)\\s+hiring\\s+(?:${COMPANY_CAPTURE}|${PERSON_NAME_CAPTURE})`),
  );
  if (imHiring?.[1] && (looksLikeCompanyName(imHiring[1]) || looksLikePersonName(imHiring[1]))) {
    return clientAndNamedPerson(imHiring[1].replace(/\s+/g, " "));
  }

  const meAnd = t.match(
    new RegExp(`\\b(?:(?:me|I)\\s+and|between\\s+me\\s+and)\\s+${PERSON_NAME_CAPTURE}\\b`),
  );
  if (meAnd?.[1] && looksLikePersonName(meAnd[1])) return clientAndNamedPerson(meAnd[1]);

  const ndaAnd = t.match(
    new RegExp(`\\b(?:nda|n\\.?d\\.?a\\.?|non[- ]disclosure)\\b[\\s\\S]{0,48}\\band\\s+${PERSON_NAME_CAPTURE}\\b`, "i"),
  );
  if (ndaAnd?.[1] && looksLikePersonName(ndaAnd[1])) return clientAndNamedPerson(ndaAnd[1]);

  const guy = t.match(
    new RegExp(`\\b(?:(?:lawn|paint|photo(?:graphy)?)\\s+)?guy\\s+${PERSON_NAME_CAPTURE}\\b`),
  );
  if (guy?.[1] && looksLikePersonName(guy[1])) return clientAndNamedPerson(guy[1]);

  const soldTo = t.match(new RegExp(`\\bsold\\b[\\s\\S]{0,48}\\bto\\s+${PERSON_NAME_CAPTURE}\\b`));
  if (soldTo?.[1] && looksLikePersonName(soldTo[1])) return clientAndNamedPerson(soldTo[1]);

  const payName = t.match(new RegExp(`\\bpay(?:ing)?\\s+${PERSON_NAME_CAPTURE}\\b`));
  if (payName?.[1] && looksLikePersonName(payName[1])) return clientAndNamedPerson(payName[1]);

  const hireImperative = t.match(new RegExp(`\\b(?:[Hh]ire|[Ee]ngage)\\s+${PERSON_NAME_CAPTURE}\\b`));
  if (hireImperative?.[1] && looksLikePersonName(hireImperative[1])) return clientAndNamedPerson(hireImperative[1]);

  const iAm = t.match(new RegExp(`\\bI(?:\\s+am|'m)\\s+${PERSON_NAME_CAPTURE}\\b`));
  const hiringEntity = t.match(new RegExp(`\\bhiring\\s+${COMPANY_CAPTURE}`));
  const forEntity = t.match(
    /\bfor\s+([A-Z][A-Za-z0-9&'\-\s]{1,80}?(?:LLC|L\.L\.C\.|Inc\.?|Corp\.?|Corporation|Ltd\.?|Limited|Company|LLP|PLLC))\b/,
  );
  if (iAm?.[1] && looksLikePersonName(iAm[1]) && hiringEntity?.[1]) {
    return namedHirerAndCompany(iAm[1], hiringEntity[1]);
  }
  if (iAm?.[1] && looksLikePersonName(iAm[1]) && forEntity?.[1]) {
    return [
      { name: iAm[1].trim().slice(0, MAX_NAME), role: "party" },
      { name: forEntity[1].trim().replace(/\s+/g, " ").slice(0, MAX_NAME), role: "party" },
    ];
  }
  if (forEntity?.[1] && /\b(?:consulting|services?)\b/i.test(t)) {
    return [
      { name: "Client", role: "client" },
      { name: forEntity[1].trim().replace(/\s+/g, " ").slice(0, MAX_NAME), role: "party" },
    ];
  }

  return inferVisitorPlusNamedTwoParty(t);
}


function looksLikeRoleOrPlaceholderName(name: string): boolean {
  return /^(client|service provider|party [ab])$/i.test((name || "").trim());
}

/** Short / boilerplate purpose that should be upgraded to a one-line sentence. */
export function looksLikePurposeFragment(purpose: string): boolean {
  const t = (purpose || "").replace(/\s+/g, " ").trim();
  if (!t) return true;
  if (t.length <= 48 && !/[.!?]$/.test(t) && !/\bwill\b/i.test(t)) return true;
  if (/^commercial arrangement to be agreed/i.test(t)) return true;
  if (/^scope and deliverables to be agreed/i.test(t)) return true;
  if (/protection of confidential/i.test(t)) return true;
  return false;
}

function coveringPhraseFromScope(scope: string): string {
  const s = scope.replace(/\bmy\b/gi, "the").replace(/\bour\b/gi, "the").trim();
  return s
    .replace(/^fix\b/i, "fixing")
    .replace(/^repair\b/i, "repairing")
    .replace(/^paint\b/i, "painting")
    .replace(/^build\b/i, "building")
    .replace(/^walk\b/i, "walking")
    .replace(/^photograph\b/i, "photographing");
}

/**
 * One short sentence from the dump's own words. Does not add money, law, or term.
 * "paint my office" + Mike → "Mike will paint the office."
 */
export function composeCasualPurposeSentence(
  raw: string,
  providerName?: string | null,
): string {
  const t = (raw || "").replace(/\s+/g, " ").trim();
  if (!t) return "";
  let scope = inferCasualScopeFromDump(t);
  if (!scope) return "";
  scope = scope
    .replace(/\$\s*[\d,]+(?:\.\d+)?(?:\s*k)?\b/gi, " ")
    .replace(/\b\d+(?:\.\d+)?\s*k\b/gi, " ")
    .replace(/\b(?:one|two|three|four|five|\d+)\s+(?:days?|weeks?|months?|years?)\b/gi, " ")
    .replace(/\b(?:on|starting)\s+[A-Za-z]+(?:\s+\d{1,2})?\b/gi, " ")
    .replace(/\blawn\s+guy\b/gi, "lawn")
    .replace(/\s*,\s*/g, " ")
    .replace(/\s+/g, " ")
    .replace(/[.,;:]+$/g, "")
    .trim();
  if (!scope) return "";

  const actor = (providerName || "").trim();
  const actorOk = Boolean(actor) && !looksLikeRoleOrPlaceholderName(actor);

  const verbLead = scope.match(
    /^(paint(?:ing)?|photograph(?:ing)?|photo|build|fix|repair|walk(?:ing)?|mow|design|install|create|shoot|film|split(?:ting)?|shar(?:e|ing)|sell(?:ing)?|buy(?:ing)?|handle|redo)\b([\s\S]*)$/i,
  );
  if (verbLead && actorOk) {
    let rest = `${verbLead[1]}${verbLead[2] || ""}`.trim();
    rest = rest.replace(/\bmy\b/gi, "the").replace(/\bour\b/gi, "the");
    rest = rest
      .replace(/^painting\b/i, "paint")
      .replace(/^photographing\b/i, "photograph")
      .replace(/^walking\b/i, "walk")
      .replace(/^building\b/i, "build")
      .replace(/^fixing\b/i, "fix")
      .replace(/^repairing\b/i, "repair")
      .replace(/^splitting\b/i, "split");
    return `${actor} will ${rest}.`;
  }

  if (/\b(?:nda|non[-\s]?disclosure|confidential)\b/i.test(t)) {
    const about = /^(?:the|an?|this)\b/i.test(scope) ? scope : `the ${scope}`;
    return `This agreement covers confidentiality about ${about}.`;
  }
  if (/\bsold\b|\bsale\b/i.test(t)) {
    return `This agreement covers the sale of the ${scope.replace(/^the\s+/i, "")}.`;
  }
  if (/\b50\s*\/\s*50\b/.test(t) && /\betsy\b/i.test(t)) {
    return `The parties will split the ${scope} 50/50.`;
  }
  if (actorOk && verbLead) {
    return `${actor} will ${scope.replace(/\bmy\b/gi, "the").replace(/\bour\b/gi, "the")}.`;
  }
  if (actorOk && /^(lawn|fence|etsy|shopify|bike|dog)\b/i.test(scope)) {
    return `This agreement covers the ${scope}.`;
  }
  return `This agreement covers ${coveringPhraseFromScope(scope)}.`;
}

/** Merge inferred names only when current parties are clearly generic placeholders. */
export function applyNamedPartyFallbackFromIntake(parsed: ParsedDraftShape, intakeText: string): ParsedDraftShape {
  const parties = parsed.parties || [];
  if (!looksLikeGenericPartyRow(parties)) return parsed;
  const inferred = tryInferNamedPartiesFromIntake(intakeText);
  if (!inferred || inferred.length < 2) return parsed;
  return { ...parsed, parties: inferred };
}
