import type { Ref } from "react";
import {
  PRO_CTA_CONTINUE,
  PRO_CTA_EDIT_FREE_DRAFT,
  PRO_CTA_KEEP_FREE_DRAFT,
  PRO_UPGRADE_BRIDGE_LINE,
  PRO_UPGRADE_CARD_BODY,
  PRO_UPGRADE_CARD_HEADING,
  PRO_UPGRADE_FREE_BULLETS,
  PRO_UPGRADE_FREE_COLUMN_HELPER,
  PRO_UPGRADE_FREE_COLUMN_LABEL,
  PRO_UPGRADE_PRO_BULLETS,
  PRO_UPGRADE_PRO_COLUMN_LABEL,
  PRO_UPGRADE_REASSURANCE,
} from "../../launch/simpleProduct/proConversionCopy";
import {
  STARTER_REVIEW_PREMIUM_CTA_BUTTON_CLASSNAME,
  STARTER_REVIEW_PREMIUM_LIST_GLYPH_CLASSNAME,
  STARTER_REVIEW_PREMIUM_PANEL_CLASSNAME,
} from "./starterReviewPremiumUpsellCopy";

type Props = {
  id?: string;
  panelRef?: Ref<HTMLDivElement>;
  className?: string;
  onPrimaryClick: () => void;
  onEditFreeClick?: () => void;
  onKeepFreeClick?: () => void;
  primaryDisabled?: boolean;
  /** When false, only the primary CTA row is shown (e.g. compact callouts). */
  showSecondaryActions?: boolean;
};

function ColumnBullet({ children, warm }: { children: string; warm?: boolean }) {
  return (
    <li className="flex gap-2 text-sm leading-snug sm:leading-relaxed">
      <span
        className={warm ? STARTER_REVIEW_PREMIUM_LIST_GLYPH_CLASSNAME : "mt-0.5 shrink-0 text-slate-500"}
        aria-hidden
      >
        ✓
      </span>
      <span>{children}</span>
    </li>
  );
}

export function ProConversionComparisonCard(props: Props) {
  const {
    id,
    panelRef,
    className = "",
    onPrimaryClick,
    onEditFreeClick,
    onKeepFreeClick,
    primaryDisabled = false,
    showSecondaryActions = true,
  } = props;

  return (
    <div
      id={id}
      ref={panelRef}
      role="region"
      aria-label={PRO_UPGRADE_CARD_HEADING}
      className={`scroll-mt-4 p-4 sm:p-5 ${STARTER_REVIEW_PREMIUM_PANEL_CLASSNAME} ${className}`.trim()}
    >
      <h3 className="text-lg font-semibold tracking-tight text-slate-50 sm:text-xl">{PRO_UPGRADE_CARD_HEADING}</h3>
      <p className="mt-2 text-sm leading-relaxed text-slate-400 sm:text-[15px]">{PRO_UPGRADE_CARD_BODY}</p>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 sm:gap-4">
        <div className="rounded-lg border border-slate-700/60 bg-slate-950/60 p-3.5 sm:p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">{PRO_UPGRADE_FREE_COLUMN_LABEL}</p>
          <ul className="mt-2.5 space-y-2 text-slate-300/95">
            {PRO_UPGRADE_FREE_BULLETS.map((line) => (
              <ColumnBullet key={line}>{line}</ColumnBullet>
            ))}
          </ul>
          <p className="mt-3 text-[11px] leading-snug text-slate-500 sm:text-xs">{PRO_UPGRADE_FREE_COLUMN_HELPER}</p>
        </div>
        <div className="rounded-lg border border-amber-500/35 bg-gradient-to-b from-amber-950/25 via-slate-950/80 to-slate-950/90 p-3.5 shadow-[inset_0_1px_0_0_rgba(251,191,36,0.08)] sm:p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-amber-200/90">{PRO_UPGRADE_PRO_COLUMN_LABEL}</p>
          <ul className="mt-2.5 space-y-2 text-slate-100/95">
            {PRO_UPGRADE_PRO_BULLETS.map((line) => (
              <ColumnBullet key={line} warm>
                {line}
              </ColumnBullet>
            ))}
          </ul>
        </div>
      </div>

      <p className="mt-4 text-center text-sm font-medium leading-relaxed text-slate-300/90 sm:text-left">
        {PRO_UPGRADE_BRIDGE_LINE}
      </p>

      <div className="mt-5 flex flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-center">
        <button
          type="button"
          disabled={primaryDisabled}
          className={`min-h-[2.85rem] w-full px-5 py-3 text-center text-sm sm:min-w-[14rem] sm:w-auto sm:text-base ${STARTER_REVIEW_PREMIUM_CTA_BUTTON_CLASSNAME}`}
          onClick={onPrimaryClick}
        >
          {PRO_CTA_CONTINUE}
        </button>
        {showSecondaryActions && onEditFreeClick ? (
          <button
            type="button"
            className="min-h-[2.85rem] w-full rounded-lg border border-slate-600/70 bg-slate-900/70 px-5 py-3 text-center text-sm font-medium text-slate-200 transition hover:border-slate-500 hover:bg-slate-800/80 sm:w-auto"
            onClick={onEditFreeClick}
          >
            {PRO_CTA_EDIT_FREE_DRAFT}
          </button>
        ) : null}
        {showSecondaryActions && onKeepFreeClick ? (
          <button
            type="button"
            className="min-h-[2.75rem] w-full rounded-lg border border-transparent bg-transparent px-4 py-2.5 text-center text-sm font-medium text-slate-400 underline-offset-2 transition hover:text-slate-200 hover:underline sm:w-auto"
            onClick={onKeepFreeClick}
          >
            {PRO_CTA_KEEP_FREE_DRAFT}
          </button>
        ) : null}
      </div>

      <p className="mt-3 text-center text-[11px] leading-snug text-slate-400 sm:text-xs">{PRO_UPGRADE_REASSURANCE}</p>
    </div>
  );
}
