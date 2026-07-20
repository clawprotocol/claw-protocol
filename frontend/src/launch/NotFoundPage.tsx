import { LaunchFailureState } from "./LaunchFailureState";

export function NotFoundPage() {
  return (
    <LaunchFailureState
      kind="not_found"
      message="We could not find a page at this address. The link may be mistyped, expired, or moved."
      detail="If you followed a link from email or a bookmark, try opening LawDog from the home page or request a fresh link from the sender."
    />
  );
}
