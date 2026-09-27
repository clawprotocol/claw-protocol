/**
 * Owner dashboard list URL. Must not be an automatic remount / hard-refresh /
 * packet-ready success landing (`resolvePacketReadyRemountLanding`).
 * In-wizard Prepare stay is `resolvePostPrepareBuyerSurface` (#139).
 * Manual "Back to dashboard" (`/app`) / "Open agreement workspace" may still use this.
 */
export const PAID_PRO_VS01_PACKET_READY_DASHBOARD_PATH = "/app?vs01_packet_ready=1";

export function paidProPacketReadyDashboardPath(): string {
  return PAID_PRO_VS01_PACKET_READY_DASHBOARD_PATH;
}
