/**
 * Feature + label step of the Temo crop-advisory pipeline.
 *
 * Turns the raw NASA POWER responses (see fetch-weather.ts) into one tidy row
 * per (district, day) with:
 *
 *   - weather features known *at the end of that day* (lags and rolling
 *     windows only - nothing from the future), and
 *   - next-day agronomic risk labels derived from published thresholds:
 *       frost_next : tomorrow's minimum temperature <= 2 degC  (frost / chilling
 *                    damage threshold for maize, beans and vegetables)
 *       heat_next  : tomorrow's maximum temperature >= 30 degC (heat stress /
 *                    pollen sterility threshold for maize)
 *
 * The labels are deterministic functions of the real observations, so this is
 * a genuine day-ahead forecasting task rather than a fabricated target.
 *
 * Run:  node src/build-dataset.ts
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { DISTRICTS, type District } from "./districts.ts";
import { RAW_DIR, START_DATE, END_DATE } from "./fetch-weather.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = path.join(ROOT, "data");
const OUT_CSV = path.join(OUT_DIR, "dataset.csv");
const OUT_META = path.join(OUT_DIR, "dataset.meta.json");

/** Minimum daily temperature at which tender crops are damaged by frost. */
export const FROST_THRESHOLD_C = 2.0;
/** Maximum daily temperature at which maize suffers heat stress. */
export const HEAT_THRESHOLD_C = 30.0;
/** Days of history each feature row needs before it can be built. */
const HISTORY_DAYS = 7;
/** NASA POWER's sentinel for a missing observation. */
const FILL = -999;

export const FEATURE_COLUMNS = [
  "elevation_m",
  "latitude",
  "tmin",
  "tmax",
  "tmean",
  "tmin_min3",
  "tmean_mean3",
  "tmin_delta1",
  "precip",
  "precip_sum3",
  "precip_sum7",
  "radiation",
  "rh",
  "wind",
  "doy_sin",
  "doy_cos",
] as const;

export const LABEL_COLUMNS = ["frost_next", "heat_next"] as const;

type RawRecord = {
  district: District;
  source_url: string;
  retrieved_at: string;
  payload: {
    geometry: { coordinates: [number, number, number] };
    properties: { parameter: Record<string, Record<string, number>> };
  };
};

export type DatasetRow = Record<string, number | string>;

function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

