import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import { logProductEvent } from "../lib/experimentation/productEvents";
import { UpgradeToPowerModal } from "./UpgradeToPowerModal";

export type PowerPaywallContextValue = {
  /** Opens the Power upgrade modal and logs `power_paywall_triggered`. */
  openPowerPaywall: (surface: string, feature: string) => void;
  closePowerPaywall: () => void;
};

const Ctx = createContext<PowerPaywallContextValue | null>(null);

export function PowerPaywallProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [surface, setSurface] = useState("");
  const [feature, setFeature] = useState("");

  const openPowerPaywall = useCallback((surf: string, feat: string) => {
    logProductEvent("power_paywall_triggered", { surface: surf, feature: feat });
    setSurface(surf);
    setFeature(feat);
    setOpen(true);
  }, []);

  const closePowerPaywall = useCallback(() => setOpen(false), []);

  const value = useMemo(
    () => ({ openPowerPaywall, closePowerPaywall }),
    [openPowerPaywall, closePowerPaywall]
  );

  return (
    <Ctx.Provider value={value}>
      {children}
      <UpgradeToPowerModal
        open={open}
        onClose={closePowerPaywall}
        surface={surface || "unknown"}
        feature={feature || "unknown"}
      />
    </Ctx.Provider>
  );
}

export function usePowerPaywall(): PowerPaywallContextValue {
  const v = useContext(Ctx);
  if (!v) {
    return {
      openPowerPaywall: () => {},
      closePowerPaywall: () => {},
    };
  }
  return v;
}
