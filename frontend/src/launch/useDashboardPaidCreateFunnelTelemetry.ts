import { useEffect, useMemo, useRef } from "react";
import type { CreateFlowProductionPhase } from "../components/agreements/createFlowTypes";
import { CreateUiStage } from "../components/agreements/createUiStage";
import type { ParsedDraftShape } from "../components/agreements/intakeSmartDefaults";
import {
  logDashboardPaidCreateScreenTransition,
  peekLastLoggedDashboardPaidCreateScreen,
  resolveDashboardPaidCreateScreenForTelemetry,
  resolveDashboardPaidCreateTelemetryLateScreens,
} from "./paidDashboardCreateFunnel";

export type UseDashboardPaidCreateFunnelTelemetryArgs = {
  enabled: boolean;
  /** True only on /app dashboard before create navigation; false on /app/create intake. */
  onDashboard?: boolean;
  createUiStage: (typeof CreateUiStage)[keyof typeof CreateUiStage];
  displayPhase: string;
  createFlowPhase?: CreateFlowProductionPhase;
  premiumPostCheckoutPhase?: string | null;
  proFullDraftQualityRetry?: boolean;
  premiumSendPathUnlocked?: boolean;
  intakeText?: string;
  draft?: ParsedDraftShape | null;
  agreementId?: string | null;
};

/** Logs dashboard_paid_create screen transitions once per screen change (diagnostics only). */
export function useDashboardPaidCreateFunnelTelemetry(
  args: UseDashboardPaidCreateFunnelTelemetryArgs,
): void {
  const lateScreens = useMemo(
    () =>
      resolveDashboardPaidCreateTelemetryLateScreens({
        createUiStage: args.createUiStage,
        agreementId: args.agreementId,
      }),
    [args.agreementId, args.createUiStage],
  );

  const screen = useMemo(
    () =>
      resolveDashboardPaidCreateScreenForTelemetry({
        onDashboard: args.onDashboard === true,
        createUiStage: args.createUiStage,
        displayPhase: args.displayPhase,
        createFlowPhase: args.createFlowPhase,
        premiumPostCheckoutPhase: args.premiumPostCheckoutPhase,
        proFullDraftQualityRetry: args.proFullDraftQualityRetry,
        premiumSendPathUnlocked: args.premiumSendPathUnlocked,
        signatureLinksSent: lateScreens.signatureLinksSent,
        completedProof: lateScreens.completedProof,
        intakeText: args.intakeText,
        draft: args.draft,
      }),
    [
      args.onDashboard,
      args.createUiStage,
      args.displayPhase,
      args.createFlowPhase,
      args.premiumPostCheckoutPhase,
      args.proFullDraftQualityRetry,
      args.premiumSendPathUnlocked,
      args.intakeText,
      args.draft,
      lateScreens.completedProof,
      lateScreens.signatureLinksSent,
    ],
  );

  const previousScreenRef = useRef<ReturnType<typeof resolveDashboardPaidCreateScreenForTelemetry> | null>(
    null,
  );

  useEffect(() => {
    if (!args.enabled) return;
    if (screen === previousScreenRef.current) return;
    const bridgedPrevious =
      previousScreenRef.current ?? peekLastLoggedDashboardPaidCreateScreen();
    logDashboardPaidCreateScreenTransition({
      screen,
      previousScreen: bridgedPrevious,
      agreementId: args.agreementId ?? null,
    });
    previousScreenRef.current = screen;
  }, [args.enabled, args.agreementId, screen]);
}
