import { useFlowEnvironment } from "../../app/FlowEnvironmentProvider";
import { WorldPageShell, warmCard } from "../../shared/design-system/WorldPageShell";
import { buildEliteHomeModel } from "../elite/eliteViewModel";

const labels = { jacket: "Light jacket", layer: "Extra layer", trousers: "Trousers", shoes: "Closed shoes", umbrella: "Umbrella", sun: "Sun protection" } as const;

export function WeatherOutfitSpace() {
  const { document, temporalScope, currentTime } = useFlowEnvironment();
  const model = buildEliteHomeModel(document, temporalScope, currentTime);
  const weather = model.weather;
  const displayedTemperature = weather?.temperatureC ?? weather?.apparentTemperatureC ?? weather?.maximumC;
  return <WorldPageShell destination="weather-outfit" eyebrow={model.dateLabel} title="Weather & Outfit" description="A practical read of the forecast already connected to the same time scope as Today." testId="weather-outfit-space">
    <div className="grid gap-6 lg:grid-cols-[1fr_1.35fr]">
      <article className={`${warmCard} p-8`}><p className="text-sm text-flow-secondary">Today</p><div className="mt-5 flex items-end gap-4"><p className="font-serif text-7xl tracking-[-0.07em]">{displayedTemperature === undefined ? "—" : `${Math.round(displayedTemperature)}°`}</p><p className="pb-2 text-sm text-flow-secondary">{weather?.quality ?? "Forecast unavailable"}</p></div><dl className="mt-8 grid grid-cols-2 gap-3">{[["Rain", weather?.precipitationProbability === undefined ? "Unknown" : `${weather.precipitationProbability}%`],["Wind", weather?.windKph === undefined ? "Unknown" : `${Math.round(weather.windKph)} km/h`],["Low", weather?.minimumC === undefined ? "—" : `${Math.round(weather.minimumC)}°C`],["High", weather?.maximumC === undefined ? "—" : `${Math.round(weather.maximumC)}°C`]].map(([term,value]) => <div className="rounded-2xl bg-[#F5F1ED] p-4" key={term}><dt className="text-xs text-flow-secondary">{term}</dt><dd className="mt-1 text-lg">{value}</dd></div>)}</dl></article>
      <article className={`${warmCard} p-8`}><p className="text-sm text-flow-secondary">Wear</p><h3 className="mt-4 font-serif text-4xl tracking-[-0.04em]">{model.outfit.headline}</h3><p className="mt-3 max-w-xl text-sm leading-6 text-flow-secondary">{model.outfit.detail}</p><div className="mt-8 grid gap-3 sm:grid-cols-2">{model.outfit.pieces.map((piece, index) => <div className="flex min-h-20 items-center gap-4 rounded-2xl bg-[#F5F1ED] px-5" key={`${piece}-${index}`}><span className="grid size-10 place-items-center rounded-full bg-white text-xl" aria-hidden>{piece === "umbrella" ? "☂" : piece === "sun" ? "☀" : "◌"}</span><span className="text-sm font-medium">{labels[piece]}</span></div>)}</div><p className="mt-7 text-xs text-flow-muted">{weather ? `${weather.source} · ${weather.quality} · no guess when data is missing` : "Calendar and Focus continue to work without weather data."}</p></article>
    </div>
  </WorldPageShell>;
}
