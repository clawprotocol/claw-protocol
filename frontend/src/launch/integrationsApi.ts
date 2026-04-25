import { apiUrl, errorMessageFromResponse, readJson } from "../lib/clawApi";
import { clawAgreementHeaders } from "../agreement/agreementOrgHeaders";

export type IntegrationWebhookRow = {
  hook_id: string;
  url: string;
  events: string[];
  enabled: boolean;
  created_at?: string;
  secret_preview?: string;
};

export type WebhookDeliveryRow = {
  delivery_id: string;
  hook_id?: string;
  event_id?: string;
  event_type?: string;
  object_type?: string;
  object_id?: string;
  status?: string;
  http_status?: number | null;
  /** Same as `http_status` — normalized name for integrations docs. */
  response_code?: number | null;
  attempts?: number;
  /** Same as `attempts` — server tries in the last delivery run. */
  retry_count?: number;
  last_error?: string | null;
  error_summary?: string | null;
  last_attempt_at?: string | null;
  created_at?: string;
  completed_at?: string | null;
};

function orgBase(orgId: string) {
  return apiUrl(`/v1/orgs/${encodeURIComponent(orgId)}/integrations`);
}

export async function fetchIntegrationWebhooks(orgId: string): Promise<{
  hooks: IntegrationWebhookRow[];
  available_event_types: string[];
}> {
  const res = await fetch(`${orgBase(orgId)}/webhooks`, { headers: clawAgreementHeaders() });
  if (!res.ok) throw new Error(await errorMessageFromResponse(res, "Could not load webhooks."));
  const j = await readJson<{
    hooks: IntegrationWebhookRow[];
    available_event_types: string[];
  }>(res);
  return { hooks: j.hooks ?? [], available_event_types: j.available_event_types ?? [] };
}

export async function registerIntegrationWebhook(
  orgId: string,
  body: { url: string; events: string[] }
): Promise<Record<string, unknown>> {
  const res = await fetch(`${orgBase(orgId)}/webhooks`, {
    method: "POST",
    headers: clawAgreementHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await errorMessageFromResponse(res, "Could not register webhook."));
  return readJson(res);
}

export async function patchIntegrationWebhook(
  orgId: string,
  hookId: string,
  body: { url?: string; events?: string[]; enabled?: boolean }
): Promise<void> {
  const res = await fetch(`${orgBase(orgId)}/webhooks/${encodeURIComponent(hookId)}`, {
    method: "PATCH",
    headers: clawAgreementHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(await errorMessageFromResponse(res, "Could not update webhook."));
}

export async function deleteIntegrationWebhook(orgId: string, hookId: string): Promise<void> {
  const res = await fetch(`${orgBase(orgId)}/webhooks/${encodeURIComponent(hookId)}`, {
    method: "DELETE",
    headers: clawAgreementHeaders(),
  });
  if (!res.ok) throw new Error(await errorMessageFromResponse(res, "Could not delete webhook."));
}

export async function rotateWebhookSecret(
  orgId: string,
  hookId: string
): Promise<{ signing_secret: string }> {
  const res = await fetch(`${orgBase(orgId)}/webhooks/${encodeURIComponent(hookId)}/rotate-secret`, {
    method: "POST",
    headers: clawAgreementHeaders(),
  });
  if (!res.ok) throw new Error(await errorMessageFromResponse(res, "Could not rotate secret."));
  return readJson(res);
}

export async function fetchWebhookDeliveries(orgId: string, limit = 50): Promise<WebhookDeliveryRow[]> {
  const q = new URLSearchParams({ limit: String(limit) });
  const res = await fetch(`${orgBase(orgId)}/webhooks/deliveries?${q}`, {
    headers: clawAgreementHeaders(),
  });
  if (!res.ok) throw new Error(await errorMessageFromResponse(res, "Could not load deliveries."));
  const j = await readJson<{ deliveries: WebhookDeliveryRow[] }>(res);
  return j.deliveries ?? [];
}

export async function retryWebhookDelivery(orgId: string, deliveryId: string): Promise<void> {
  const res = await fetch(
    `${orgBase(orgId)}/webhooks/deliveries/${encodeURIComponent(deliveryId)}/retry`,
    { method: "POST", headers: clawAgreementHeaders() }
  );
  if (!res.ok) throw new Error(await errorMessageFromResponse(res, "Could not queue retry."));
}

export async function auditIntegrationSettingsOpened(orgId: string): Promise<void> {
  const res = await fetch(`${orgBase(orgId)}/audit/integration-settings-opened`, {
    method: "POST",
    headers: clawAgreementHeaders(),
  });
  if (!res.ok) throw new Error(await errorMessageFromResponse(res, "Audit failed."));
}
