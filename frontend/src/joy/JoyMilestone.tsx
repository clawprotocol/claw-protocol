import "./joy.css";

export function JoyMilestoneMark(props: { className?: string }) {
  const { className = "" } = props;
  return (
    <span className={`claw-joy-milestone ${className}`} aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 6 9 17l-5-5" />
      </svg>
    </span>
  );
}
