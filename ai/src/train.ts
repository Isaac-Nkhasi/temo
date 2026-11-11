/**
 * Model step of the Temo crop-advisory pipeline.
 *
 * Trains two balanced logistic-regression classifiers on the *real* NASA POWER
 * weather dataset produced by build-dataset.ts:
 *
 *   - frost risk  : will tomorrow's minimum temperature drop to <= 2 degC?
 *   - heat stress : will tomorrow's maximum reach >= 30 degC?
 *
 * Evaluation uses a strict time-based split - fit (train) on the past, choose
 * the decision threshold on a later validation period, then score a final
 * unseen test period - so no future information leaks into the model or its
 * operating point. Results are compared against two honest baselines:
 * always-predict-the-majority-class and persistence (tomorrow behaves like
 * today).
 *
 * The trained weights are exported as JSON (for the report) and as a TypeScript
 * module inside supabase/functions/_shared so the deployed edge function can
 * score the live forecast with the exact same model.
 *
 * Run:  node src/train.ts
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { FEATURE_COLUMNS, FROST_THRESHOLD_C, HEAT_THRESHOLD_C } from "./build-dataset.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATASET = path.join(ROOT, "data", "dataset.csv");
const META = path.join(ROOT, "data", "dataset.meta.json");
const MODEL_DIR = path.join(ROOT, "model");
const JSON_MODEL = path.join(MODEL_DIR, "crop-risk.json");
const METRICS = path.join(MODEL_DIR, "metrics.json");
const SHARED_TS = path.resolve(ROOT, "..", "supabase", "functions", "_shared", "cropRisk.weights.ts");

/**
 * Three-way time split. The model is fitted on < VALIDATE_FROM, the decision
 * threshold is chosen on [VALIDATE_FROM, TEST_FROM), and everything from
 * TEST_FROM onward is held back for the reported test score.
 */
export const VALIDATE_FROM = "2013-01-01";
export const TEST_FROM = "2016-01-01";

const EPOCHS = 500;
const LEARNING_RATE = 0.5;
const L2 = 1e-4;

type Row = { date: string; district: string; x: number[]; frost: number; heat: number; tmin: number; tmax: number };

const FEATURES = FEATURE_COLUMNS as readonly string[];

function parseCsv(text: string): Row[] {
  const lines = text.trim().split("\n");
  const header = lines[0].split(",");
  const idx = (name: string) => header.indexOf(name);
  const iDate = idx("date");
  const iDistrict = idx("district");
  const featureIdx = FEATURES.map((f) => idx(f));
  const iFrost = idx("frost_next");
  const iHeat = idx("heat_next");
  const iTmin = idx("tmin");
  const iTmax = idx("tmax");

  return lines.slice(1).map((line) => {
    const c = line.split(",");
    return {
      date: c[iDate],
      district: c[iDistrict],
      x: featureIdx.map((i) => Number(c[i])),
      frost: Number(c[iFrost]),
      heat: Number(c[iHeat]),
      tmin: Number(c[iTmin]),
      tmax: Number(c[iTmax]),
    };
  });
}

// ---------------------------------------------------------------- statistics

function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));

function trainLogistic(X: number[][], y: number[], epochs = EPOCHS): { w: number[]; b: number } {
  const n = X.length;
  const d = X[0].length;
  const w = new Array(d).fill(0);
  let b = 0;

  // Balanced class weights so the rare risk days are not ignored.
  const pos = y.reduce((a, v) => a + v, 0);
  const neg = n - pos;
  const wPos = n / (2 * Math.max(pos, 1));
  const wNeg = n / (2 * Math.max(neg, 1));

  for (let epoch = 0; epoch < epochs; epoch++) {
    const gw = new Array(d).fill(0);
    let gb = 0;
    for (let i = 0; i < n; i++) {
      const sw = y[i] === 1 ? wPos : wNeg;
      let z = b;
      for (let j = 0; j < d; j++) z += w[j] * X[i][j];
      const err = (sigmoid(z) - y[i]) * sw;
      for (let j = 0; j < d; j++) gw[j] += err * X[i][j];
      gb += err;
    }
    for (let j = 0; j < d; j++) w[j] -= LEARNING_RATE * (gw[j] / n + L2 * w[j]);
    b -= LEARNING_RATE * (gb / n);
  }
  return { w, b };
}

function score(X: number[][], model: { w: number[]; b: number }): number[] {
  return X.map((row) => sigmoid(row.reduce((z, v, j) => z + v * model.w[j], model.b)));
}

