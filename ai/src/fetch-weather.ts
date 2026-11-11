/**
 * Real-data step of the Temo crop-advisory pipeline.
 *
 * Downloads observed daily weather for the ten Lesotho districts from the
 * NASA POWER (Prediction Of Worldwide Energy Resources) daily point API. POWER
 * serves the MERRA-2 reanalysis and its "AG" (agroclimatology) community,
 * which is the standard open dataset for agricultural risk work. Nothing here
 * is synthesised: the raw JSON responses are written verbatim so the derived
 * dataset can be checked against the upstream source.
 *
 * The endpoint is key-free and has no hourly quota (unlike the public weather
 * APIs), so a full multi-decade history for every district can be fetched
 * reproducibly on any machine.
 *
 *   source  https://power.larc.nasa.gov/api/temporal/daily/point
 *   data    NASA POWER / MERRA-2 (NASA Global Modeling and Assimilation Office)
 *   licence NASA POWER data are free and open (CC BY 4.0)
 *
 * Run:  node src/fetch-weather.ts [--force]
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { DISTRICTS, type District } from "./districts.ts";

export const START_DATE = "2000-01-01";
export const END_DATE = "2024-12-31";

/** NASA POWER daily parameters (community=AG), see build-dataset.ts for use. */
export const DAILY_VARIABLES = [
  "T2M_MAX",
  "T2M_MIN",
  "T2M",
  "PRECTOTCORR",
  "ALLSKY_SFC_SW_DWN",
  "RH2M",
  "WS2M",
] as const;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const RAW_DIR = path.join(ROOT, "data", "raw");

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const compact = (iso: string) => iso.replaceAll("-", ""); // 2000-01-01 -> 20000101

export function archiveUrl(district: District, start = START_DATE, end = END_DATE): string {
  const url = new URL("https://power.larc.nasa.gov/api/temporal/daily/point");
  url.searchParams.set("parameters", DAILY_VARIABLES.join(","));
  url.searchParams.set("community", "AG");
  url.searchParams.set("longitude", String(district.longitude));
  url.searchParams.set("latitude", String(district.latitude));
  url.searchParams.set("start", compact(start));
  url.searchParams.set("end", compact(end));
  url.searchParams.set("format", "JSON");
  return url.toString();
}

/** Fetch one district. Returns the raw POWER payload verbatim. */
export async function fetchDistrict(district: District): Promise<{ payload: any; url: string }> {
  const url = archiveUrl(district);
  for (let attempt = 1; attempt <= 6; attempt++) {
    const res = await fetch(url, { signal: AbortSignal.timeout(180_000) });
    if (res.ok) {
      const payload = await res.json();
      const params = payload?.properties?.parameter;
      if (!params?.T2M_MIN) throw new Error(`${district.name}: unexpected payload shape`);
      return { payload, url };
    }

    if (res.status === 429 || res.status >= 500) {
      const retryAfter = Number(res.headers.get("retry-after"));
      const waitMs = retryAfter > 0 ? retryAfter * 1000 : 15_000;
      console.log(`  HTTP ${res.status} - retrying in ${Math.round(waitMs / 1000)}s`);
      await sleep(waitMs);
      continue;
    }

    throw new Error(`NASA POWER HTTP ${res.status}`);
  }
  throw new Error("NASA POWER did not respond after retries");
}

async function alreadyFetched(dir: string): Promise<boolean> {
  for (const d of DISTRICTS) {
    try {
      const rec = JSON.parse(await readFile(path.join(dir, `${d.slug}.json`), "utf8"));
      if (Object.keys(rec?.payload?.properties?.parameter?.T2M_MIN ?? {}).length === 0) return false;
    } catch {
      return false;
    }
  }
  return true;
}

async function main() {
  const force = process.argv.includes("--force");
  await mkdir(RAW_DIR, { recursive: true });

  if (!force && (await alreadyFetched(RAW_DIR))) {
    console.log("All districts already fetched (use --force to refresh).");
    return;
  }

  console.log(`NASA POWER daily ${START_DATE} -> ${END_DATE}\n`);
  for (const d of DISTRICTS) {
    const { payload, url } = await fetchDistrict(d);
    const days = Object.keys(payload?.properties?.parameter?.T2M_MIN ?? {}).length;
    if (days === 0) throw new Error(`${d.name}: empty daily payload`);
    const elevation = payload?.geometry?.coordinates?.[2] ?? null;
    const record = { district: d, source_url: url, retrieved_at: new Date().toISOString(), payload };
    await writeFile(path.join(RAW_DIR, `${d.slug}.json`), JSON.stringify(record));
    console.log(`  ${d.name.padEnd(16)} ${days} days  elevation ${elevation} m`);
    await sleep(1_000); // be polite to a shared public service
  }
  console.log(`\nRaw responses written to ${RAW_DIR}`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
