/**
 * Detect weak visible mutation after guided authoritative apply.
 */

export function assessGuidedMutationStrength(args: {
  preBody: string;
  postBody: string;
  changedSectionCount: number;
  renderedMarkerCount: number;
}): { lowMutation: boolean; lenDelta: number; ratio: number } {
  const pre = (args.preBody || "").trim();
  const post = (args.postBody || "").trim();
  const lenDelta = Math.abs(post.length - pre.length);
  const ratio = pre.length > 0 ? lenDelta / pre.length : post.length > 0 ? 1 : 0;
  const lowMutation =
    args.changedSectionCount > 0 &&
    args.renderedMarkerCount > 0 &&
    ratio < 0.012 &&
    lenDelta < 120;

  if (lowMutation) {
    // eslint-disable-next-line no-console
    console.warn("[guided-low-mutation-warning]", {
      changedSectionCount: args.changedSectionCount,
      renderedMarkerCount: args.renderedMarkerCount,
      lenDelta,
      ratio: Number(ratio.toFixed(4)),
      preLen: pre.length,
      postLen: post.length,
    });
  }

  return { lowMutation, lenDelta, ratio };
}
