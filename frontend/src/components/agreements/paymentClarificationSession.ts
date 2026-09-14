import {
  UNCONFIRMED_INVOICE_CADENCE_QUESTION,
  UNCONFIRMED_PAYMENT_DUE_QUESTION,
  UNCONFIRMED_PAYMENT_TIMING_QUESTION,
  buildMaterialMissingItems,
} from "./proAgreementCompleteness";

const STORAGE_KEY = "claw_payment_clarification_v1";

export type PaymentClarificationRecord = {
  agreementId: string;
  intake: string;
  answers: string;
};

type ApplyHandler = (answer: string) => Promise<void>;

let applyHandler: ApplyHandler | null = null;
const listeners = new Set<() => void>();
let memoryRows: PaymentClarificationRecord[] = [];

function readAll(): PaymentClarificationRecord[] {
  if (typeof sessionStorage === "undefined") return memoryRows;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return memoryRows;
    const parsed = JSON.parse(raw) as PaymentClarificationRecord[];
    return Array.isArray(parsed) ? parsed : memoryRows;
  } catch {
    return memoryRows;
  }
}

function writeAll(rows: PaymentClarificationRecord[]): void {
  memoryRows = rows.slice(-8);
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(memoryRows));
  } catch {
    /* ignore quota */
  }
}

export function clearPaymentClarificationForTests(): void {
  memoryRows = [];
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

function notify(): void {
  for (const listener of listeners) listener();
}

export function subscribePaymentClarification(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function readPaymentClarification(agreementId?: string | null): PaymentClarificationRecord | null {
  const id = (agreementId || "").trim();
  const rows = readAll();
  if (id) return rows.find((row) => row.agreementId === id) ?? rows[rows.length - 1] ?? null;
  return rows[rows.length - 1] ?? null;
}

export function persistPaymentClarification(record: PaymentClarificationRecord): void {
  const id = (record.agreementId || "").trim() || "pending";
  const prior = readPaymentClarification(id) || (id !== "pending" ? readPaymentClarification("pending") : null);
  const next = readAll().filter((row) => row.agreementId !== id && (id === "pending" || row.agreementId !== "pending"));
  next.push({
    agreementId: id,
    intake: record.intake || prior?.intake || "",
    answers: record.answers || prior?.answers || "",
  });
  writeAll(next);
  notify();
}

export function appendPaymentClarificationAnswer(agreementId: string, intake: string, answer: string): string {
  const prev = readPaymentClarification(agreementId);
  const next = [prev?.answers || "", answer.trim()].filter(Boolean).join("\n");
  persistPaymentClarification({ agreementId, intake: intake || prev?.intake || "", answers: next });
  return next;
}

export function paymentClarificationQuestions(args: {
  intake: string;
  answers?: string;
  body: string;
  serverMissing?: readonly string[];
}): string[] {
  const items = buildMaterialMissingItems({
    intakeRaw: args.intake,
    userGapAnswers: args.answers || "",
    body: args.body,
    serverMissing: args.serverMissing,
  });
  return items
    .map((item) => item.question)
    .filter(
      (q) =>
        q === UNCONFIRMED_PAYMENT_TIMING_QUESTION ||
        q === UNCONFIRMED_INVOICE_CADENCE_QUESTION ||
        q === UNCONFIRMED_PAYMENT_DUE_QUESTION,
    );
}

export function registerPaymentClarificationApply(handler: ApplyHandler | null): void {
  applyHandler = handler;
}

export function applyPaymentClarificationAnswer(answer: string): Promise<void> {
  if (!applyHandler) {
    return Promise.reject(new Error("payment_clarification_apply_unavailable"));
  }
  return applyHandler(answer);
}
