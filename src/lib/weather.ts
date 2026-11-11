// Live weather from Open-Meteo (free, no API key).
export type Weather = {
  temp: number; high: number; low: number; rainChance: number; summary: string; code: number;
};

const CODES: Record<number, string> = {
  0: "Clear sky", 1: "Mostly clear", 2: "Partly cloudy", 3: "Overcast", 45: "Fog", 48: "Fog",
  51: "Light drizzle", 53: "Drizzle", 55: "Heavy drizzle", 61: "Light rain", 63: "Rain", 65: "Heavy rain",
  71: "Light snow", 73: "Snow", 75: "Heavy snow", 80: "Rain showers", 81: "Rain showers", 82: "Heavy showers",
  95: "Thunderstorm", 96: "Thunderstorm with hail", 99: "Thunderstorm with hail",
};

export async function fetchWeather(lat: number, lon: number): Promise<Weather> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max` +
    `&timezone=Africa%2FMaseru&forecast_days=1`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Weather unavailable");
  const j = await res.json();
  const code = j.current.weather_code as number;
  return {
    temp: Math.round(j.current.temperature_2m),
    high: Math.round(j.daily.temperature_2m_max[0]),
    low: Math.round(j.daily.temperature_2m_min[0]),
    rainChance: Math.round(j.daily.precipitation_probability_max[0] ?? 0),
    summary: CODES[code] ?? "Fair",
    code,
  };
}

export function plantingNote(w: Weather | null): { title: string; body: string } {
  if (!w) return { title: "Checking the weather…", body: "Live conditions for your district are loading." };
  if (w.low <= 2) return { title: "Frost risk tonight.", body: "Cover seedlings and move young livestock into dry shelter." };
  if (w.rainChance >= 60) return { title: "Rain expected.", body: "Moist soil helps seedlings settle – hold off on spraying and fertiliser." };
  if (w.high >= 30) return { title: "Hot day ahead.", body: "Water early in the morning and mulch to protect young plants." };
  return { title: "Good day to work the fields.", body: "Conditions are mild and suitable for planting and field work." };
}
