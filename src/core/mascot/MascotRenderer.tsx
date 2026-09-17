import type { MascotPresentation } from "./mascot-model";
import { StaticMotionMascotRenderer } from "./StaticMotionMascotRenderer";

/** No `.riv` asset ships with Flow. This explicit adapter keeps the runtime
 * honest and replaceable while the verified DOM + Motion renderer remains the
 * production fallback. */
export function MascotRenderer({ presentation, layoutKey, placement }: { presentation: MascotPresentation; layoutKey: string; placement?: "fixed" | "home" }) {
  return <StaticMotionMascotRenderer layoutKey={layoutKey} placement={placement} presentation={presentation} />;
}
