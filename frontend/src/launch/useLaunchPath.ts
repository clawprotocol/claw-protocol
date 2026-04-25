import { useLaunchNav } from "./LaunchNavContext";

export function useLaunchPath(): { pathname: string; navigate: (to: string) => void } {
  const { pathname, navigate } = useLaunchNav();
  return { pathname, navigate };
}
