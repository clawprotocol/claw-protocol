import { useState } from "react";

type Props = {
  getPlainText: () => string;
  disabled?: boolean;
  minLen?: number;
  className?: string;
  "data-testid"?: string;
};

export function PremiumAgreementCopyButton({
  getPlainText,
  disabled = false,
  minLen = 1_500,
  className,
  "data-testid": testId = "premium-copy-agreement",
}: Props) {
  const [ack, setAck] = useState(false);

  const onCopy = () => {
    const text = getPlainText().trim();
    if (!text || text.length < Math.min(200, minLen) || !navigator.clipboard?.writeText) return;
    void navigator.clipboard.writeText(text).then(() => {
      setAck(true);
      window.setTimeout(() => setAck(false), 2000);
    });
  };

  const text = getPlainText().trim();
  const canCopy = text.length >= Math.min(200, minLen) && !disabled;

  return (
    <button
      type="button"
      className={
        className ??
        "rounded-lg border border-stone-300/90 bg-white px-3 py-2 text-xs font-semibold text-stone-800 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-50"
      }
      disabled={!canCopy}
      onClick={onCopy}
      data-testid={testId}
    >
      {ack ? "Copied" : "Copy agreement"}
    </button>
  );
}