// ------------------------------------------------------------------ metrics

function confusion(pred: number[], truth: number[]) {
  let tp = 0;
  let fp = 0;
  let tn = 0;
  let fn = 0;
  pred.forEach((p, i) => {
    if (p === 1 && truth[i] === 1) tp++;
    else if (p === 1 && truth[i] === 0) fp++;
    else if (p === 0 && truth[i] === 0) tn++;
    else fn++;
  });
  return { tp, fp, tn, fn };
}

function rocAuc(scores: number[], truth: number[]): number {
  const pairs = scores.map((s, i) => ({ s, y: truth[i] })).sort((a, b) => a.s - b.s);
  const n = pairs.length;
  const ranks = new Array<number>(n);
  let i = 0;
  while (i < n) {
    let j = i;
    while (j + 1 < n && pairs[j + 1].s === pairs[i].s) j++;
    const avg = (i + j) / 2 + 1; // 1-based average rank for ties
    for (let k = i; k <= j; k++) ranks[k] = avg;
    i = j + 1;
  }
  const pos = truth.reduce((a, v) => a + v, 0);
  const neg = n - pos;
  if (pos === 0 || neg === 0) return Number.NaN;
  let rankSum = 0;
  for (let idx = 0; idx < n; idx++) if (pairs[idx].y === 1) rankSum += ranks[idx];
  return (rankSum - (pos * (pos + 1)) / 2) / (pos * neg);
}

function report(scores: number[], truth: number[], threshold = 0.5) {
  const pred = scores.map((s) => (s >= threshold ? 1 : 0));
  const { tp, fp, tn, fn } = confusion(pred, truth);
  const precision = tp + fp === 0 ? 0 : tp / (tp + fp);
  const recall = tp + fn === 0 ? 0 : tp / (tp + fn);
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
  return {
    n: truth.length,
    positives: truth.reduce((a, v) => a + v, 0),
    threshold: Number(threshold.toFixed(3)),
    accuracy: (tp + tn) / truth.length,
    precision,
    recall,
    f1,
    roc_auc: rocAuc(scores, truth),
    confusion: { tp, fp, tn, fn },
  };
}

function asBaseline(pred: number[], truth: number[]) {
  return report(pred.map((p) => (p === 1 ? 1 : 0)), truth, 0.5);
}

/**
 * Pick the operating point that maximises F1 on the validation period. Risk
 * advisories care about recall, but we still want a threshold that keeps the
 * false-alarm rate sane, so F1 (which balances precision and recall) is the
 * selection criterion. The threshold is chosen on validation data only.
 */
function bestThreshold(scores: number[], truth: number[]): number {
  let best = 0.5;
  let bestF1 = -1;
  for (let t = 0.05; t <= 0.95; t += 0.01) {
    const { f1 } = report(scores, truth, t);
    if (f1 > bestF1) {
      bestF1 = f1;
      best = t;
    }
  }
  return Number(best.toFixed(2));
}

// --------------------------------------------------------------------- main

const TASKS = [
  {
    key: "frost",
    label: "frost_next",
    y: (r: Row) => r.frost,
    baseline: (r: Row) => (r.tmin <= FROST_THRESHOLD_C ? 1 : 0),
  },
  {
    key: "heat",
    label: "heat_next",
    y: (r: Row) => r.heat,
    baseline: (r: Row) => (r.tmax >= HEAT_THRESHOLD_C ? 1 : 0),
  },
] as const;

