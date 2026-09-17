import type { OutfitDecision } from "../weather";
import type { EliteHomeModel } from "../eliteViewModel";
import { HomeLens } from "./HomeLens";
import { useFlowEnvironment } from "../../../app/FlowEnvironmentProvider";

function WeatherIcon({ rainy = false }: { rainy?: boolean }) {
  return <svg aria-hidden className="size-8 text-flow-orange-strong" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.7" viewBox="0 0 32 32"><circle cx="12" cy="12" r="5" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2" /><path d="M13 24h11a4 4 0 0 0 0-8 7 7 0 0 0-13 3 3 3 0 0 0 2 5Z" fill="#D9DEE4" stroke="#D9DEE4" />{rainy && <path className="stroke-flow-blue" d="m17 27-1 2m6-2-1 2" />}</svg>;
}

function Piece({ kind }: { kind: OutfitDecision["pieces"][number] }) {
  const paths = {
    jacket: <><path d="m8 6 4-2 4 2 4 3-2 4-2-1v9H8v-9l-2 1-2-4Z" /><path d="M12 4v17M9 8h6" /></>,
    layer: <path d="m8 6 4-2 4 2 4 3-2 4-2-1v9H8v-9l-2 1-2-4Z" />,
    trousers: <path d="M8 4h8l1 17h-4l-1-11-1 11H7Z" />,
    shoes: <path d="M4 15c5 1 7-2 9-5 2 3 4 5 7 6v4H4Z" />,
    umbrella: <><path d="M4 12a8 8 0 0 1 16 0Z" /><path d="M12 12v7c0 2 3 2 3 0" /></>,
    sun: <><circle cx="12" cy="12" r="4" /><path d="M12 3v2M12 19v2M3 12h2M19 12h2M6 6l1 1M17 17l1 1" /></>,
  };
  return <div className="grid h-[78px] flex-1 place-items-center rounded-[10px] bg-flow-neutral-soft text-[#94785A]"><svg aria-label={kind} className="size-10" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" viewBox="0 0 24 24">{paths[kind]}</svg></div>;
}

export function WeatherLens({ model }: { model: EliteHomeModel }) {
  const { navigate } = useFlowEnvironment();
  const temperature = model.weather?.temperatureC ?? model.weather?.maximumC;
  const rainy = (model.weather?.precipitationProbability ?? 0) >= 40;
  const weatherCode = model.weather?.weatherCode;
  const condition = weatherCode === undefined ? model.outfit.headline : weatherCode >= 51 ? "Rain likely" : weatherCode >= 3 ? "Cloudy" : weatherCode >= 1 ? "Partly cloudy" : "Clear";
  const rangeTemperatures = model.weatherRange.flatMap((item) => [item.minimumC, item.maximumC]).filter((value): value is number => value !== undefined);
  const rangeMinimum = rangeTemperatures.length ? Math.min(...rangeTemperatures) : undefined;
  const rangeMaximum = rangeTemperatures.length ? Math.max(...rangeTemperatures) : undefined;
  const rainyDays = model.weatherRange.filter(({ precipitationProbability }) => (precipitationProbability ?? 0) >= 40).length;
  return <HomeLens destination="weather-outfit" icon={<WeatherIcon rainy={rainy} />} testId="elite-weather-lens" title="Weather & Outfit">
    <div className="mt-7 flex items-center gap-4"><WeatherIcon rainy={rainy} /><div><p className="font-serif text-[42px] leading-none text-flow-ink">{model.scope.kind === "week" && rangeMinimum !== undefined && rangeMaximum !== undefined ? `${Math.round(rangeMinimum)}–${Math.round(rangeMaximum)}°C` : temperature === undefined ? "—" : `${Math.round(temperature)}°C`}</p><p className="mt-2 text-sm text-flow-secondary">{model.scope.kind === "week" ? `${model.weatherRange.length} forecast days · ${rainyDays} with rain risk` : condition}</p></div></div>
    <div className="my-6 h-px bg-flow-border" />
    <div className="flex gap-1.5">{model.outfit.pieces.slice(0, 4).map((piece, index) => <Piece key={`${piece}-${index}`} kind={piece} />)}</div>
    <p className="mt-5 text-sm leading-5 text-flow-secondary">{model.outfit.headline}. {model.outfit.detail}</p>
    <p className="mt-3 text-[11px] text-flow-secondary">{model.scope.kind === "week" ? `${model.weatherRange.length} of ${model.dateKeys.length} days · ${model.weather?.quality ?? "unavailable"}` : model.weather ? `${model.weather.quality} · ${model.weather.source}` : "Forecast not loaded"}</p>
    <button data-action-id="home.legacy-navigation" className="mt-3 min-h-11 w-full rounded-full text-xs text-[#52606D] hover:bg-flow-page" data-flow-action="Open Weather & Outfit" onClick={() => navigate("weather-outfit")} type="button">Open Weather & Outfit</button>
  </HomeLens>;
}
