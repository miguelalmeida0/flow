import { useFlowEnvironment } from "../../../app/FlowEnvironmentProvider";
import type { RitualDefinition } from "../../../domain/studio-model";
import { warmCard, warmQuietButton } from "../../../shared/design-system/WorldPageShell";
import { homeRitualStep, homeRitualStepLabels as labels, ritualStepKey, type HomeRitualStep } from "../ritualConfiguration";

export function HomeRitualEditor({ ritual }: { ritual: RitualDefinition }) {
  const environment = useFlowEnvironment();
  const definitions = (["sound", "journal", "quiet"] as HomeRitualStep[]).map((key) => ({ key, step: homeRitualStep(environment.document, key) }));
  return <section className={`${warmCard} p-4`} data-testid="home-ritual-editor">
    <div className="flex items-center justify-between gap-4"><div><span className="text-xs font-semibold uppercase tracking-[0.12em] text-[#756F66]">Home ritual</span><p className="mt-1 text-sm text-[#52606D]">“I’m home” runs only the steps you keep here.</p></div><button data-action-id="ritual.enabled" aria-label={ritual.enabled ? "Disable home ritual" : "Enable home ritual"} aria-pressed={ritual.enabled} className={warmQuietButton} data-flow-action="Home ritual toggle" onClick={() => environment.runCommand(ritual.enabled ? "Disable home ritual" : "Enable home ritual", "quick")} type="button">{ritual.enabled ? "Enabled" : "Enable"}</button></div>
    <div className="mt-4 space-y-2">{definitions.map(({ key, step }) => {
      const included = ritual.steps.some((item) => ritualStepKey(item) === key);
      const phrase = `${included ? "Remove" : "Include"} ${key} ${included ? "from" : "in"} home ritual`;
      return <label className="flex min-h-11 items-center gap-3 rounded-xl bg-[#F2EBDD] px-3 text-sm" key={key}><input data-action-id="ritual.step-enabled" aria-label={phrase} checked={included} data-flow-action="Home ritual step" disabled={!step && !included} onChange={() => environment.runCommand(phrase, "quick")} type="checkbox"/>{labels[key]}</label>;
    })}</div>
  </section>;
}
