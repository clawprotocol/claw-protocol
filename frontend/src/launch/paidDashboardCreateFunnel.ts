/**
 * Dashboard paid-create phase funnel — logs screen transitions for entitled /app/create path.
 * Diagnostics only (ADR-018); does not mutate corpus or routing state.
 */

import { CreateUiStage } from "../components/agreements/createUiStage";
import {
  resolveDashboardPaidCreateScreen,
  type DashboardPaidCreateScreen,
  type ResolveDashboardPaidCreateScreenInput,
} from "../components/agreements/dashboardPaidCreateRoute";
import {
  appendPaidFunnelEvent,
  type PaidFunnelStoredRow,
} from "../lib/experimentation/paidFunnelLocalStorage";
import { logProductEvent } from "../lib/experimentation/productEvents";
import { getOrCreateLawdogSessionId } from "../tracking/lawdogSession";
import { readSigningPacketStatus } from "../vs01/vs01SigningPacketStatusStore";

export const DASHBOARD_PAID_CREATE_SCREEN_PRODUCT_EVENT = "dashboard_paid_create_screen" as const;

export const DASHBOARD_PAID_CREATE_SCREEN_FUNNEL_EVENT = "dashboard_paid_create_screen" as const;

/** In-memory bridge from dashboard navigation → create intake (diagnostics only; not persisted). */
let lastLoggedDashboardPaidCreateScreen: DashboardPaidCreateScreen | null = null;

export function peekLastLoggedDashboardPaidCreateScreen(): DashboardPaidCreateScreen | null {
  return lastLoggedDashboardPaidCreateScreen;
}

export function clearLastLoggedDashboardPaidCreateScreenForTests(): void {
  lastLoggedDashboardPaidCreateScreen = null;
}

/**
 * Late DPC screens on /app/create:
 * - signature_links: VS01 packet prepared (signer keys present) while still on RECIPIENTS.
 * - completed_proof: packet fully signed while DPC marker active (rare on create route).
 */
export function resolveDashboardPaidCreateTelemetryLateScreens(input: {
  createUiStage: (typeof CreateUiStage)[keyof typeof CreateUiStage];
  agreementId?: string | null;
}): { signatureLinksSent: boolean; completedProof: boolean } {
  const agreementId = input.agreementId?.trim() ?? "";
  const onRecipients = input.createUiStage === CreateUiStage.RECIPIENTS;
  const packet = agreementId ? readSigningPacketStatus(agreementId) : null;
  const signatureLinksSent =
    onRecipients && Boolean(packet && Object.keys(packet.bySignerKey).length > 0);
  const completedProof = Boolean(packet?.fullySigned);
  return { signatureLinksSent, completedProof };
}

export type LogDashboardPaidCreateScreenTransitionArgs = {
  screen: DashboardPaidCreateScreen;
  previousScreen?: DashboardPaidCreateScreen | null;
  agreementId?: string | null;
  source?: string;
  sessionId?: string;
};

export function resolveDashboardPaidCreateScreenForTelemetry(
  input: ResolveDashboardPaidCreateScreenInput,
): DashboardPaidCreateScreen {
  return resolveDashboardPaidCreateScreen(input);
}

export function logDashboardPaidCreateScreenTransition(
  args: LogDashboardPaidCreateScreenTransitionArgs,
): void {
  const sessionId = (args.sessionId ?? getOrCreateLawdogSessionId()).trim() || "unknown";
  const payload: Record<string, unknown> = {
    screen: args.screen,
    previous_screen: args.previousScreen ?? null,
    source: args.source ?? "dashboard_paid_create",
    ...(args.agreementId?.trim() ? { agreement_id: args.agreementId.trim() } : {}),
  };

  logProductEvent(DASHBOARD_PAID_CREATE_SCREEN_PRODUCT_EVENT, payload);

  if (typeof window === "undefined") return;

  const row: PaidFunnelStoredRow = {
    name: DASHBOARD_PAID_CREATE_SCREEN_FUNNEL_EVENT,
    ts: Date.now(),
    session_id: sessionId,
    ...(args.agreementId?.trim() ? { agreement_intent_id: args.agreementId.trim() } : {}),
    render_source: args.screen,
  };
  try {
    appendPaidFunnelEvent(row);
  } catch {
    /* ignore quota */
  }

  lastLoggedDashboardPaidCreateScreen = args.screen;

  if (typeof import.meta !== "undefined" && import.meta.env?.DEV) {
    // eslint-disable-next-line no-console
    console.info("[dashboard-paid-create-screen]", payload);
  }
}
