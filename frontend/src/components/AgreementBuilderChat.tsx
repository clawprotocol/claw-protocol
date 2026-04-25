import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  PRODUCT_NOT_LAW_FIRM,
  STRUCTURED_DRAFT_ASSIST_SHORT,
} from "../compliance/disclosureCopy";
import { normalizeDraft, validateDraft } from "../utils/agreements/normalizeValidate";

type PartyRow = { party_id: string; name: string; role: string; contact?: string };
type DraftParty = { id: string; name: string; role?: string; contact?: string | null };
type PaymentState = {
  amount: string;
  frequency: string;
  schedule: { text?: string; daysWorked?: string[] } | string;
};
type TermState = { startDate?: string; duration?: string };
type DraftVersion = { version: number; timestamp: string; changes: string };
export type DraftState = {
  id?: string;
  version?: number;
  title?: string | null;
  jurisdiction?: string | null;
  effective_date?: string | null;
  parties?: DraftParty[];
  purpose?: string | null;
  scope?: string | null;
  payment?: PaymentState;
  context_summary?: string | null;
  key_terms?: string | null;
  payment_terms?: string | null;
  term_duration?: string | null;
  termination_terms?: string | null;
  term?: TermState;
  termination?: string | null;
  governingLaw?: string | null;
  version_history?: DraftVersion[];
  metadata?: {
    createdAt: string;
    updatedAt: string;
    status: "draft" | "review" | "ready";
    waivers?: Record<string, boolean>;
  };
  is_template_body?: boolean;
  customBodyEnabled?: boolean;
  context_terms?: string | null;
  body_md?: string | null;
  private_notes?: string | null;
};
type Message = {
  id: string;
  role: "assistant" | "user" | "event";
  text: string;
  createdAt: number;
};

type Props = {
  model: any;
  onDraftStateChange?: (next: DraftState, meta?: { source: "chat" | "parties" | "manual" }) => void;
  getSessionMeta?: () => { session_id: string; agreement_id?: string | null };
  onChatDoneChange?: (done: boolean) => void;
  draftOnly?: boolean;
  focusComposerToken?: number;
};

type PostIntakeKind = "STRUCTURED_EDIT" | "REQUEST_SUGGESTIONS" | "FREEFORM_NOTE" | "UNKNOWN";

const TOTAL_STEPS = 4;
type IntakeKey =
  | "title"
  | "jurisdiction"
  | "party1_name"
  | "party1_contact"
  | "party2_name"
  | "party2_contact"
  | "context_summary"
  | "key_terms"
  | "body_md";

function makePartyId(name: string, index: number) {
  const base = (name || "party")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 24);
  return `party_${base || "party"}_${index + 1}`;
}

function parseContextAndNotes(rawNotes: string): {
  context_summary: string | null;
  key_terms: string | null;
  payment_terms: string | null;
  term_duration: string | null;
  termination_terms: string | null;
  effective_date: string | null;
  is_template_body: boolean | null;
  private_notes: string | null;
} {
  const raw = (rawNotes || "").trim();
  if (!raw) {
    return {
      context_summary: null,
      key_terms: null,
      payment_terms: null,
      term_duration: null,
      termination_terms: null,
      effective_date: null,
      is_template_body: null,
      private_notes: null,
    };
  }
  const contextSummaryMatch = raw.match(/(?:^|\n)Context Summary:\s*([\s\S]*?)(?:\nKey Terms:|\nNotes:|$)/i);
  const keyTermsMatch = raw.match(/(?:^|\n)Key Terms:\s*([\s\S]*?)(?:\nNotes:|$)/i);
  const paymentTermsMatch = raw.match(/(?:^|\n)Payment Terms:\s*([\s\S]*?)(?:\nNotes:|$)/i);
  const termDurationMatch = raw.match(/(?:^|\n)Term Duration:\s*([\s\S]*?)(?:\nTermination Terms:|\nNotes:|$)/i);
  const terminationTermsMatch = raw.match(/(?:^|\n)Termination Terms:\s*([\s\S]*?)(?:\nNotes:|$)/i);
  const effectiveDateMatch = raw.match(/(?:^|\n)Effective Date:\s*([\s\S]*?)(?:\nNotes:|$)/i);
  const templateBodyMatch = raw.match(/(?:^|\n)Template Body:\s*(true|false)(?:\n|$)/i);
  const legacyContextMatch = raw.match(/(?:^|\n)Context:\s*([\s\S]*?)(?:\nNotes:|$)/i);
  const notesMatch = raw.match(/(?:^|\n)Notes:\s*([\s\S]*)$/i);
  return {
    context_summary: contextSummaryMatch?.[1]?.trim() || legacyContextMatch?.[1]?.trim() || null,
    key_terms: keyTermsMatch?.[1]?.trim() || null,
    payment_terms: paymentTermsMatch?.[1]?.trim() || null,
    term_duration: termDurationMatch?.[1]?.trim() || null,
    termination_terms: terminationTermsMatch?.[1]?.trim() || null,
    effective_date: effectiveDateMatch?.[1]?.trim() || null,
    is_template_body:
      templateBodyMatch?.[1]?.toLowerCase() === "true"
        ? true
        : templateBodyMatch?.[1]?.toLowerCase() === "false"
        ? false
        : null,
    private_notes: notesMatch?.[1]?.trim() || (!contextSummaryMatch && !legacyContextMatch ? raw : null),
  };
}

function toDraftFromModel(model: any): DraftState {
  const parsedNotes = parseContextAndNotes(model.agreementVersionNotes || "");
  const base: DraftState = {
    title: (model.agreementTitle || "").trim() || null,
    jurisdiction: (model.agreementJurisdiction || "").trim() || null,
    effective_date: parsedNotes.effective_date || (model.agreementEffectiveDate || "").trim() || null,
    parties: (Array.isArray(model.agreementPartyRows) ? model.agreementPartyRows : [])
      .map((p: PartyRow, idx: number) => ({
        id: p.party_id || makePartyId(p.name || "party", idx),
        name: p.name || "",
        role: p.role || "party",
        contact: p.contact || null,
      }))
      .filter((p: DraftParty) => (p.name || "").trim().length > 0),
    context_summary: parsedNotes.context_summary,
    key_terms: parsedNotes.key_terms,
    payment_terms: parsedNotes.payment_terms,
    term_duration: parsedNotes.term_duration,
    termination_terms: parsedNotes.termination_terms,
    is_template_body: parsedNotes.is_template_body ?? !((model.agreementContent || "").trim()),
    customBodyEnabled: parsedNotes.is_template_body === false,
    context_terms: parsedNotes.context_summary,
    body_md: (model.agreementContent || "").trim() || null,
    private_notes: parsedNotes.private_notes,
  };
  return withCanonicalDefaults(base, "initialized");
}

function withCanonicalDefaults(state: DraftState, change?: string): DraftState {
  const now = new Date().toISOString();
  const version = typeof state.version === "number" ? state.version : 1;
  const payment = state.payment || { amount: "", frequency: "", schedule: { text: "", daysWorked: [] } };
  return {
    ...state,
    id: state.id || `draft_${Date.now().toString(36)}`,
    version,
    purpose: state.purpose ?? state.context_summary ?? null,
    scope: state.scope ?? state.key_terms ?? null,
    payment,
    term: state.term || { startDate: state.effective_date || undefined, duration: state.term_duration || undefined },
    termination: state.termination ?? state.termination_terms ?? null,
    governingLaw: state.governingLaw ?? state.jurisdiction ?? null,
    metadata: state.metadata || { createdAt: now, updatedAt: now, status: "draft" },
    version_history: state.version_history || (change ? [{ version, timestamp: now, changes: change }] : []),
    customBodyEnabled: state.customBodyEnabled === true,
  };
}

