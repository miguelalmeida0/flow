import { afterEach, describe, expect, it, vi } from "vitest";
import type { WeatherObservation } from "../../domain/life-model";
import { createOpenMeteoProvider, decideOutfit, fixtureWeather, weatherAt } from "./weather";

const dateKey = "2026-09-04";

function observation(patch: Partial<WeatherObservation> = {}): WeatherObservation {
  return {
    dateKey,
    observedAt: "2026-09-04T07:30:00.000Z",
    source: "fixture",
    quality: "live",
    confidence: "high",
    ...patch,
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("deterministic Weather and Outfit decisions", () => {
  it.each([
    ["cold and dry", observation({ apparentTemperatureC: 7, precipitationProbability: 10 }), "Layer up lightly", "no"],
    ["cold and windy", observation({ apparentTemperatureC: 12, windKph: 31, precipitationProbability: 5 }), "Layer up lightly", "no"],
    ["cool and rainy", observation({ apparentTemperatureC: 11, precipitationProbability: 78 }), "Cold and wet", "yes"],
    ["mild and dry", observation({ apparentTemperatureC: 18, maximumC: 21, precipitationProbability: 15 }), "Light layers should be enough", "no"],
    ["hot and bright", observation({ maximumC: 29, precipitationProbability: 8, uvIndex: 7 }), "Warm and bright", "no"],
    ["rain later", observation({ maximumC: 23, precipitationProbability: 58 }), "Rain is likely", "yes"],
    ["temperature drop", observation({ minimumC: 8, maximumC: 22, precipitationProbability: 12 }), "Layer up lightly", "no"],
    ["missing UV", observation({ maximumC: 27, precipitationProbability: 5 }), "Warm and bright", "no"],
    ["missing rain detail", observation({ apparentTemperatureC: 17 }), "Light layers should be enough", "unknown"],
  ] as const)("handles %s without inventing unavailable facts", (_case, weather, headline, umbrella) => {
    expect(decideOutfit(weather)).toMatchObject({ headline, umbrella });
  });

  it("keeps unavailable weather honest while leaving a useful fallback", () => {
    expect(decideOutfit(observation({ quality: "unavailable" }))).toMatchObject({
      headline: "Forecast unavailable",
      umbrella: "unknown",
    });
  });

  it("creates stable free fixture observations for demos and offline tests", () => {
    expect(fixtureWeather(dateKey, "2026-09-04T07:00:00.000Z")).toMatchObject({
      dateKey,
      source: "fixture",
      quality: "cached",
    });
  });

  it("qualifies expired provider data as cached without erasing the observation", () => {
    expect(weatherAt(observation({
      source: "open-meteo",
      validUntil: "2026-09-04T08:00:00.000Z",
    }), new Date("2026-09-04T09:00:00.000Z"))).toMatchObject({
      source: "cache",
      quality: "cached",
      confidence: "medium",
      dateKey,
    });
  });

  it("normalizes the public Open-Meteo payload and preserves missing fields", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        daily: {
          time: [dateKey], weather_code: [61], temperature_2m_max: [15], temperature_2m_min: [8],
          apparent_temperature_max: [12], precipitation_probability_max: [null], wind_speed_10m_max: [24],
          uv_index_max: [3], sunrise: [`${dateKey}T06:18`], sunset: [`${dateKey}T19:48`],
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const provider = createOpenMeteoProvider({ latitude: 52.52, longitude: 13.405, timezone: "Europe/Berlin" }, () => new Date("2026-09-04T07:00:00.000Z"));
    const [weather] = await provider.load([dateKey]);
    expect(weather).toMatchObject({ dateKey, source: "open-meteo", quality: "partial", confidence: "medium", maximumC: 15, precipitationProbability: undefined, validUntil: "2026-09-04T08:00:00.000Z" });
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("api.open-meteo.com");
  });
});
