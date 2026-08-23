/**
 * Mount boundary for paid Pro inline signer metadata fields (Test294 telemetry).
 */

import { useEffect, type ReactNode } from "react";
import {
  logPaidProSignerFieldsMounted,
  logPaidProSignerFieldsReady,
} from "./paidProSignaturePrepUi";

type Props = {
  partySlotCount: number;
  slotsWithSignerName: number;
  slotsWithSignerTitle: number;
  gateComplete: boolean;
  requiredCount: number;
  children: ReactNode;
  className?: string;
};

export function PaidProSignerFieldsMountShell({
  partySlotCount,
  slotsWithSignerName,
  slotsWithSignerTitle,
  gateComplete,
  requiredCount,
  children,
  className,
}: Props) {
  useEffect(() => {
    logPaidProSignerFieldsMounted({
      partySlotCount,
      slotsWithSignerName,
      slotsWithSignerTitle,
    });
  }, [partySlotCount, slotsWithSignerName, slotsWithSignerTitle]);

  useEffect(() => {
    if (!gateComplete) return;
    logPaidProSignerFieldsReady({
      complete: gateComplete,
      requiredCount,
    });
  }, [gateComplete, requiredCount]);

  return (
    <div
      className={
        className
          ? `mt-4 w-full sm:pr-0 md:max-w-3xl ${className}`
          : "mt-4 w-full sm:pr-0 md:max-w-3xl"
      }
      id="claw-paid-pro-inline-signer-setup"
      data-testid="paid-pro-inline-signer-setup"
    >
      {children}
    </div>
  );
}