function classifyPostIntakeMessage(text: string): PostIntakeKind {
  const t = (text || "").trim().toLowerCase();
  if (!t) return "UNKNOWN";
  if (/(suggestions?|improve|best practice|are there|what should|how should)/i.test(t)) return "REQUEST_SUGGESTIONS";
  if (/\b(add|update|change|remove|set)\b/.test(t) && /(payment|compensation|fee|schedule|days|term|duration|law|jurisdiction|party|contact|title)/i.test(t)) {
    return "STRUCTURED_EDIT";
  }
  if (/(note|remember|for reference|fyi)/i.test(t)) return "FREEFORM_NOTE";
  return "UNKNOWN";
}

function nextMissingKey(state: DraftState): IntakeKey | null {
  if (!(state.title || "").trim()) return "title";
  if (!(state.jurisdiction || "").trim()) return "jurisdiction";
  if (!(state.parties?.[0]?.name || "").trim()) return "party1_name";
  if (!(state.parties?.[0]?.contact || "").trim()) return "party1_contact";
  if (!(state.parties?.[1]?.name || "").trim()) return "party2_name";
  if (!(state.parties?.[1]?.contact || "").trim()) return "party2_contact";
  if (!(state.context_summary || "").trim()) return "context_summary";
  if (!(state.key_terms || "").trim()) return "key_terms";
  if (!(state.body_md || "").trim()) return "body_md";
  return null;
}

function promptForKey(key: IntakeKey | null): string {
  if (key === "title") return "What is the agreement title?";
  if (key === "jurisdiction") return "Which jurisdiction applies? (e.g., TX, CA, NY, UK)";
  if (key === "party1_name") return "Who is Party A? Please provide full name and role.";
  if (key === "party1_contact") return "Please provide Party A contact info (email/phone/address).";
  if (key === "party2_name") return "Who is Party B? Please provide full name and role.";
  if (key === "party2_contact") return "Please provide Party B contact info (email/phone/address).";
  if (key === "context_summary")
    return "In 1-3 sentences: what is this agreement for and what is each party doing?";
  if (key === "key_terms")
    return "List key terms (short phrases OK). If unknown, type TBD: scope/deliverables, payment, term, confidentiality/IP, termination, dispute resolution/adjudication, escrow.";
  if (key === "body_md") return "Paste a full contract to override the draft, or type \"use draft\" to continue.";
  return "Draft intake complete. Open Review to confirm. You may also type edits here.";
}

function stepMetaFromKey(key: IntakeKey | null): { index: number; label: string } {
  if (key === "title" || key === "jurisdiction") return { index: 1, label: "Agreement Basics" };
  if (key === "party1_name" || key === "party1_contact" || key === "party2_name" || key === "party2_contact") {
    return { index: 2, label: "Parties" };
  }
  if (key === "context_summary" || key === "key_terms") return { index: 3, label: "Context & Key Terms" };
  return { index: 4, label: "Draft / Review" };
}

