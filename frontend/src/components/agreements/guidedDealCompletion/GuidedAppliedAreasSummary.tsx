type Props = {
  areas: readonly string[];
};

export function GuidedAppliedAreasSummary({ areas }: Props) {
  if (!areas.length) return null;
  return (
    <div
      className="rounded-lg border border-emerald-200/90 bg-emerald-50/95 px-4 py-3"
      role="status"
      data-testid="guided-applied-areas-summary"
    >
      <p className="text-sm font-semibold text-emerald-950">Your answers were applied to:</p>
      <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs leading-relaxed text-emerald-950/90">
        {areas.map((area) => (
          <li key={area}>{area}</li>
        ))}
      </ul>
    </div>
  );
}
