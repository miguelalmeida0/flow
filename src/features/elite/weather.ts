import type { WeatherObservation } from "../../domain/life-model";

export interface WeatherProvider {
  load(dateKeys: string[], signal?: AbortSignal): Promise<WeatherObservation[]>;
}

export function fixtureWeather(dateKey: string, observedAt: string): WeatherObservation {
  const day = new Date(`${dateKey}T12:00:00`).getDate();
  const rainy = day % 4 === 1;
  const warm = day % 5 === 0;
  return {
    dateKey,
    observedAt,
    validUntil: new Date(new Date(observedAt).getTime() + 3_600_000).toISOString(),
    source: "fixture",
    quality: "cached",
    confidence: "medium",
    temperatureC: warm ? 24 : rainy ? 12 : 14,
    apparentTemperatureC: warm ? 25 : rainy ? 10 : 13,
    minimumC: warm ? 17 : rainy ? 8 : 9,
    maximumC: warm ? 26 : rainy ? 15 : 18,
    precipitationProbability: rainy ? 72 : 18,
    windKph: rainy ? 24 : 12,
    uvIndex: warm ? 6 : 3,
    weatherCode: rainy ? 61 : 2,
    sunrise: `${dateKey}T06:18:00`,
    sunset: `${dateKey}T19:48:00`,
  };
}

export function createOpenMeteoProvider(location: { latitude: number; longitude: number; timezone: string }, clock: () => Date): WeatherProvider {
  return {
    async load(dateKeys, signal) {
      if (!dateKeys.length) return [];
      const start = dateKeys[0]!;
      const end = dateKeys.at(-1)!;
      const query = new URLSearchParams({
        latitude: String(location.latitude), longitude: String(location.longitude), timezone: location.timezone,
        start_date: start, end_date: end,
        daily: "weather_code,temperature_2m_max,temperature_2m_min,apparent_temperature_max,precipitation_probability_max,wind_speed_10m_max,uv_index_max,sunrise,sunset",
      });
      const response = await fetch(`https://api.open-meteo.com/v1/forecast?${query}`, { signal });
      if (!response.ok) throw new Error(`weather ${response.status}`);
      const payload = await response.json() as { daily?: Record<string, Array<string | number | null>> };
      const daily = payload.daily;
      if (!daily?.time) return [];
      const observedAt = clock().toISOString();
      const validUntil = new Date(clock().getTime() + 3_600_000).toISOString();
      return daily.time.map((raw, index) => {
        const maximumC = numberAt(daily.temperature_2m_max, index);
        const minimumC = numberAt(daily.temperature_2m_min, index);
        const precipitationProbability = numberAt(daily.precipitation_probability_max, index);
        const partial = maximumC === undefined || minimumC === undefined || precipitationProbability === undefined;
        return {
          dateKey: String(raw), observedAt, validUntil, source: "open-meteo" as const,
          quality: partial ? "partial" as const : "live" as const,
          confidence: partial ? "medium" as const : "high" as const,
          weatherCode: numberAt(daily.weather_code, index), maximumC, minimumC,
          apparentTemperatureC: numberAt(daily.apparent_temperature_max, index), precipitationProbability,
          windKph: numberAt(daily.wind_speed_10m_max, index), uvIndex: numberAt(daily.uv_index_max, index),
          sunrise: stringAt(daily.sunrise, index), sunset: stringAt(daily.sunset, index),
        };
      });
    },
  };
}

export function weatherAt(observation: WeatherObservation | undefined, now: Date) {
  if (!observation?.validUntil || new Date(observation.validUntil).getTime() > now.getTime()) return observation;
  return {
    ...observation,
    source: "cache" as const,
    quality: "cached" as const,
    confidence: observation.confidence === "low" ? "low" as const : "medium" as const,
  };
}

function numberAt(values: Array<string | number | null> | undefined, index: number) {
  const value = values?.[index];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function stringAt(values: Array<string | number | null> | undefined, index: number) {
  const value = values?.[index];
  return typeof value === "string" ? value : undefined;
}

export interface OutfitDecision {
  headline: string;
  detail: string;
  pieces: Array<"jacket" | "layer" | "trousers" | "shoes" | "umbrella" | "sun">;
  umbrella: "yes" | "no" | "unknown";
}

export function decideOutfit(weather?: WeatherObservation): OutfitDecision {
  if (!weather || weather.quality === "unavailable") return { headline: "Forecast unavailable", detail: "Calendar and Focus still work. Try weather again later.", pieces: ["layer", "trousers", "shoes"], umbrella: "unknown" };
  const rain = weather.precipitationProbability;
  const cold = (weather.apparentTemperatureC ?? weather.minimumC ?? weather.temperatureC ?? 18) < 13;
  const hot = (weather.maximumC ?? weather.temperatureC ?? 18) >= 25;
  const windy = (weather.windKph ?? 0) >= 22;
  const umbrella = rain === undefined ? "unknown" : rain >= 45 ? "yes" : "no";
  if (umbrella === "yes") return { headline: cold ? "Cold and wet" : "Rain is likely", detail: `${cold ? "Jacket and layers" : "A light layer"}, plus an umbrella.`, pieces: ["jacket", "layer", "trousers", "shoes", "umbrella"], umbrella };
  if (hot) return { headline: "Warm and bright", detail: "Keep it light and add sun protection.", pieces: ["layer", "trousers", "shoes", "sun"], umbrella };
  return { headline: cold || windy ? "Layer up lightly" : "Light layers should be enough", detail: rain === undefined ? "Rain detail is missing, so umbrella confidence is low." : "Comfortable through the day.", pieces: [cold ? "jacket" : "layer", "trousers", "shoes"], umbrella };
}
