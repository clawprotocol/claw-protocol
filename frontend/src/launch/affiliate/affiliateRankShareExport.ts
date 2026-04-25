import { toBlob } from "html-to-image";

export async function exportAffiliateRankCardPng(node: HTMLElement): Promise<Blob> {
  const blob = await toBlob(node, {
    type: "image/png",
    pixelRatio: 2,
    cacheBust: true,
    backgroundColor: "#020617",
  });
  if (!blob) throw new Error("Could not render share card.");
  return blob;
}

export function downloadAffiliateRankBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function affiliateRankCardFilename(mode: string): string {
  const ts = new Date().toISOString().slice(0, 10);
  return `lawdog-referral-share-${mode}-${ts}.png`;
}
