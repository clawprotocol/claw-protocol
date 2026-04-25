import { useCallback, useMemo } from "react";
import { useAccess } from "../access/AccessContext";
import { useLaunchNav } from "../launch/LaunchNavContext";
import {
  canReuseTemplates,
  canUseAdvancedWorkProduct,
  readLawDogUserMonetizationState,
} from "./lawDogMonetization";
import { usePowerPaywall } from "./PowerPaywallContext";

/**
 * Intercept navigations that require Power; opens {@link UpgradeToPowerModal} when blocked.
 */
export function usePowerGatedNavigation() {
  const access = useAccess();
  const { navigate } = useLaunchNav();
  const { openPowerPaywall } = usePowerPaywall();
  const state = useMemo(
    () => readLawDogUserMonetizationState(access.tier, access.usage),
    [access.tier, access.usage]
  );

  const navigateToReuse = useCallback(
    (surface: string, path: string) => {
      if (canReuseTemplates(state)) {
        navigate(path);
        return;
      }
      openPowerPaywall(surface, "reuse_templates");
    },
    [navigate, openPowerPaywall, state]
  );

  const navigateToWorkProduct = useCallback(
    (surface: string) => {
      if (canUseAdvancedWorkProduct(state)) {
        navigate("/app/work-product");
        return;
      }
      openPowerPaywall(surface, "advanced_work_product");
    },
    [navigate, openPowerPaywall, state]
  );

  return { navigateToReuse, navigateToWorkProduct, monetizationState: state };
}
