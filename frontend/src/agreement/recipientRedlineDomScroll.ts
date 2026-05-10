/**
 * DOM helpers for recipient full-legal-redline navigation (scroll containers + nested <details>).
 */

function selectorAttrMatch(attr: string, value: string): string {
  const v = String(value ?? "");
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return `[${attr}="${CSS.escape(v)}"]`;
  }
  return `[${attr}="${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"]`;
}

export function findScrollableAncestor(el: HTMLElement | null, boundsRoot: HTMLElement | null): HTMLElement | null {
  if (!el) return boundsRoot;
  if (boundsRoot && boundsRoot.scrollHeight > boundsRoot.clientHeight + 2) {
    if (el === boundsRoot || boundsRoot.contains(el)) return boundsRoot;
  }
  let cur: HTMLElement | null = el;
  while (cur) {
    if (boundsRoot && cur === boundsRoot) return boundsRoot;
    const st = window.getComputedStyle(cur);
    const oy = st.overflowY;
    const canScroll = (oy === "auto" || oy === "scroll" || oy === "overlay") && cur.scrollHeight > cur.clientHeight + 4;
    if (canScroll) return cur;
    cur = cur.parentElement;
  }
  return boundsRoot;
}

/** Opens `<details>` ancestors from `el` up through `boundary` (inclusive of `el`, stops when leaving boundary). */
export function openAncestorDetailsWithin(el: Element | null, boundary: HTMLElement | null): void {
  let cur: Element | null = el;
  while (cur && boundary && boundary.contains(cur)) {
    if (cur instanceof HTMLDetailsElement) {
      cur.open = true;
    }
    if (cur === boundary) break;
    cur = cur.parentElement;
  }
}

export type RecipientRedlineScrollTarget = {
  root: HTMLElement | null;
  /** Only open `<details>` inside this scrollport (avoids toggling unrelated page disclosures). */
  detailsBoundary: HTMLElement | null;
  anchorValue: string;
  anchorAttribute?: "data-recipient-semantic-anchor" | "data-block-id";
};

export function resolveRedlineScrollTarget(t: RecipientRedlineScrollTarget): HTMLElement | null {
  const shell = t.root;
  if (!shell) return null;
  const attr = t.anchorAttribute ?? "data-recipient-semantic-anchor";
  const el = shell.querySelector(selectorAttrMatch(attr, t.anchorValue)) as HTMLElement | null;
  if (!el) return null;
  openAncestorDetailsWithin(el, t.detailsBoundary);
  if (el instanceof HTMLDetailsElement) {
    el.open = true;
  }
  return el;
}

export function scrollElementIntoScrollport(el: HTMLElement, scrollport: HTMLElement | null): void {
  const port = scrollport ?? findScrollableAncestor(el, null);
  if (!port || port === document.documentElement) {
    el.scrollIntoView({ block: "nearest", behavior: "smooth" });
    return;
  }
  const elRect = el.getBoundingClientRect();
  const portRect = port.getBoundingClientRect();
  const offset = elRect.top - portRect.top + port.scrollTop - 12;
  const top = Math.max(0, offset);
  if (typeof port.scrollTo === "function") {
    port.scrollTo({ top, behavior: "smooth" });
  } else {
    port.scrollTop = top;
  }
}

export type ScrollRecipientRedlineAnchorOptions = RecipientRedlineScrollTarget & {
  onHighlight?: (anchorId: string | null) => void;
  highlightAnchorId?: string | null;
  highlightClearMs?: number;
};

/** Resolves target, opens nested details, scrolls into the scrollport. */
export function scrollRecipientRedlineAnchor(opts: ScrollRecipientRedlineAnchorOptions): HTMLElement | null {
  const el = resolveRedlineScrollTarget(opts);
  if (!el) return null;
  const port = findScrollableAncestor(el, opts.root);
  scrollElementIntoScrollport(el, port);
  return el;
}

/**
 * Retries scroll across layout ticks; applies highlight once when a target is found.
 */
export async function scrollRecipientRedlineAnchorWithRetries(opts: ScrollRecipientRedlineAnchorOptions): Promise<HTMLElement | null> {
  const { onHighlight, highlightClearMs, highlightAnchorId, anchorAttribute, ...target } = opts;
  const sleep = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));
  let best: HTMLElement | null = null;
  await new Promise<void>((r) => window.requestAnimationFrame(() => r()));
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt === 1) await sleep(50);
    if (attempt === 2) await sleep(70);
    if (attempt === 3) await sleep(140);
    best =
      scrollRecipientRedlineAnchor({ ...target, anchorAttribute, anchorValue: opts.anchorValue }) ?? best;
    if (best) break;
  }
  if (best && onHighlight) {
    const hl =
      highlightAnchorId ?? (anchorAttribute === "data-block-id" ? null : opts.anchorValue);
    onHighlight(hl);
    const ms = highlightClearMs ?? 2600;
    if (hl && ms > 0) window.setTimeout(() => onHighlight(null), ms);
  }
  return best;
}

export type ScrollRecipientRedlineClausePanelOptions = {
  root: HTMLElement | null;
  detailsBoundary: HTMLElement | null;
  semanticAnchorId: string | null;
  blockId: string | null;
  onHighlight?: (anchorId: string | null) => void;
  highlightClearMs?: number;
};

/** Tries semantic anchor, then `data-block-id`, then scrolls scrollport top as last resort. */
export async function scrollRecipientRedlineClausePanel(
  opts: ScrollRecipientRedlineClausePanelOptions,
): Promise<HTMLElement | null> {
  const { root, detailsBoundary, semanticAnchorId, blockId, onHighlight, highlightClearMs } = opts;
  const tryScroll = async (
    anchorValue: string,
    anchorAttribute: "data-recipient-semantic-anchor" | "data-block-id",
    highlightId: string | null,
  ) => {
    return scrollRecipientRedlineAnchorWithRetries({
      root,
      detailsBoundary,
      anchorValue,
      anchorAttribute,
      highlightAnchorId: highlightId,
      onHighlight,
      highlightClearMs,
    });
  };
  if (semanticAnchorId) {
    const hit = await tryScroll(semanticAnchorId, "data-recipient-semantic-anchor", semanticAnchorId);
    if (hit) return hit;
  }
  if (blockId) {
    const hit = await tryScroll(blockId, "data-block-id", semanticAnchorId);
    if (hit) return hit;
  }
  if (root) {
    if (typeof root.scrollTo === "function") root.scrollTo({ top: 0, behavior: "smooth" });
    else root.scrollTop = 0;
  }
  return null;
}
