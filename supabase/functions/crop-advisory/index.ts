// crop-advisory: day-ahead agronomic risk advisory for a Lesotho district.
//
// Runs the logistic-regression model trained by ai/src/train.ts
// (supabase/functions/_shared/cropRisk.weights.ts) on a live weather forecast
// to estimate the chance of frost or heat stress *tomorrow*.
//
// Training data is NASA POWER / MERRA-2 (see ai/src/build-dataset.ts). The
// live forecast comes from Open-Meteo, which is key-free and designed for this
// kind of on-demand lookup. See docs/PHASE4_AI_NOTES.md for the cross-source
// caveat and the production recommendation.
//
// Body:  { "district": "Maseru" }   (district name; defaults to the caller's
//                                     profile district, then Maseru)
// Reply: { district, as_of, forecast, frost, heat, model, source }

import { createClient } from "jsr:@supabase/supabase-js@2";
import { CROP_RISK_MODEL } from "../_shared/cropRisk.weights.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const round1 = (n: number) => Math.round(n * 10) / 10;

/** YYYY-MM-DD in Lesotho local time. */
function maseruToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Maseru",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** The daily block of an Open-Meteo response: a `time` axis plus data arrays. */
type Daily = { time: string[] } & Record<string, unknown>;

async function fetchForecast(lat: number, lon: number): Promise<Daily> {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(lat));
  url.searchParams.set("longitude", String(lon));
  url.searchParams.set(
    "daily",
    [
      "temperature_2m_max",
      "temperature_2m_min",
      "temperature_2m_mean",
      "precipitation_sum",
      "shortwave_radiation_sum",
      "relative_humidity_2m_mean",
      "wind_speed_10m_max",
    ].join(","),
  );
  url.searchParams.set("past_days", "8");
  url.searchParams.set("forecast_days", "2");
  url.searchParams.set("timezone", "Africa/Maseru");
  const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status}`);
  const payload = await res.json();
  return payload.daily as Daily;
}

/** "2026-11-11" -> day-of-year, for the seasonal sine/cosine features. */
function dayOfYear(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return (Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 1)) / 86_400_000;
}

function score(target: "frost" | "heat", features: Record<string, number>): { probability: number; alert: boolean } {
  const model = CROP_RISK_MODEL.models[target];
  const { mean: mu, std: sd } = CROP_RISK_MODEL.scaler;
  let z = model.bias;
  CROP_RISK_MODEL.features.forEach((name, j) => {
    const value = features[name];
    if (!Number.isFinite(value)) throw new Error(`missing feature "${name}"`);
    z += model.weights[j] * ((value - mu[j]) / sd[j]);
  });
  const probability = sigmoid(z);
  return { probability, alert: probability >= model.decision_threshold };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const body = await req.json().catch(() => ({}));
    let districtName: string | undefined = typeof body?.district === "string" ? body.district : undefined;

    // If the caller is signed in and did not choose a district, use their profile.
    const authHeader = req.headers.get("Authorization") ?? "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!districtName && authHeader && supabaseUrl && serviceKey) {
      const admin = createClient(supabaseUrl, serviceKey);
      const { data } = await admin.auth.getUser(authHeader.replace("Bearer ", "")).catch(() => ({ data: null }));
      const userId = data?.user?.id;
      if (userId) {
        const { data: profile } = await admin.from("profiles").select("district").eq("id", userId).single();
        districtName = profile?.district ?? undefined;
      }
    }
    districtName ??= "Maseru";

    const district = CROP_RISK_MODEL.districts.find((d) => d.name.toLowerCase() === districtName!.toLowerCase());
    if (!district) return json({ error: `Unknown district "${districtName}"` }, 400);

    const daily = await fetchForecast(district.latitude, district.longitude);
    const series = (name: string): (number | null)[] => {
      const value = daily[name];
      return Array.isArray(value) ? (value as (number | null)[]) : [];
    };

    const today = maseruToday();
    let i = daily.time.indexOf(today);
    if (i < 1) i = daily.time.length - 2; // fall back to the last complete day
    if (i < 6) return json({ error: "Live forecast is incomplete; try again later" }, 503);

    const at = (name: string, offset: number) => series(name)[i + offset];
    const last7 = (name: string) => Array.from({ length: 7 }, (_, k) => at(name, k - 6));
    const tminHistory = last7("temperature_2m_min");
    const precipHistory = last7("precipitation_sum");

    const todayValues = [
      at("temperature_2m_min", 0),
      at("temperature_2m_max", 0),
      at("temperature_2m_mean", 0),
      at("precipitation_sum", 0),
      at("shortwave_radiation_sum", 0),
      at("relative_humidity_2m_mean", 0),
      at("wind_speed_10m_max", 0),
      at("temperature_2m_min", -1),
      at("temperature_2m_mean", -2),
      at("temperature_2m_mean", -1),
    ];
    if ([...tminHistory, ...precipHistory, ...todayValues].some((v) => typeof v !== "number")) {
      return json({ error: "Live forecast is incomplete; try again later" }, 503);
    }

    const tmin = tminHistory as number[];
    const precip = precipHistory as number[];
    const dayOfYearIndex = dayOfYear(daily.time[i]);

    const features: Record<string, number> = {
      elevation_m: district.elevation_m,
      latitude: district.latitude,
      tmin: at("temperature_2m_min", 0)!,
      tmax: at("temperature_2m_max", 0)!,
      tmean: at("temperature_2m_mean", 0)!,
      tmin_min3: Math.min(...tmin.slice(-3)),
      tmean_mean3: mean([at("temperature_2m_mean", -2)!, at("temperature_2m_mean", -1)!, at("temperature_2m_mean", 0)!]),
      tmin_delta1: at("temperature_2m_min", 0)! - at("temperature_2m_min", -1)!,
      precip: at("precipitation_sum", 0)!,
      precip_sum3: sum(precip.slice(-3)),
      precip_sum7: sum(precip),
      radiation: at("shortwave_radiation_sum", 0)!,
      rh: at("relative_humidity_2m_mean", 0)!,
      // Open-Meteo reports wind in km/h at 10 m; the model was trained on
      // NASA POWER's 2 m mean wind in m/s, so convert for scale.
      wind: at("wind_speed_10m_max", 0)! / 3.6,
      doy_sin: Math.sin((2 * Math.PI * dayOfYearIndex) / 365.25),
      doy_cos: Math.cos((2 * Math.PI * dayOfYearIndex) / 365.25),
    };

    const frost = score("frost", features);
    const heat = score("heat", features);

    const tomorrowMin = at("temperature_2m_min", 1);
    const tomorrowMax = at("temperature_2m_max", 1);

    const frostAdvice = frost.alert
      ? `Frost is likely tomorrow (forecast minimum ${round1(tomorrowMin ?? features.tmin)} °C). Cover or harvest tender crops, protect seedlings with mulch or night covers, delay planting, and shelter small livestock overnight.`
      : `No frost is expected tomorrow (forecast minimum ${round1(tomorrowMin ?? features.tmin)} °C). Normal field work can continue.`;
    const heatAdvice = heat.alert
      ? `Heat stress is likely tomorrow (forecast maximum ${round1(tomorrowMax ?? features.tmax)} °C). Irrigate early morning or evening, mulch to keep soil moisture, shade seedlings, move field work off midday, and make sure livestock have water and shade.`
      : `No heat stress is expected tomorrow (forecast maximum ${round1(tomorrowMax ?? features.tmax)} °C).`;

    return json({
      district: district.name,
      as_of: today,
      forecast: { tomorrow_min_c: tomorrowMin, tomorrow_max_c: tomorrowMax },
      frost: { probability: Number(frost.probability.toFixed(3)), alert: frost.alert, advice: frostAdvice },
      heat: { probability: Number(heat.probability.toFixed(3)), alert: heat.alert, advice: heatAdvice },
      model: {
        trained_at: CROP_RISK_MODEL.trained_at,
        test_from: CROP_RISK_MODEL.split.test_from,
        frost_decision_threshold: CROP_RISK_MODEL.models.frost.decision_threshold,
        heat_decision_threshold: CROP_RISK_MODEL.models.heat.decision_threshold,
      },
      source: {
        live_forecast: "Open-Meteo forecast API (https://api.open-meteo.com)",
        training_data: "NASA POWER / MERRA-2 (CC BY 4.0)",
      },
    });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
