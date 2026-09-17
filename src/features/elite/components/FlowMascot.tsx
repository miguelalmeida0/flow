import { useFlowEnvironment, useFlowTransition } from "../../../app/FlowEnvironmentProvider";
import { isHighLeverageMascotMoment, mascotPresentation } from "../../../core/mascot/mascot-model";
import { MascotRenderer } from "../../../core/mascot/MascotRenderer";

export function FlowMascot() {
  const { document, flowLiveStatus, feedback, reward, rewardPreferences, route, temporalScope } = useFlowEnvironment();
  const sharedTransition = useFlowTransition();
  // Hidden feature-world characters must not derive all five Home projections
  // on every calendar/layout/history render.
  if (sharedTransition || route !== "home") return null;
  const basePresentation = mascotPresentation(reward, flowLiveStatus, feedback.phase, Boolean(document.focus.active));
  if (!isHighLeverageMascotMoment(basePresentation, reward, Boolean(document.focus.active))) return null;
  if (rewardPreferences.mascot === "minimal" && basePresentation.state !== "big-win") return null;
  // The semantic flight is the response while a cross-space transformation
  // is moving. Mounting a second animated character in the same frame adds no
  // meaning and can turn a calm transition into avoidable main-thread work.
  // Feature worlds already use the object itself as feedback. Keep the fixed
  // mascot in Home's reserved lower-left safe zone; on dense task surfaces it
  // would inevitably cover a calendar fact, field, or control at some width.
  return <MascotRenderer layoutKey={`${temporalScope.kind}-${temporalScope.dateKey}`} presentation={basePresentation} />;
}