/** YYYYMMDD -> YYYY-MM-DD so the stored date sorts lexicographically. */
const isoDate = (yyyymmdd: string) => `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;

function buildRows(record: RawRecord): DatasetRow[] {
  const { payload, district } = record;
  const params = payload.properties.parameter;

  // POWER returns sparse maps keyed by YYYYMMDD; align every variable onto one
  // sorted date axis and normalise the -999 fill value to null.
  const dates = Object.keys(params.T2M_MIN ?? {}).sort();
  const series = (name: string): (number | null)[] =>
    dates.map((d) => {
      const v = params[name]?.[d];
      return v === undefined || v === FILL ? null : v;
    });

  const tmin = series("T2M_MIN");
  const tmax = series("T2M_MAX");
  const tmean = series("T2M");
  const precip = series("PRECTOTCORR");
  const radiation = series("ALLSKY_SFC_SW_DWN");
  const rh = series("RH2M");
  const wind = series("WS2M");
  const elevation = payload.geometry?.coordinates?.[2] ?? null;

  const rows: DatasetRow[] = [];
  // i indexes the "today" observation; we need 7 days of history and 1 day ahead.
  for (let i = HISTORY_DAYS - 1; i < dates.length - 1; i++) {
    const window = (arr: (number | null)[], len: number) => {
      const slice = arr.slice(i - len + 1, i + 1);
      return slice.every((v) => v !== null) ? (slice as number[]) : null;
    };

    const tminHist = window(tmin, 3);
    const tmeanHist = window(tmean, 3);
    const precip3 = window(precip, 3);
    const precip7 = window(precip, 7);
    const today = [tmin[i], tmax[i], tmean[i], precip[i], radiation[i], rh[i], wind[i]];
    const tomorrowMin = tmin[i + 1];
    const tomorrowMax = tmax[i + 1];

    if (today.some((v) => v === null)) continue;
    if (!tminHist || !tmeanHist || !precip3 || !precip7) continue;
    if (tomorrowMin === null || tomorrowMax === null) continue;
    if (elevation === null) continue;

    const iso = isoDate(dates[i]);
    const date = new Date(`${iso}T00:00:00Z`);
    const doy = (date.getTime() - Date.UTC(date.getUTCFullYear(), 0, 1)) / 86_400_000;

    rows.push({
      date: iso,
      district: district.name,
      elevation_m: elevation,
      latitude: district.latitude,
      tmin: tmin[i] as number,
      tmax: tmax[i] as number,
      tmean: tmean[i] as number,
      tmin_min3: Math.min(...tminHist),
      tmean_mean3: mean(tmeanHist),
      tmin_delta1: (tmin[i] as number) - (tmin[i - 1] as number),
      precip: precip[i] as number,
      precip_sum3: precip3.reduce((a, b) => a + b, 0),
      precip_sum7: precip7.reduce((a, b) => a + b, 0),
      radiation: radiation[i] as number,
      rh: rh[i] as number,
      wind: wind[i] as number,
      doy_sin: Math.sin((2 * Math.PI * doy) / 365.25),
      doy_cos: Math.cos((2 * Math.PI * doy) / 365.25),
      frost_next: tomorrowMin <= FROST_THRESHOLD_C ? 1 : 0,
      heat_next: tomorrowMax >= HEAT_THRESHOLD_C ? 1 : 0,
    });
  }
  return rows;
}

async function main() {
  const all: DatasetRow[] = [];
  const retrievedAt: string[] = [];
  // Elevation is a model feature, so record the exact grid elevation each
  // district was trained on. The serving function reuses these values instead
  // of whatever elevation the live forecast API happens to report.
  const districtMeta: { name: string; latitude: number; longitude: number; elevation_m: number }[] = [];

  for (const d of DISTRICTS) {
    const file = path.join(RAW_DIR, `${d.slug}.json`);
    const record = JSON.parse(await readFile(file, "utf8")) as RawRecord;
    retrievedAt.push(record.retrieved_at);
    const elevation = record.payload?.geometry?.coordinates?.[2];
    if (typeof elevation === "number") {
      districtMeta.push({ name: d.name, latitude: d.latitude, longitude: d.longitude, elevation_m: elevation });
    }
    const rows = buildRows(record);
    console.log(`  ${d.name.padEnd(16)} ${rows.length} rows`);
    all.push(...rows);
  }

  const header = ["date", "district", ...FEATURE_COLUMNS, ...LABEL_COLUMNS];
  const csv = [header.join(",")]
    .concat(all.map((row) => header.map((h) => String(row[h])).join(",")))
    .join("\n");
  await writeFile(OUT_CSV, `${csv}\n`);

  const frost = all.reduce((n, r) => n + (r.frost_next as number), 0);
  const heat = all.reduce((n, r) => n + (r.heat_next as number), 0);

  const meta = {
    name: "Temo crop-risk dataset (day-ahead)",
    built_at: new Date().toISOString(),
    rows: all.length,
    districts: districtMeta,
    period: { start: START_DATE, end: END_DATE },
    source: {
      provider: "NASA POWER (Prediction Of Worldwide Energy Resources)",
      url: "https://power.larc.nasa.gov/api/temporal/daily/point",
      community: "AG (agroclimatology)",
      underlying_data: "MERRA-2 reanalysis (NASA Global Modeling and Assimilation Office)",
      licence: "NASA POWER data are free and open (CC BY 4.0)",
      retrieved_at: [...new Set(retrievedAt)],
    },
    features: FEATURE_COLUMNS,
    labels: {
      frost_next: { definition: `tomorrow tmin <= ${FROST_THRESHOLD_C} degC`, positives: frost },
      heat_next: { definition: `tomorrow tmax >= ${HEAT_THRESHOLD_C} degC`, positives: heat },
    },
    notes:
      "Features use only observations up to and including the row date; labels describe the following day, so the task is genuinely day-ahead forecasting.",
  };
  await writeFile(OUT_META, `${JSON.stringify(meta, null, 2)}\n`);

  console.log(`\n${all.length} rows -> ${OUT_CSV}`);
  console.log(`frost_next positives: ${frost} (${((100 * frost) / all.length).toFixed(1)}%)`);
  console.log(`heat_next  positives: ${heat} (${((100 * heat) / all.length).toFixed(1)}%)`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