async function main() {
  const rows = parseCsv(await readFile(DATASET, "utf8"));
  const meta = JSON.parse(await readFile(META, "utf8")) as {
    districts: { name: string; latitude: number; longitude: number; elevation_m: number }[];
  };
  const fitRows = rows.filter((r) => r.date < VALIDATE_FROM);
  const valRows = rows.filter((r) => r.date >= VALIDATE_FROM && r.date < TEST_FROM);
  const testRows = rows.filter((r) => r.date >= TEST_FROM);
  console.log(
    `dataset ${rows.length} rows | fit ${fitRows.length} (< ${VALIDATE_FROM}) | ` +
      `validate ${valRows.length} | test ${testRows.length} (>= ${TEST_FROM})`,
  );

  // Standardise using fit statistics only - no validation/test leakage.
  const d = FEATURES.length;
  const mu = new Array(d).fill(0);
  const sd = new Array(d).fill(0);
  for (let j = 0; j < d; j++) {
    const col = fitRows.map((r) => r.x[j]);
    mu[j] = mean(col);
    const varr = mean(col.map((v) => (v - mu[j]) ** 2));
    sd[j] = Math.sqrt(varr) || 1;
  }
  const scale = (r: Row) => r.x.map((v, j) => (v - mu[j]) / sd[j]);

  const Xfit = fitRows.map(scale);
  const Xval = valRows.map(scale);
  const Xtest = testRows.map(scale);

  const results: Record<string, unknown> = {};
  const models: Record<string, { w: number[]; b: number; threshold: number }> = {};

  for (const task of TASKS) {
    const model = trainLogistic(Xfit, fitRows.map(task.y));
    const threshold = bestThreshold(score(Xval, model), valRows.map(task.y));
    models[task.key] = { ...model, threshold };

    const yte = testRows.map(task.y);
    const testScores = score(Xtest, model);
    const tuned = report(testScores, yte, threshold);
    const atHalf = report(testScores, yte, 0.5);
    const persistence = asBaseline(testRows.map(task.baseline), yte);
    const majorityClass = fitRows.map(task.y).reduce((a, v) => a + v, 0) >= fitRows.length / 2 ? 1 : 0;
    const majority = asBaseline(new Array(yte.length).fill(majorityClass), yte);

    results[task.key] = {
      label: task.label,
      model: tuned,
      model_at_0_5: atHalf,
      persistence_baseline: persistence,
      majority_baseline: majority,
      weights: Object.fromEntries(FEATURES.map((f, j) => [f, Number(model.w[j].toFixed(4))])),
      bias: Number(model.b.toFixed(4)),
    };

    const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
    console.log(
      `\n${task.key} (${task.label})  decision threshold ${threshold.toFixed(2)}\n` +
        `  model       acc ${pct(tuned.accuracy)}  P ${pct(tuned.precision)}  R ${pct(tuned.recall)}  ` +
        `F1 ${pct(tuned.f1)}  AUC ${tuned.roc_auc.toFixed(3)}\n` +
        `  persistence acc ${pct(persistence.accuracy)}  P ${pct(persistence.precision)}  R ${pct(persistence.recall)}  ` +
        `F1 ${pct(persistence.f1)}  AUC ${persistence.roc_auc.toFixed(3)}\n` +
        `  majority    acc ${pct(majority.accuracy)}  F1 ${pct(majority.f1)}`,
    );
  }

  const artifact = {
    version: 1,
    trained_at: new Date().toISOString(),
    task: "day-ahead agronomic risk for the ten Lesotho districts",
    split: { fit_before: VALIDATE_FROM, validate_from: VALIDATE_FROM, test_from: TEST_FROM },
    features: FEATURES,
    // Per-district feature constants (latitude, training elevation) so the
    // serving function reproduces the exact training-time feature vector.
    districts: meta.districts,
    scaler: {
      mean: mu.map((v) => Number(v.toFixed(6))),
      std: sd.map((v) => Number(v.toFixed(6))),
    },
    agronomic_thresholds_c: { frost: FROST_THRESHOLD_C, heat: HEAT_THRESHOLD_C },
    models: Object.fromEntries(
      Object.entries(models).map(([k, m]) => [
        k,
        {
          weights: m.w.map((v) => Number(v.toFixed(6))),
          bias: Number(m.b.toFixed(6)),
          decision_threshold: m.threshold,
        },
      ]),
    ),
  };

  await mkdir(MODEL_DIR, { recursive: true });
  await writeFile(JSON_MODEL, `${JSON.stringify(artifact, null, 2)}\n`);
  await writeFile(
    METRICS,
    `${JSON.stringify(
      {
        trained_at: artifact.trained_at,
        split: artifact.split,
        rows: { total: rows.length, fit: fitRows.length, validate: valRows.length, test: testRows.length },
        results,
      },
      null,
      2,
    )}\n`,
  );

  // Deployable copy: edge functions can only import from supabase/functions/.
  await mkdir(path.dirname(SHARED_TS), { recursive: true });
  await writeFile(
    SHARED_TS,
    `// GENERATED by ai/src/train.ts - do not edit by hand.\n` +
      `// Trained ${artifact.trained_at} on the real NASA POWER dataset ` +
      `(fit < ${VALIDATE_FROM}, threshold on validation, test >= ${TEST_FROM}).\n` +
      `export const CROP_RISK_MODEL = ${JSON.stringify(artifact)} as const;\n`,
  );

  console.log(`\nmodel  -> ${JSON_MODEL}`);
  console.log(`metrics-> ${METRICS}`);
  console.log(`edge   -> ${SHARED_TS}`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
