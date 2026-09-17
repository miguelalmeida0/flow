import type { LifeContext } from "../../domain/life-model";
import type { NavigationTarget } from "./model";

export function navigationContextPatch(context: LifeContext, target: NavigationTarget): Partial<LifeContext> {
  return {
    currentWorld: target.world,
    previousWorld: context.currentWorld,
    peopleView: target.world === "people" ? target.view ?? "default" : context.peopleView,
    turn: (context.turn ?? 0) + 1,
  };
}