function normalizeTitle(input: string): string {
  const raw = (input || "").trim();
  if (!raw) return "";
  let t = raw;
  t = t.replace(/^(the\s+)?agreement\s+title\s+is\s+/i, "");
  t = t.replace(/^title\s+is\s+/i, "");
  t = t.replace(/^it'?s\s+called\s+/i, "");
  t = t.replace(/^agreement\s+name\s*:\s*/i, "");
  t = t.replace(/^title\s*:\s*/i, "");
  t = t.replace(/^["'`]+|["'`]+$/g, "");
  t = t.replace(/[.?!,:;\s]+$/g, "");
  t = t.replace(/\s+/g, " ").trim();
  return t.length >= 2 ? t : raw;
}

function normalizePartyName(input: string): string {
  const raw = (input || "").trim();
  if (!raw) return "";
  let t = raw;
  t = t.replace(/^(party\s+[ab12]\s*)?(name\s*)?(is|:)\s+/i, "");
  t = t.replace(/^party\s+(is|:)\s+/i, "");
  t = t.replace(/^["'`]+|["'`]+$/g, "");
  t = t.replace(/[.?!,:;\s]+$/g, "");
  t = t.replace(/\s+/g, " ").trim();
  return t.length >= 2 ? t : raw;
}

function parseNameAndContact(text: string): { name?: string; contact?: string } {
  const trimmed = (text || "").trim();
  if (!trimmed) return {};
  const emailMatch = trimmed.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  const phoneMatch = trimmed.match(/(?:\+?\d[\d\s().-]{7,}\d)/);
  const lines = trimmed.split(/\r?\n|,/).map((x) => x.trim()).filter(Boolean);
  const likelyName = lines.find((x) => /^[a-z][a-z' .-]{2,}$/i.test(x) && !/@/.test(x) && !/\d{4,}/.test(x));
  const contact = [emailMatch?.[0], phoneMatch?.[0], lines.slice(1).join(", ") || undefined].filter(Boolean).join(" • ");
  return { name: likelyName || undefined, contact: contact || (emailMatch ? emailMatch[0] : undefined) };
}

function isUnknownValue(text: string): boolean {
  return /^(unknown|n\/a|na|skip|none|don'?t have|no contact)$/i.test((text || "").trim());
}

function shouldLeaveBlank(text: string): boolean {
  return /(please\s+leave\s+blank|leave\s+blank|keep\s+blank|tbd|unknown)/i.test((text || "").trim());
}

function extractPartyPair(text: string): { a?: string; b?: string } {
  const match = (text || "").match(/between\s+(.+?)\s+and\s+(.+?)(?:,|\.|$)/i);
  if (!match) return {};
  return { a: match[1]?.trim(), b: match[2]?.trim() };
}

function isLikelyAddress(text: string): boolean {
  const t = (text || "").trim();
  if (!t) return false;
  const hasStreet = /\b(st|street|ave|avenue|rd|road|blvd|boulevard)\b/i.test(t);
  const hasZip = /\b\d{5}(?:-\d{4})?\b/.test(t);
  const hasCityState = /,\s*[A-Za-z .'-]+,\s*[A-Z]{2}\b/.test(t) || /\b[A-Za-z .'-]+\s+[A-Z]{2}\s+\d{5}\b/.test(t);
  return hasStreet || hasZip || hasCityState;
}

function isLikelyName(text: string): boolean {
  const t = (text || "").trim();
  if (!t) return false;
  if (/\b\d{5}(?:-\d{4})?\b/.test(t)) return false;
  if (/^\d{1,6}\s+\w+/.test(t)) return false;
  if (/\d{4,}/.test(t) && !/\b(?:llc|inc|co|ltd)\s+\d\b/i.test(t)) return false;
  return true;
}

function splitNameAndContact(text: string): { name?: string; contact?: string } {
  const raw = (text || "").trim();
  if (!raw) return {};
  if (isLikelyAddress(raw)) {
    const idx = raw.search(/\b\d{1,6}\s+[A-Za-z]/);
    if (idx > 1) {
      const namePart = raw.slice(0, idx).trim().replace(/[,\-:\s]+$/g, "");
      const contactPart = raw.slice(idx).trim();
      return {
        name: isLikelyName(namePart) ? normalizePartyName(namePart) : undefined,
        contact: contactPart || undefined,
      };
    }
  }
  return parseNameAndContact(raw);
}

function extractTitleFromText(text: string): string | null {
  const raw = (text || "").trim();
  if (!raw) return null;
  const patterns = [
    /^(?:the\s+)?agreement\s+title\s+is\s+(.+)$/i,
    /^(?:the\s+)?title\s+is\s+(.+)$/i,
    /^title\s*:\s*(.+)$/i,
    /^change\s+title\s+to\s+(.+)$/i,
  ];
  for (const p of patterns) {
    const m = raw.match(p);
    if (m?.[1]) return normalizeTitle(m[1]);
  }
  return null;
}

function extractJurisdictionFromText(text: string): string | null {
  const raw = (text || "").trim();
  if (!raw) return null;
  const patterns = [
    /(?:change|set|update)\s+jurisdiction\s+(?:to|as)\s+(.+)$/i,
    /jurisdiction\s+is\s+(.+)$/i,
    /governing\s+law\s+is\s+(.+)$/i,
    /governed\s+by\s+(.+)$/i,
  ];
  for (const p of patterns) {
    const m = raw.match(p);
    if (m?.[1]) return shouldLeaveBlank(m[1]) ? null : inferJurisdictionFromText(m[1]) || m[1].trim();
  }
  return null;
}

function extractPartyFromText(text: string): {
  partyIndex: 0 | 1 | null;
  name?: string;
  role?: string;
  contact?: string | null;
  explicitEdit?: boolean;
} {
  const raw = (text || "").trim();
  if (!raw) return { partyIndex: null };
  let partyIndex: 0 | 1 | null = null;
  if (/party\s*a\b|party\s*1\b/i.test(raw)) partyIndex = 0;
  if (/party\s*b\b|party\s*2\b/i.test(raw)) partyIndex = 1;

  let working = raw
    .replace(/^change\s+/i, "")
    .replace(/^update\s+/i, "")
    .replace(/^set\s+/i, "")
    .replace(/^party\s*[ab12]\s*(?:is|to)?\s*/i, "")
    .replace(/^for\s+party\s*[ab12]\s*/i, "")
    .trim();

  const explicitEdit = /^(?:change|update)\s+party\s*[ab12]\b/i.test(raw);
  const split = splitNameAndContact(raw);
  const contact = split.contact;
  let role = "";
  const roleOnly = raw.match(/party\s*([ab12]).*role\s+(?:is|to)\s+(.+)$/i);
  if (roleOnly?.[2]) {
    const which = roleOnly[1]?.toLowerCase();
    partyIndex = which === "b" || which === "2" ? 1 : 0;
    return { partyIndex, role: roleOnly[2].trim() };
  }
  const roleMatch = working.match(/(?:,\s*role\s+(?:is|to)\s+|\s+and\s+role\s+(?:is|to)\s+|\s+role\s+(?:is|to)\s+)(.+)$/i);
  if (roleMatch?.[1]) {
    role = roleMatch[1].trim();
    working = working.slice(0, roleMatch.index).trim();
  }
  working = working.replace(/^(name\s*[:=]\s*)/i, "").trim();
  const candidate = split.name || working;
  const name = normalizePartyName(candidate);
  const looksLikeParty = Boolean(name) && !/^payment|jurisdiction|title\b/i.test(name);
  if (!looksLikeParty) return { partyIndex };
  return { partyIndex, name, role: role || undefined, contact: contact || undefined, explicitEdit };
}

function extractTermDuration(text: string): string | null {
  const raw = (text || "").trim();
  const m = raw.match(/(?:term|duration)\s+(?:is|to|for)\s+(.+)$/i);
  if (m?.[1]) return m[1].trim();
  return null;
}

function extractTerminationTerms(text: string): string | null {
  const raw = (text || "").trim();
  const m = raw.match(/termination\s+(?:is|terms?\s+(?:are|to)\s*)?(.+)$/i);
  if (m?.[1]) return m[1].trim();
  return null;
}

function extractEffectiveDateFromText(text: string): string | null {
  const raw = (text || "").trim();
  const m = raw.match(/effective\s+date\s+(?:is|to)\s+(.+)$/i);
  if (m?.[1]) return m[1].trim();
  return null;
}

function ensurePartyAtIndex(draft: DraftState, idx: number): DraftState {
  const next: DraftState = { ...draft, parties: [...(draft.parties || [])] };
  while ((next.parties || []).length <= idx) {
    next.parties!.push({ id: makePartyId(`party_${idx + 1}`, idx), name: "", role: "party", contact: null });
  }
  if (!next.parties?.[idx]?.id) {
    const current = next.parties?.[idx];
    if (current) current.id = makePartyId(current.name || `party_${idx + 1}`, idx);
  }
  return next;
}

function applyStructuredEdit(text: string, draft: DraftState, asked: IntakeKey | null = null): {
  updatedDraft: DraftState;
  didMatchStructuredField: boolean;
} {
  let next: DraftState = withCanonicalDefaults({ ...draft, parties: [...(draft.parties || [])] });
  let matched = false;
  const trimmed = (text || "").trim();
  if (!trimmed) return { updatedDraft: next, didMatchStructuredField: false };

  const title = extractTitleFromText(trimmed);
  if (title) {
    next.title = title;
    matched = true;
  }

  const jurisdiction = extractJurisdictionFromText(trimmed) ?? inferJurisdictionFromText(trimmed);
  if (jurisdiction) {
    next.jurisdiction = jurisdiction;
    matched = true;
  }

  const payment = extractPaymentTerms(trimmed);
  if (payment) {
    next.payment_terms = payment;
    const inferredFreq = inferFrequency(payment);
    next.payment = {
      ...(next.payment || { amount: "", frequency: "", schedule: { text: "", daysWorked: [] } }),
      schedule: { text: payment, daysWorked: typeof next.payment?.schedule === "string" ? [] : next.payment?.schedule?.daysWorked || [] },
      amount: payment.match(/\$[\d,]+(?:\.\d{1,2})?/)?.[0] || next.payment?.amount || "",
      frequency:
        inferredFreq ||
        (payment.match(/\b(monthly|weekly|daily|biweekly|quarterly|annually|flat|one-time)\b/i)?.[1] || "").toLowerCase() ||
        next.payment?.frequency ||
        "",
    };
    matched = true;
  }
  const freqOnly = inferFrequency(trimmed);
  if (!matched && freqOnly) {
    next.payment = {
      ...(next.payment || { amount: "", frequency: "", schedule: { text: "", daysWorked: [] } }),
      frequency: freqOnly,
    };
    matched = true;
  }

  const addDay = trimmed.match(/\b(add|include)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i);
  if (addDay && /(day|days|schedule|work)/i.test(trimmed)) {
    const day = addDay[2].toLowerCase();
    const existingSchedule =
      typeof next.payment?.schedule === "string"
        ? next.payment?.schedule
        : next.payment?.schedule?.text || "";
    const existing = (existingSchedule || next.payment_terms || "").trim();
    const schedule = existing ? `${existing}; add ${day}` : `Work schedule includes ${day}`;
    next.payment = {
      ...(next.payment || { amount: "", frequency: "", schedule: { text: "", daysWorked: [] } }),
      schedule: { text: schedule, daysWorked: [...new Set([...(typeof next.payment?.schedule === "string" ? [] : next.payment?.schedule?.daysWorked || []), day])] },
    };
    next.payment_terms = schedule;
    matched = true;
  }

  const termDuration = extractTermDuration(trimmed);
  if (termDuration) {
    next.term_duration = termDuration;
    matched = true;
  }

  const terminationTerms = extractTerminationTerms(trimmed);
  if (terminationTerms) {
    next.termination_terms = terminationTerms;
    matched = true;
  }

  const effectiveDate = extractEffectiveDateFromText(trimmed);
  if (effectiveDate) {
    next.effective_date = effectiveDate;
    next.term = { ...(next.term || {}), startDate: effectiveDate };
    matched = true;
  }

  const party = extractPartyFromText(trimmed);
  if (party.partyIndex !== null && (party.name || party.role || party.contact)) {
    next = ensurePartyAtIndex(next, party.partyIndex);
    if (party.name) {
      const hasName = Boolean((next.parties?.[party.partyIndex]?.name || "").trim());
      if (!hasName || party.explicitEdit) next.parties![party.partyIndex].name = party.name;
    }
    if (party.role) next.parties![party.partyIndex].role = party.role;
    if (party.contact) next.parties![party.partyIndex].contact = party.contact;
    matched = true;
  }

  const contactUpdate = trimmed.match(/party\s*([ab12]).*contact\s+(?:is|to)\s+(.+)$/i);
  if (contactUpdate?.[2]) {
    const which = contactUpdate[1]?.toLowerCase();
    const idx = which === "b" || which === "2" ? 1 : 0;
    next = ensurePartyAtIndex(next, idx);
    next.parties![idx].contact = shouldLeaveBlank(contactUpdate[2]) ? null : contactUpdate[2].trim();
    matched = true;
  }

  if (!matched && shouldLeaveBlank(trimmed)) {
    const missing = asked || nextMissingKey(next);
    if (missing === "jurisdiction") {
      next.jurisdiction = null;
      matched = true;
    } else if (missing === "party1_contact") {
      next = ensurePartyAtIndex(next, 0);
      next.parties![0].contact = null;
      matched = true;
    } else if (missing === "party2_contact") {
      next = ensurePartyAtIndex(next, 1);
      next.parties![1].contact = null;
      matched = true;
    }
  }

  if (matched) {
    const now = new Date().toISOString();
    const nextVersion = (draft.version || 1) + 1;
    next.version = nextVersion;
    next.metadata = {
      ...(next.metadata || { createdAt: now, updatedAt: now, status: "draft" }),
      updatedAt: now,
      status: "draft",
    };
    next.version_history = [
      ...(draft.version_history || []),
      { version: nextVersion, timestamp: now, changes: trimmed.slice(0, 200) },
    ];
    next.governingLaw = next.jurisdiction || next.governingLaw || null;
    next.purpose = next.context_summary || next.purpose || null;
    next.scope = next.key_terms || next.scope || null;
  }

  return { updatedDraft: next, didMatchStructuredField: matched };
}

function patchDraftFromAnswer(state: DraftState, text: string, asked: IntakeKey | null): DraftState {
  const routed = applyStructuredEdit(text, state, asked);
  const next: DraftState = { ...routed.updatedDraft, parties: [...(routed.updatedDraft.parties || [])] };
  const parsed = parseNameAndContact(text);

  const ensureParty = (idx: number) => {
    if (!next.parties) next.parties = [];
    while (next.parties.length <= idx) {
      next.parties.push({ id: makePartyId(`party_${idx + 1}`, idx), name: "", role: "party", contact: null });
    }
    if (!next.parties[idx].id) next.parties[idx].id = makePartyId(next.parties[idx].name || `party_${idx + 1}`, idx);
  };

  if (asked === "title" && !(next.title || "").trim()) next.title = normalizeTitle(text);
  if (asked === "jurisdiction" && !(next.jurisdiction || "").trim()) {
    next.jurisdiction = shouldLeaveBlank(text) ? null : inferJurisdictionFromText(text) || text.trim().toUpperCase();
  }
  if (asked === "party1_name") {
    ensureParty(0);
    const split = splitNameAndContact(text);
    const explicitEdit = /^(?:change|update)\s+party\s*a\b/i.test(text.trim());
    if (!(next.parties![0].name || "").trim() || explicitEdit) {
      const candidate = split.name || parsed.name || text.trim();
      if (isLikelyName(candidate)) next.parties![0].name = normalizePartyName(candidate);
    }
    if (!next.parties![0].contact && split.contact) next.parties![0].contact = split.contact;
  }
  if (asked === "party1_contact") {
    ensureParty(0);
    if (!next.parties![0].name && parsed.name) next.parties![0].name = parsed.name;
    next.parties![0].contact = shouldLeaveBlank(text) ? null : isUnknownValue(text) ? "__unknown__" : parsed.contact || text.trim();
  }
  if (asked === "party2_name") {
    ensureParty(1);
    const split = splitNameAndContact(text);
    const explicitEdit = /^(?:change|update)\s+party\s*b\b/i.test(text.trim());
    if (!(next.parties![1].name || "").trim() || explicitEdit) {
      const candidate = split.name || parsed.name || text.trim();
      if (isLikelyName(candidate)) next.parties![1].name = normalizePartyName(candidate);
    }
    if (!next.parties![1].contact && split.contact) next.parties![1].contact = split.contact;
  }
  if (asked === "party2_contact") {
    ensureParty(1);
    if (!next.parties![1].name && parsed.name) next.parties![1].name = parsed.name;
    next.parties![1].contact = shouldLeaveBlank(text) ? null : isUnknownValue(text) ? "__unknown__" : parsed.contact || text.trim();
  }
  if (asked === "context_summary" && !(next.context_summary || "").trim()) {
    next.context_summary = shouldLeaveBlank(text) ? null : text.trim();
    next.context_terms = next.context_summary;
  }
  if (asked === "key_terms" && !(next.key_terms || "").trim()) {
    next.key_terms = shouldLeaveBlank(text) ? null : text.trim();
  }
  if (asked === "body_md" && !(next.body_md || "").trim()) {
    const val = text.trim();
    if (!routed.didMatchStructuredField && !/^use\s+draft$/i.test(val) && !shouldLeaveBlank(val)) {
      next.body_md = val;
    }
  }
  const parsedPayment = extractPaymentTerms(text);
  if (!(next.payment_terms || "").trim() && parsedPayment) {
    next.payment_terms = parsedPayment;
  }

  const inferredJur = inferJurisdictionFromText(text);
  if (!(next.jurisdiction || "").trim() && inferredJur) next.jurisdiction = inferredJur;
  if (asked === "party1_name" || asked === "party2_name") {
    const pair = extractPartyPair(text);
    if (pair.a && asked === "party1_name") {
      ensureParty(0);
      if (!(next.parties![0].name || "").trim()) next.parties![0].name = pair.a;
    }
    if (pair.b && asked === "party2_name") {
      ensureParty(1);
      if (!(next.parties![1].name || "").trim()) next.parties![1].name = pair.b;
    }
  }
  return next;
}

function inferJurisdictionFromText(text: string): string | null {
  const t = (text || "").toLowerCase();
  const explicit = t.match(/\bin\s+([a-z][a-z ]{2,40})\b/);
  if (explicit && explicit[1]) {
    const v = explicit[1].trim();
    if (v === "texas") return "TX";
    if (v === "california") return "CA";
    if (v === "new york") return "NY";
    if (v === "florida") return "FL";
    if (v === "oklahoma") return "Oklahoma";
  }
  if (/\btexas\b|\btx\b/.test(t)) return "TX";
  if (/\bcalifornia\b|\bca\b/.test(t)) return "CA";
  if (/\bnew york\b|\bny\b/.test(t)) return "NY";
  if (/\bflorida\b|\bfl\b/.test(t)) return "FL";
  if (/\boklahoma\b|\bok\b/.test(t)) return "Oklahoma";
  if (/\buk\b|united kingdom/.test(t)) return "UK";
  return null;
}

function looksLikeFullContractText(text: string): boolean {
  const t = (text || "").trim();
  if (t.length > 900) return true;
  if (/\n/.test(t) && /(^|\n)(#|##|\d+\.\s|SECTION\b)/i.test(t)) return true;
  return false;
}

function extractPaymentTerms(text: string): string | null {
  const source = (text || "").trim();
  if (!source) return null;
  const sentences = source.split(/[.?!]/).map((s) => s.trim()).filter(Boolean);
  for (const sentenceRaw of sentences) {
    if (!/(\$|payment|fee|fees|pay|compensation)/i.test(sentenceRaw)) continue;
    let s = sentenceRaw;
    const q = s.match(/(question:|are there|suggestion|improve|what|how|should we|could we)/i);
    if (q?.index !== undefined) s = s.slice(0, q.index).trim();
    if (!s) continue;
    const amountSwap = s.match(/change\s+\$?([\d,]+(?:\.\d{1,2})?)\s+to\s+\$?([\d,]+(?:\.\d{1,2})?)\s+upfront\s+and\s+\$?([\d,]+(?:\.\d{1,2})?)\s+(?:on|once)\s+completion/i);
    if (amountSwap) return `$${amountSwap[2]} upfront and $${amountSwap[3]} on completion`;
    const split = s.match(/(?:payment|compensation)\s+is\s+\$?([\d,]+(?:\.\d{1,2})?)\s+upfront[, ]+\$?([\d,]+(?:\.\d{1,2})?)\s+(?:on|once)\s+completion/i);
    if (split) return `$${split[1]} upfront and $${split[2]} on completion`;
    const flat = s.match(/(?:payment|compensation)\s+is\s+\$?([\d,]+(?:\.\d{1,2})?)\s+flat/i);
    if (flat) return `$${flat[1]} flat fee`;
    const flat2 = s.match(/flat\s+\$?([\d,]+(?:\.\d{1,2})?)(?:\s|$)/i);
    if (flat2) return `$${flat2[1]} flat fee`;
    const onceDone = s.match(/\$?([\d,]+(?:\.\d{1,2})?)\s+once\s+(?:the\s+)?work\s+is\s+done/i);
    if (onceDone) return `$${onceDone[1]} once the work is done`;
    const generic = s.match(/(?:payment|compensation)\s+(?:is|to|should be)\s+(.+)$/i);
    if (generic?.[1]) return generic[1].trim();
    if (/\$\d/.test(s)) return s.replace(/\s+/g, " ").trim();
  }
  if (/(\$|payment|fee|fees|pay|compensation)/i.test(source)) {
    const cleaned = source.split(/question:|are there|suggestion|improve/i)[0].trim();
    if (cleaned) return cleaned.replace(/\s+/g, " ");
  }
  return null;
}

function inferFrequency(text: string): string {
  const t = (text || "").toLowerCase();
  if (/\b(per|every)\s+week\b/.test(t) || /\bweekly\b/.test(t)) return "weekly";
  if (/\b(per|every)\s+month\b/.test(t) || /\bmonthly\b/.test(t)) return "monthly";
  if (/\b(per|every)\s+day\b/.test(t) || /\bdaily\b/.test(t)) return "daily";
  if (/\b(per|every)\s+year\b/.test(t) || /\bannually\b|\byearly\b/.test(t)) return "annually";
  return "";
}

function buildBodyFromContext(input: {
  title: string;
  jurisdiction: string;
  effectiveDate: string;
  partyA: string;
  partyB: string;
  contextSummary: string;
  keyTerms: string;
  paymentTerms: string;
  termDuration: string;
  terminationTerms: string;
  rawUserText: string;
}): string {
  const context = input.contextSummary || input.rawUserText;
  const keyTerms = input.keyTerms || "TBD";
  const paymentTerms = input.paymentTerms || "TBD";
  return [
    `# ${input.title || "Agreement"}`,
    "",
    "## Purpose",
    context || "The parties enter this agreement for the purposes described below.",
    "",
    "## Key Terms",
    keyTerms,
    "",
    "## Services / Scope",
    "Define deliverables, milestones, and responsibilities of each party.",
    "",
    "## Payment",
    `Fees / Payment: ${paymentTerms}.`,
    "Any invoicing cadence, due dates, and late payment terms are governed by these payment terms.",
    "",
    "## Term",
    input.termDuration || "Define start date, duration, and renewal/extension terms.",
    "",
    "## Confidentiality & IP",
    "Define confidentiality obligations and ownership/license of intellectual property.",
    "",
    "## Termination",
    input.terminationTerms || "Define termination for convenience/cause, notice periods, and post-termination obligations.",
    "",
    "## Governing Law",
    `This Agreement is governed by the laws of ${input.jurisdiction || "TBD"}, without regard to conflict of law principles.`,
    input.effectiveDate ? `Effective Date: ${input.effectiveDate}` : "",
    "",
    "## Signatures",
    `- ${input.partyA || "Party A"}`,
    `- ${input.partyB || "Party B"}`,
  ].join("\n");
}

function buildTemplateBody(state: DraftState, rawUserText = ""): string {
  return buildBodyFromContext({
    title: (state.title || "").trim(),
    jurisdiction: (state.jurisdiction || "").trim(),
    effectiveDate: (state.effective_date || "").trim(),
    partyA: (state.parties?.[0]?.name || "").trim(),
    partyB: (state.parties?.[1]?.name || "").trim(),
    contextSummary: (state.context_summary || state.context_terms || "").trim(),
    keyTerms: (state.key_terms || "").trim(),
    paymentTerms: (state.payment_terms || "").trim(),
    termDuration: (state.term_duration || "").trim(),
    terminationTerms: (state.termination_terms || "").trim(),
    rawUserText,
  });
}

function summarizeStructuredChanges(before: DraftState, after: DraftState): string {
  if ((before.payment_terms || "").trim() !== (after.payment_terms || "").trim() && (after.payment_terms || "").trim()) {
    return `Updated Payment Terms: ${(after.payment_terms || "").trim()}.`;
  }
  if ((before.jurisdiction || "").trim() !== (after.jurisdiction || "").trim() && (after.jurisdiction || "").trim()) {
    return `Updated Jurisdiction: ${(after.jurisdiction || "").trim()}.`;
  }
  if ((before.title || "").trim() !== (after.title || "").trim() && (after.title || "").trim()) {
    return `Updated Title: ${(after.title || "").trim()}.`;
  }
  return "Draft updated. Open Review to confirm changes.";
}

const AgreementBuilderChat: React.FC<Props> = ({
  model,
  onDraftStateChange,
  onChatDoneChange,
  draftOnly = false,
  focusComposerToken,
}) => {
  const [draftState, setDraftState] = useState<DraftState>(() => toDraftFromModel(model));
  const [chatDone, setChatDone] = useState(false);
  const [composer, setComposer] = useState("");
  const [sheet, setSheet] = useState<null | "details" | "parties" | "versions" | "export">(null);
  const [sending, setSending] = useState(false);
  const [listening, setListening] = useState(false);
  const [attemptedFinalize, setAttemptedFinalize] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "asst_0",
      role: "assistant",
      text: promptForKey(nextMissingKey(toDraftFromModel(model))),
      createdAt: Date.now(),
    },
  ]);
  const transcriptRef = useRef<HTMLDivElement | null>(null);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const completionNotifiedRef = useRef(false);
  const lastMissingNoticeRef = useRef("");
  const lastAskedKeyRef = useRef<IntakeKey | null>(nextMissingKey(toDraftFromModel(model)));
  const recognitionRef = useRef<any>(null);
  const [recognitionReady, setRecognitionReady] = useState(false);

  const parties: PartyRow[] = Array.isArray(model.agreementPartyRows) ? model.agreementPartyRows : [];
  const recognitionSupported =
    typeof window !== "undefined" && Boolean((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
  const readyForActions =
    Boolean((model.agreementTitle || "").trim()) &&
    Boolean((model.agreementJurisdiction || "").trim()) &&
    Boolean((model.agreementContent || "").trim());

  const missingKey = useMemo(() => nextMissingKey(draftState), [draftState]);
  const stepMeta = useMemo(() => stepMetaFromKey(missingKey), [missingKey]);
  const normalizedDraft = useMemo(() => normalizeDraft(draftState).draft, [draftState]);
  const draftValidation = useMemo(() => validateDraft(normalizedDraft), [normalizedDraft]);

  const appendMessage = (role: Message["role"], text: string) => {
    setMessages((prev) => [
      ...prev,
      { id: `${role}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, role, text, createdAt: Date.now() },
    ]);
  };

  useEffect(() => {
    if (!transcriptRef.current) return;
    transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
  }, [messages, sheet, sending]);

  useEffect(() => {
    const fromModel = toDraftFromModel(model);
    setDraftState((prev) => {
      const prevJson = JSON.stringify(prev);
      const nextJson = JSON.stringify(fromModel);
      return prevJson === nextJson ? prev : fromModel;
    });
  }, [
    model.agreementTitle,
    model.agreementJurisdiction,
    model.agreementPartyRows,
    model.agreementContent,
    model.agreementVersionNotes,
  ]);

  useEffect(() => {
    return () => {
      try {
        recognitionRef.current?.stop?.();
      } catch {
        // no-op
      }
    };
  }, []);

  useEffect(() => {
    // Keep parent updates in an effect to avoid cross-component setState during render.
    onChatDoneChange?.(chatDone);
  }, [chatDone, onChatDoneChange]);

  useEffect(() => {
    if (!focusComposerToken) return;
    composerRef.current?.focus();
  }, [focusComposerToken]);

  const applyDraftToModel = (state: DraftState) => {
    const normalized = normalizeDraft(state).draft;
    const title = (normalized.title || "").trim();
    const jurisdiction = (normalized.jurisdiction || "").trim();
    const body = normalized.body_md || "";
    const notesPayload = [
      (normalized.context_summary || normalized.context_terms || "").trim()
        ? `Context Summary: ${(normalized.context_summary || normalized.context_terms || "").trim()}`
        : "",
      (normalized.key_terms || "").trim() ? `Key Terms: ${(normalized.key_terms || "").trim()}` : "",
      (normalized.payment_terms || "").trim() ? `Payment Terms: ${(normalized.payment_terms || "").trim()}` : "",
      (normalized.term_duration || "").trim() ? `Term Duration: ${(normalized.term_duration || "").trim()}` : "",
      (normalized.termination_terms || "").trim() ? `Termination Terms: ${(normalized.termination_terms || "").trim()}` : "",
      (normalized.effective_date || "").trim() ? `Effective Date: ${(normalized.effective_date || "").trim()}` : "",
      `Template Body: ${normalized.is_template_body === false ? "false" : "true"}`,
      (normalized.private_notes || "").trim() ? `Notes: ${(normalized.private_notes || "").trim()}` : "",
    ]
      .filter(Boolean)
      .join("\n\n");
    const nextParties = (normalized.parties || [])
      .filter((p) => (p.name || "").trim().length > 0)
      .map((p, idx) => ({
        party_id: p.id || makePartyId(p.name || "party", idx),
        name: (p.name || "").trim(),
        role: (p.role || "party").trim() || "party",
        contact: (p.contact || "").trim(),
      }));

    model.setAgreementTitle(title);
    model.setAgreementJurisdiction(jurisdiction.toUpperCase());
    model.setAgreementPartyRows(nextParties);
    model.setAgreementParties(nextParties.map((p: PartyRow) => p.name).join("; "));
    model.setAgreementContent(body);
    model.setAgreementBodyText(body);
    model.setAgreementVersionNotes(notesPayload);
    if (nextParties.length > 0 && !model.agreementAuthorPartyId) {
      model.setAgreementAuthorPartyId(nextParties[0].party_id);
    }
  };

  const syncPartiesSummary = (next: PartyRow[]) => {
    const names = next.map((p) => (p.name || "").trim()).filter(Boolean);
    model.setAgreementParties(names.join("; "));
    if (!model.agreementAuthorPartyId && next[0]?.party_id) {
      model.setAgreementAuthorPartyId(next[0].party_id);
    }
    const nextDraft: DraftState = {
      ...draftState,
      parties: next
        .filter((p) => (p.name || "").trim())
        .map((p, idx) => ({
          id: p.party_id || makePartyId(p.name, idx),
          name: p.name,
          role: p.role || "party",
          contact: p.contact || null,
        })),
    };
    if (JSON.stringify(draftState) !== JSON.stringify(nextDraft)) {
      setDraftState(nextDraft);
      onDraftStateChange?.(nextDraft, { source: "parties" });
    }
  };

  const removeParty = (index: number) => {
    model.setAgreementPartyRows((prev: PartyRow[]) => {
      const next = [...(Array.isArray(prev) ? prev : [])];
      next.splice(index, 1);
      syncPartiesSummary(next);
      return next;
    });
  };

  const handleSend = async () => {
    const raw = composer;
    const text = raw.trim();
    if (!text || sending) return;
    appendMessage("user", text);
    setComposer("");
    const askedKey = nextMissingKey(draftState);
    lastAskedKeyRef.current = askedKey;
    const preStructured = applyStructuredEdit(text, draftState, askedKey);
    const localPatched = patchDraftFromAnswer(draftState, text, askedKey);

    setSending(true);
    let nextState: DraftState;
    if (chatDone) {
      const kind = classifyPostIntakeMessage(text);
      if (looksLikeFullContractText(text)) {
        nextState = { ...draftState, body_md: text.trim(), is_template_body: false, customBodyEnabled: true };
        appendMessage("assistant", "Draft body updated. Open Review to confirm changes.");
      } else if (kind === "REQUEST_SUGGESTIONS") {
        nextState = { ...draftState, private_notes: [draftState.private_notes || "", `Suggestion request: ${text}`].filter(Boolean).join("\n") };
        appendMessage("assistant", "Suggestion request noted. It is saved as a note and not injected into contract text.");
      } else if ((kind === "STRUCTURED_EDIT" || kind === "UNKNOWN") && preStructured.didMatchStructuredField) {
        nextState = { ...preStructured.updatedDraft };
        if (nextState.is_template_body !== false) {
          nextState.body_md = buildTemplateBody(nextState);
          nextState.is_template_body = true;
        }
        appendMessage("assistant", summarizeStructuredChanges(draftState, nextState));
      } else {
        nextState = { ...draftState };
        nextState = {
          ...nextState,
          private_notes: [nextState.private_notes || "", text].filter(Boolean).join("\n"),
        };
        appendMessage("assistant", "Noted. Open Review to confirm changes.");
      }
    } else {
      nextState = {
        ...localPatched,
        jurisdiction: (localPatched.jurisdiction || "").trim() || inferJurisdictionFromText(text) || null,
      };
      if (askedKey === "body_md" && (localPatched.body_md || "").trim() && !/^use\s+draft$/i.test(text.trim())) {
        nextState.is_template_body = false;
      }
    }

    if (askedKey === "key_terms" && !(nextState.body_md || "").trim() && nextState.is_template_body !== false) {
      nextState = {
        ...nextState,
        body_md: buildTemplateBody(nextState),
        is_template_body: true,
        customBodyEnabled: false,
      };
    }
    if (askedKey === "body_md" && !(localPatched.body_md || "").trim()) {
      const trimmed = text.trim();
      if (/^use\s+draft$/i.test(trimmed)) {
        nextState = {
          ...nextState,
          body_md: buildTemplateBody(nextState, trimmed),
          is_template_body: true,
          customBodyEnabled: false,
        };
      } else if (trimmed && trimmed.length < 260) {
        nextState = {
          ...nextState,
          body_md: buildTemplateBody(nextState, trimmed),
          is_template_body: true,
          customBodyEnabled: false,
        };
      } else if (looksLikeFullContractText(trimmed)) {
        nextState = { ...nextState, body_md: trimmed, is_template_body: false, customBodyEnabled: true };
      }
    }
    if (!chatDone && preStructured.didMatchStructuredField && nextState.is_template_body !== false) {
      nextState = { ...nextState, body_md: buildTemplateBody(nextState), is_template_body: true, customBodyEnabled: false };
    }
    setDraftState(nextState);
    applyDraftToModel(nextState);
    onDraftStateChange?.(nextState, { source: "chat" });
    const validation = validateDraft(normalizeDraft(nextState).draft);
    const done = validation.missingRequired.length === 0;
    setChatDone(done);
    if (done) {
      if (!completionNotifiedRef.current) {
        appendMessage("assistant", "Draft intake complete. Open Review to confirm. You may also type edits here.");
        completionNotifiedRef.current = true;
      }
      lastMissingNoticeRef.current = "";
    } else if (!chatDone) {
      completionNotifiedRef.current = false;
      const nextKey = nextMissingKey(nextState);
      if (nextKey && lastAskedKeyRef.current !== nextKey) {
        appendMessage("assistant", promptForKey(nextKey));
        lastAskedKeyRef.current = nextKey;
      } else if (validation.missingRequired.length > 0) {
        const msg = `Still required: ${validation.missingRequired.join(", ")}.`;
        if (lastMissingNoticeRef.current !== msg) {
          appendMessage("assistant", msg);
          lastMissingNoticeRef.current = msg;
        }
      }
    }
    setSending(false);
  };

  const markFieldWaived = (field: string) => {
    const next: DraftState = {
      ...draftState,
      metadata: {
        ...(draftState.metadata || { createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), status: "draft" }),
        waivers: {
          ...((draftState.metadata as { waivers?: Record<string, boolean> } | undefined)?.waivers || {}),
          [field]: true,
        },
      },
    };
    setDraftState(next);
    applyDraftToModel(next);
    onDraftStateChange?.(next, { source: "manual" });
    const validation = validateDraft(normalizeDraft(next).draft);
    setChatDone(validation.missingRequired.length === 0);
  };

  const startDictation = () => {
    if (listening) return;
    if (!recognitionRef.current) {
      const SpeechCtor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (!SpeechCtor) return;
      const recognition = new SpeechCtor();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = "en-US";
      recognition.onresult = (event: any) => {
        const transcript = event?.results?.[0]?.[0]?.transcript || "";
        if (!transcript) return;
        composerRef.current?.focus();
        setComposer((prev) => `${prev}${prev ? " " : ""}${transcript}`.trim());
      };
      recognition.onerror = () => setListening(false);
      recognition.onend = () => setListening(false);
      recognitionRef.current = recognition;
      setRecognitionReady(true);
    }
    try {
      setListening(true);
      recognitionRef.current.start();
    } catch {
      setListening(false);
    }
  };

  const runSaveVersion = async () => {
    await model.saveAgreementVersion();
    const versionLabel = model.agreementVersions?.[0]?.version
      ? `v${model.agreementVersions[0].version}`
      : "version";
    appendMessage("event", `Saved ${versionLabel} at ${new Date().toLocaleTimeString()}.`);
  };

  const runExport = async () => {
    await model.exportAgreement();
    appendMessage("event", "Export generated. Open Export to download JSON/Markdown.");
  };

  const runCreateDraft = async () => {
    setAttemptedFinalize(true);
    const validation = validateDraft(normalizeDraft(draftState).draft);
    if (validation.missingRequired.length > 0) {
      appendMessage("assistant", `Cannot finalize yet. Missing: ${validation.missingRequired.join(", ")}.`);
      return;
    }
    applyDraftToModel(draftState);
    await model.createAgreement();
    appendMessage("event", "Draft created.");
  };

  const bubbleClass = (role: Message["role"]) => {
    if (role === "assistant") {
      return "mr-auto max-w-[90%] rounded-2xl rounded-tl-md border border-slate-700 bg-slate-900/80 px-3 py-2 text-sm text-slate-100";
    }
    if (role === "user") {
      return "ml-auto max-w-[90%] rounded-2xl rounded-tr-md border border-emerald-700/60 bg-emerald-900/20 px-3 py-2 text-sm text-emerald-100";
    }
    return "mx-auto w-full rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200";
  };

  return (
    <section className="relative w-full overflow-x-hidden rounded-xl border border-slate-800 bg-slate-950/40">
      <div className="flex items-center justify-between gap-2 border-b border-slate-800 px-3 py-3 sm:px-4">
        <div>
          <h2 className="text-base font-semibold text-slate-100 sm:text-lg">Agreement Builder Chat</h2>
          <div className="text-xs text-slate-400">Step {stepMeta.index} of {TOTAL_STEPS} - {stepMeta.label}</div>
        </div>
        {!draftOnly && (
          <div className="flex items-center gap-2">
            <button className="btn text-xs" onClick={() => setSheet("details")}>Details</button>
            <button className="btn text-xs" onClick={() => setSheet("parties")}>Parties</button>
            <button className="btn text-xs" onClick={() => setSheet("versions")}>Versions</button>
            <button className="btn text-xs" onClick={() => setSheet("export")}>Export</button>
          </div>
        )}
      </div>

      <div className={`grid grid-cols-1 gap-0 ${draftOnly ? "" : "lg:grid-cols-[minmax(0,1fr)_300px]"}`}>
        <div ref={transcriptRef} className="max-h-[calc(100vh-250px)] min-h-[420px] overflow-y-auto px-3 pb-40 pt-3 sm:px-4">
          <div className="mb-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
            <span>
              Draft ready for review. {STRUCTURED_DRAFT_ASSIST_SHORT}
            </span>
            <details className="mt-1.5 rounded border border-amber-600/30 bg-amber-950/20 px-2 py-1 [&_summary::-webkit-details-marker]:hidden">
              <summary className="cursor-pointer list-none text-[11px] font-medium text-amber-100/80 marker:hidden hover:text-amber-50">
                Learn more
              </summary>
              <p className="mt-1.5 text-[11px] leading-relaxed text-amber-100/70">{PRODUCT_NOT_LAW_FIRM}</p>
            </details>
          </div>
          <div className="mb-3 rounded-lg border border-slate-700 bg-slate-900/60 px-3 py-2 text-xs text-slate-300">
            <span className="mr-3"><span className="text-slate-500">Title:</span> {(draftState.title || "").trim() || "Not set"}</span>
            <span className="mr-3"><span className="text-slate-500">Jurisdiction:</span> {(draftState.jurisdiction || "").trim() || "Not set"}</span>
            <span><span className="text-slate-500">Parties:</span> {(draftState.parties || []).filter((p) => (p.name || "").trim()).length}</span>
          </div>
          <div className="space-y-3">
            {messages.map((m) => (
              <div key={m.id} className={bubbleClass(m.role)}>
                {m.text}
              </div>
            ))}
          </div>
          {model.agreementError && (
            <div className="mt-3 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
              {model.agreementError}
            </div>
          )}
          {model.agreementStatus && (
            <div className="mt-3 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200">
              {model.agreementStatus}
            </div>
          )}
        </div>

        {!draftOnly && (
          <aside className="hidden border-l border-slate-800 bg-slate-900/40 p-3 lg:block">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">Details</div>
            <div className="mt-2 space-y-2 text-xs text-slate-300">
              <div><span className="text-slate-500">Title:</span> {draftState.title || "Not set"}</div>
              <div><span className="text-slate-500">Jurisdiction:</span> {draftState.jurisdiction || "Not set"}</div>
              <div><span className="text-slate-500">Parties:</span> {(draftState.parties || []).length}</div>
              <div><span className="text-slate-500">Body:</span> {(draftState.body_md || "").trim() ? "Added" : "Not set"}</div>
            </div>
            <div className="mt-3 flex flex-col gap-2">
              <button className="btn text-xs" onClick={() => setSheet("versions")}>Open Versions</button>
              <button className="btn text-xs" onClick={() => setSheet("export")}>Open Export</button>
            </div>
          </aside>
        )}
      </div>

      <div className="sticky bottom-0 z-20 border-t border-slate-800 bg-slate-950/95 px-3 py-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] sm:px-4">
        <div className="flex items-end gap-2">
          <textarea
            ref={composerRef}
            className="min-h-[46px] w-full resize-none rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500"
            rows={(draftState.body_md || "").trim() ? 2 : 5}
            placeholder={!(draftState.body_md || "").trim() ? "Paste or draft here..." : "Type your response..."}
            value={composer}
            onChange={(e) => setComposer(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
          />
          {recognitionSupported && (
            <button
              type="button"
              className="btn h-[46px] px-3 text-xs disabled:cursor-not-allowed disabled:opacity-50"
              onClick={startDictation}
              disabled={listening}
            >
              {listening ? "Listening..." : "Mic"}
            </button>
          )}
          {!recognitionSupported && (
            <button
              type="button"
              className="btn h-[46px] px-3 text-xs disabled:cursor-not-allowed disabled:opacity-50"
              disabled
              title="Dictation not supported in this browser."
            >
              Mic
            </button>
          )}
          <button
            className="btn h-[46px] px-4 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={handleSend}
            disabled={!composer.trim() || sending}
          >
            {sending ? "..." : "Send"}
          </button>
        </div>
        <div className="mt-1 text-[11px] text-slate-500">
          Mic fills text only. Press Send to submit.
          {recognitionSupported && !recognitionReady ? " Click Mic to initialize dictation." : ""}
        </div>
        {attemptedFinalize && !chatDone && draftValidation.missingRequired.length > 0 && (
          <div className="mt-2 rounded border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-200">
            <div className="mb-1 font-semibold">Required before Done:</div>
            <div className="flex flex-wrap gap-2">
              {draftValidation.missingRequired.map((field) => (
                <button key={field} className="btn text-[11px]" onClick={() => markFieldWaived(field)}>
                  Mark as TBD (explicit waiver): {field}
                </button>
              ))}
            </div>
          </div>
        )}
        {chatDone && !draftOnly && (
          <div className="mt-2 flex flex-wrap gap-2">
            <button className="btn text-xs" onClick={runCreateDraft}>
              Create Draft
            </button>
            <button className="btn text-xs" onClick={runExport}>
              Export JSON/MD
            </button>
          </div>
        )}
      </div>

      {sheet && (
        <div className="fixed inset-0 z-[220] bg-black/60" onClick={() => setSheet(null)}>
          <div
            className="fixed bottom-0 left-0 right-0 max-h-[82vh] overflow-y-auto rounded-t-xl border border-slate-700 bg-slate-900 p-3 sm:inset-8 sm:mx-auto sm:max-w-3xl sm:rounded-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="text-sm font-semibold text-slate-100">
                {sheet === "details" && "Details"}
                {sheet === "parties" && "Parties"}
                {sheet === "versions" && "Versions"}
                {sheet === "export" && "Export"}
              </div>
              <button className="btn text-xs" onClick={() => setSheet(null)}>Close</button>
            </div>

            {sheet === "details" && (
              <div className="space-y-3 text-sm">
                <div className="rounded border border-slate-700 bg-slate-950/50 p-3 text-xs text-slate-300">
                  <div><span className="text-slate-500">Agreement ID:</span> {model.agreementId || "Not set"}</div>
                  <div><span className="text-slate-500">Title:</span> {draftState.title || "Not set"}</div>
                  <div><span className="text-slate-500">Jurisdiction:</span> {draftState.jurisdiction || "Not set"}</div>
                  <div><span className="text-slate-500">Effective date:</span> {model.agreementEffectiveDate || "Not set"}</div>
                  <div><span className="text-slate-500">Context:</span> {draftState.context_summary || "Not set"}</div>
                  <div><span className="text-slate-500">Key terms:</span> {draftState.key_terms || "Not set"}</div>
                  <div><span className="text-slate-500">Notes:</span> {draftState.private_notes || "None"}</div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button className="btn text-xs" onClick={() => setSheet(null)}>Continue in chat</button>
                  <button className="btn text-xs" onClick={() => setSheet("parties")}>Edit parties</button>
                </div>
              </div>
            )}

            {sheet === "parties" && (
              <div className="space-y-2">
                {parties.length === 0 && (
                  <div className="text-xs text-slate-400">No parties yet. Continue chat to add parties.</div>
                )}
                {parties.map((p, idx) => (
                  <div key={`${p.party_id}_${idx}`} className="rounded border border-slate-700 bg-slate-950/40 p-2">
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                      <input
                        className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-sm"
                        value={p.name}
                        onChange={(e) => {
                          const value = e.target.value;
                          model.setAgreementPartyRows((prev: PartyRow[]) => {
                            const next = [...prev];
                            next[idx] = { ...next[idx], name: value };
                            syncPartiesSummary(next);
                            return next;
                          });
                        }}
                      />
                      <button className="btn text-xs" onClick={() => removeParty(idx)}>Remove</button>
                    </div>
                    <div className="mt-1 text-[11px] text-slate-500">{p.party_id}</div>
                  </div>
                ))}
                <button
                  className="btn text-xs w-full"
                  onClick={() => {
                    model.setAgreementPartyRows((prev: PartyRow[]) => {
                      const next = [...(Array.isArray(prev) ? prev : []), { party_id: "", name: "", role: "party", contact: "" }];
                      syncPartiesSummary(next);
                      return next;
                    });
                  }}
                >
                  + Add party row
                </button>
              </div>
            )}

            {sheet === "versions" && (
              <div className="space-y-3 text-sm">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <button className="btn text-xs" disabled={!readyForActions} onClick={runSaveVersion}>
                    Save Version
                  </button>
                  <button className="btn text-xs" onClick={model.loadAgreementVersions}>
                    Refresh Versions
                  </button>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <select
                    className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs"
                    value={model.fromVersion}
                    onChange={(e) => model.setFromVersion(e.target.value)}
                  >
                    <option value="">from_version</option>
                    {(model.agreementVersions || []).map((v: any) => (
                      <option key={`from_${v.version}`} value={v.version}>v{v.version}</option>
                    ))}
                  </select>
                  <select
                    className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs"
                    value={model.toVersion}
                    onChange={(e) => model.setToVersion(e.target.value)}
                  >
                    <option value="">to_version</option>
                    {(model.agreementVersions || []).map((v: any) => (
                      <option key={`to_${v.version}`} value={v.version}>v{v.version}</option>
                    ))}
                  </select>
                </div>
                <button className="btn text-xs w-full" onClick={model.generateAgreementDiff}>
                  Generate Redline
                </button>
                <input
                  className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs"
                  value={model.redlineText}
                  onChange={(e) => model.setRedlineText(e.target.value)}
                  placeholder="change_text"
                />
                <button className="btn text-xs w-full" onClick={model.addAgreementRedline}>
                  Add Redline
                </button>
                {model.diffSha256 && (
                  <div className="text-xs text-slate-400">diff_sha256: {model.diffSha256}</div>
                )}
                {model.diffText && (
                  <pre className="max-h-48 overflow-auto rounded border border-slate-700 bg-slate-950/60 p-2 text-xs text-slate-300">
                    {model.diffText}
                  </pre>
                )}
              </div>
            )}

            {sheet === "export" && (
              <div className="space-y-3 text-sm">
                <div className="space-y-2 rounded border border-slate-700 bg-slate-950/40 p-3 text-xs">
                  <label className="flex items-center gap-2 text-slate-300">
                    <input type="checkbox" checked={model.attachAgreement} onChange={(e) => model.setAttachAgreement(e.target.checked)} />
                    Attach to bundle (optional)
                  </label>
                  <label className="flex items-center gap-2 text-slate-300">
                    <input
                      type="checkbox"
                      checked={model.includeAgreementVersion}
                      onChange={(e) => model.setIncludeAgreementVersion(e.target.checked)}
                    />
                    Include saved version files in bundle
                  </label>
                  {model.includeAgreementVersion && (
                    <select
                      className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 text-xs"
                      value={model.agreementVersionToExport}
                      onChange={(e) => model.setAgreementVersionToExport(e.target.value)}
                    >
                      <option value="">Select version</option>
                      {(model.agreementVersions || []).map((v: any) => (
                        <option key={v.version} value={v.version}>v{v.version}</option>
                      ))}
                    </select>
                  )}
                </div>
                <button className="btn text-xs w-full" disabled={!readyForActions} onClick={runExport}>
                  Generate Export
                </button>
                {model.agreementExport?.json_url && model.agreementExport?.md_url && (
                  <div className="flex flex-wrap items-center gap-3 text-xs text-emerald-300">
                    <a className="underline" href={model.agreementExport.json_url} download={model.agreementExport.filename_json || "agreement.json"}>
                      Download JSON
                    </a>
                    <a className="underline" href={model.agreementExport.md_url} download={model.agreementExport.filename_md || "agreement.md"}>
                      Download Markdown
                    </a>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
};

export default AgreementBuilderChat;
