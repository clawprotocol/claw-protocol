/**
 * Owner dashboard list URL. Must not be the remount-Prepare success landing —
 * stay on the private signing-links surface (`resolvePostPrepareBuyerSurface`).
 * Manual "Back to dashboard" / "Open agreement workspace" may still use this.
 */
export const PAID_PRO_VS01_PACKET_READY_DASHBOARD_PATH = "/app?vs01_packet_ready=1";

export function paidProPacketReadyDashboardPath(): string {
  return PAID_PRO_VS01_PACKET_READY_DASHBOARD_PATH;
}
