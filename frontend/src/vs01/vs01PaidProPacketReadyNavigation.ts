/** Owner dashboard landing after VS01 packet prepare + signing invite dispatch (Paid Pro bridge). */
export const PAID_PRO_VS01_PACKET_READY_DASHBOARD_PATH = "/app?vs01_packet_ready=1";

export function paidProPacketReadyDashboardPath(): string {
  return PAID_PRO_VS01_PACKET_READY_DASHBOARD_PATH;
}
