import { JOY_COPY } from "./clawJoyCopy";

export function JoyFlashBanner(props: { kind: "draft_ready"; onDismiss: () => void }) {
  const { onDismiss } = props;
  const message = JOY_COPY.draftInMotion;
  return (
    <div
      className="claw-joy-flow-warm mb-4 flex flex-wrap items-center justify-between gap-3 px-4 py-3"
      role="status"
    >
      <p className="text-sm font-medium text-slate-200">{message}</p>
      <button
        type="button"
        className="vs01-btn vs01-btn--secondary vs01-btn--compact text-[11px]"
        onClick={onDismiss}
      >
        Dismiss
      </button>
    </div>
  );
}
