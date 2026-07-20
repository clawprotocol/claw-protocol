/**
 * Phase 3C2C: cookie-authenticated recipient signing mutations.
 */

export type RecipientSessionReadiness = {
  ok: boolean;
  readiness: "ready_for_signing" | "signer_complete";
  signer_complete: boolean;
  finish_ready: boolean;
  required_field_count: number;
  completed_field_count: number;
  missing_field_ids: string[];
};

export type RecipientSessionFieldMutationResult =
  | {
      ok: true;
      field_id: string;
      idempotent: boolean;
      field_values: Record<string, string>;
      field_revisions: Record<string, number>;
      readiness: RecipientSessionReadiness["readiness"];
      signer_complete: boolean;
      finish_ready: boolean;
      required_field_count: number;
      completed_field_count: number;
      missing_field_ids: string[];
    }
  | {
      ok: false;
      code: string;
      message: string;
      kind: "authority" | "validation" | "conflict" | "network";
    };

export type RecipientSessionCompleteResult =
  | {
      ok: true;
      signer_complete: boolean;
      idempotent: boolean;
      globally_executed: boolean;
      readiness: RecipientSessionReadiness["readiness"];
      finish_ready: boolean;
      required_field_count: number;
      completed_field_count: number;
      missing_field_ids: string[];
    }
  | { ok: false; code: string; message: string; kind: "authority" | "validation" | "network" };

const GENERIC_AUTHORITY_MESSAGE =
  "This signing link is invalid, expired, or no longer available.";

const GENERIC_VALIDATION_MESSAGE =
  "This field could not be saved. Check your entry and try again.";

const NETWORK_FAILURE_MESSAGE =
  "We could not save your signing progress right now. Check your connection and try again.";

const completeInFlight = new Map<string, Promise<RecipientSessionCompleteResult>>();

