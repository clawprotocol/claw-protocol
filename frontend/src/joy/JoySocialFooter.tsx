import { useMemo } from "react";
import { useLaunchNav } from "../launch/LaunchNavContext";
import { JOY_COPY } from "./clawJoyCopy";

const ROTATE = [JOY_COPY.socialFollowThrough, JOY_COPY.socialDidntDie, JOY_COPY.taglineMoveWithProof] as const;

/**
 * Non-legal social energy — placed below main content, above compliance footer.
 */
export function JoySocialFooter(props: { className?: string }) {
  const { pathname } = useLaunchNav();
  const line = useMemo(() => ROTATE[pathname.length % ROTATE.length] ?? ROTATE[0], [pathname]);

  return <p className={`claw-joy-social-footer ${props.className ?? ""}`}>{line}</p>;
}
