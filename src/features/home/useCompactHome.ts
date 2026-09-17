import { useSyncExternalStore } from "react";

const compactHomeQuery = "(max-width: 639px)";
const getSnapshot = () => window.matchMedia(compactHomeQuery).matches;
const getServerSnapshot = () => false;
function subscribe(onChange: () => void) {
  const media = window.matchMedia(compactHomeQuery);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

/** Match the Home sm breakpoint so the one Motion owner can relocate its perch. */
export function useCompactHome() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