export function createRecipientFieldMutationId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `mut_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function parseJson(res: Response): Promise<Record<string, unknown>> {
  try {
    return (await res.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function parseReadiness(body: Record<string, unknown>): RecipientSessionReadiness | null {
  if (body.ok !== true) return null;
  const readiness = body.readiness;
  if (readiness !== "ready_for_signing" && readiness !== "signer_complete") return null;
  if (typeof body.signer_complete !== "boolean" || typeof body.finish_ready !== "boolean") return null;
  if (!Array.isArray(body.missing_field_ids)) return null;
  return {
    ok: true,
    readiness,
    signer_complete: body.signer_complete,
    finish_ready: body.finish_ready,
    required_field_count: Number(body.required_field_count ?? 0),
    completed_field_count: Number(body.completed_field_count ?? 0),
    missing_field_ids: body.missing_field_ids.map((id) => String(id)),
  };
}

export async function fetchRecipientSessionReadiness(): Promise<
  RecipientSessionReadiness | { ok: false; code: string; message: string }
> {
  let res: Response;
  try {
    res = await fetch("/api/recipient/session/readiness", {
      method: "GET",
      credentials: "include",
      cache: "no-store",
    });
  } catch {
    return { ok: false, code: "network_error", message: NETWORK_FAILURE_MESSAGE };
  }
  const body = await parseJson(res);
  if (!res.ok) {
    const detail = isRecord(body.detail) ? body.detail : body;
    return {
      ok: false,
      code: String(detail.code ?? "bootstrap_invalid_or_expired"),
      message: String(detail.message ?? GENERIC_AUTHORITY_MESSAGE),
    };
  }
  const readiness = parseReadiness(body);
  if (!readiness) {
    return { ok: false, code: "readiness_parse_failed", message: GENERIC_AUTHORITY_MESSAGE };
  }
  return readiness;
}

export async function mutateRecipientSessionFieldOnce(
  fieldId: string,
  value: string,
  expectedRevision: number,
  mutationId: string,
): Promise<RecipientSessionFieldMutationResult> {
  let res: Response;
  try {
    res = await fetch("/api/recipient/session/fields", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        field_id: fieldId.trim(),
        value,
        expected_revision: expectedRevision,
        mutation_id: mutationId,
      }),
    });
  } catch {
    return { ok: false, code: "network_error", message: NETWORK_FAILURE_MESSAGE, kind: "network" };
  }
  const body = await parseJson(res);
  if (!res.ok) {
    const detail = isRecord(body.detail) ? body.detail : body;
    const code = String(detail.code ?? "bootstrap_invalid_or_expired");
    if (res.status === 409) {
      return {
        ok: false,
        code,
        message: String(detail.message ?? GENERIC_VALIDATION_MESSAGE),
        kind: "conflict",
      };
    }
    if (res.status === 400) {
      return {
        ok: false,
        code,
        message: String(detail.message ?? GENERIC_VALIDATION_MESSAGE),
        kind: "validation",
      };
    }
    return {
      ok: false,
      code,
      message: String(detail.message ?? GENERIC_AUTHORITY_MESSAGE),
      kind: "authority",
    };
  }
  if (body.ok !== true || typeof body.field_id !== "string") {
    return {
      ok: false,
      code: "field_mutation_parse_failed",
      message: GENERIC_AUTHORITY_MESSAGE,
      kind: "authority",
    };
  }
  const readiness = parseReadiness(body);
  if (!readiness) {
    return {
      ok: false,
      code: "field_mutation_parse_failed",
      message: GENERIC_AUTHORITY_MESSAGE,
      kind: "authority",
    };
  }
  const fieldValues = isRecord(body.field_values)
    ? Object.fromEntries(
        Object.entries(body.field_values).map(([key, val]) => [key, String(val ?? "")]),
      )
    : {};
  const fieldRevisions = isRecord(body.field_revisions)
    ? Object.fromEntries(
        Object.entries(body.field_revisions).map(([key, val]) => [key, Number(val ?? 0)]),
      )
    : {};
  return {
    ok: true,
    field_id: body.field_id,
    idempotent: Boolean(body.idempotent),
    field_values: fieldValues,
    field_revisions: fieldRevisions,
    readiness: readiness.readiness,
    signer_complete: readiness.signer_complete,
    finish_ready: readiness.finish_ready,
    required_field_count: readiness.required_field_count,
    completed_field_count: readiness.completed_field_count,
    missing_field_ids: readiness.missing_field_ids,
  };
}

export function mutateRecipientSessionField(
  fieldId: string,
  value: string,
  expectedRevision: number,
  mutationId: string,
): Promise<RecipientSessionFieldMutationResult> {
  return mutateRecipientSessionFieldOnce(fieldId, value, expectedRevision, mutationId);
}

async function completeRecipientSessionSignerOnce(): Promise<RecipientSessionCompleteResult> {
  let res: Response;
  try {
    res = await fetch("/api/recipient/session/complete", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
  } catch {
    return { ok: false, code: "network_error", message: NETWORK_FAILURE_MESSAGE, kind: "network" };
  }
  const body = await parseJson(res);
  if (!res.ok) {
    const detail = isRecord(body.detail) ? body.detail : body;
    const code = String(detail.code ?? "bootstrap_invalid_or_expired");
    if (res.status === 400) {
      return {
        ok: false,
        code,
        message: String(detail.message ?? GENERIC_VALIDATION_MESSAGE),
        kind: "validation",
      };
    }
    return {
      ok: false,
      code,
      message: String(detail.message ?? GENERIC_AUTHORITY_MESSAGE),
      kind: "authority",
    };
  }
  if (body.ok !== true || typeof body.signer_complete !== "boolean") {
    return {
      ok: false,
      code: "complete_parse_failed",
      message: GENERIC_AUTHORITY_MESSAGE,
      kind: "authority",
    };
  }
  if (body.globally_executed === true && body.signer_complete !== true) {
    return {
      ok: false,
      code: "global_execution_invalid",
      message: GENERIC_AUTHORITY_MESSAGE,
      kind: "authority",
    };
  }
  const readiness = parseReadiness(body);
  if (!readiness) {
    return {
      ok: false,
      code: "complete_parse_failed",
      message: GENERIC_AUTHORITY_MESSAGE,
      kind: "authority",
    };
  }
  return {
    ok: true,
    signer_complete: body.signer_complete,
    idempotent: Boolean(body.idempotent),
    globally_executed: Boolean(body.globally_executed),
    readiness: readiness.readiness,
    finish_ready: readiness.finish_ready,
    required_field_count: readiness.required_field_count,
    completed_field_count: readiness.completed_field_count,
    missing_field_ids: readiness.missing_field_ids,
  };
}

export function completeRecipientSessionSigner(): Promise<RecipientSessionCompleteResult> {
  const key = "complete";
  const inflight = completeInFlight.get(key);
  if (inflight) return inflight;
  const promise = completeRecipientSessionSignerOnce().finally(() => {
    completeInFlight.delete(key);
  });
  completeInFlight.set(key, promise);
  return promise;
}

/** Test-only: reset completion dedupe between cases. */
export function resetRecipientSessionSigningInFlightForTests(): void {
  completeInFlight.clear();
}
