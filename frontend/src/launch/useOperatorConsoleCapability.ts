import { useEffect, useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import {
  fetchOperatorConsoleCapability,
  type OperatorConsoleCapability,
} from "./operatorConsoleCapability";

/**
 * Probes backend operator registry for the signed-in user.
 * `ready=false` while the probe is in flight (hide Admin Console nav until known).
 */
export function useOperatorConsoleCapability(): {
  ready: boolean;
  capability: OperatorConsoleCapability;
} {
  const { user } = useAuth();
  const [ready, setReady] = useState(false);
  const [capability, setCapability] = useState<OperatorConsoleCapability>({
    authorized: false,
    role: null,
    userId: null,
  });

  useEffect(() => {
    let cancelled = false;
    setReady(false);
    if (!user?.id) {
      setCapability({ authorized: false, role: null, userId: null });
      setReady(true);
      return;
    }
    void fetchOperatorConsoleCapability().then((next) => {
      if (cancelled) return;
      setCapability(next);
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  return { ready, capability };
}
