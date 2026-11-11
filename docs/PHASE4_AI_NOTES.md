# Phase 4 – Artificial intelligence (BIDT3110 Part D)

A day-ahead **crop-risk advisory** for Lesotho: given a district, Temo estimates
the chance that *tomorrow* brings frost or heat stress, and turns that into
plain-language guidance for a smallholder farmer.

Everything is trained and evaluated on **real** data. No values are invented.

| Piece | Where it lives |
|---|---|
| Data pipeline (fetch → features → train → evaluate) | `ai/` (TypeScript, zero ML dependencies) |
| Trained model (report artefact) | `ai/model/crop-risk.json`, `ai/model/metrics.json` |
| Deployable model copy | `supabase/functions/_shared/cropRisk.weights.ts` (generated) |
| Serving API | `supabase/functions/crop-advisory/index.ts` |
| UI | `src/screens/Learn.tsx` → "Farm intelligence" card |

## 1. The learning problem

Two binary classifiers, scored once per district per day:

- **`frost_next`** – will *tomorrow's* minimum temperature be **≤ 2 °C**? (frost /
  chilling damage threshold for maize, beans and vegetables)
- **`heat_next`** – will *tomorrow's* maximum temperature be **≥ 30 °C**? (heat
  stress / pollen sterility threshold for maize)

The label for a day is a deterministic function of the **next** day's observed
weather, while the features use **only** observations up to and including that
day. So this is a genuine day-ahead forecast, not a label leaked from the same
row.

## 2. Data (real, reproducible, citable)

| | |
|---|---|
| Source | **NASA POWER** daily point API, `community=AG` (agroclimatology) |
| Underlying data | **MERRA-2** reanalysis (NASA Global Modeling and Assimilation Office) |
| Endpoint | `https://power.larc.nasa.gov/api/temporal/daily/point` |
| Licence | NASA POWER data are free and open (CC BY 4.0) |
| Coverage | 10 Lesotho districts × daily, **2000-01-01 → 2024-12-31** |
| Raw responses | `ai/data/raw/<district>.json` (stored verbatim, with source URL + retrieval time) |

NASA POWER was chosen over the public weather APIs because it is **key-free, has
no hourly quota, and is built for agricultural risk** – so the whole pipeline
re-runs anywhere, reproducibly.

**What is fetched per district:** `T2M_MAX`, `T2M_MIN`, `T2M`, `PRECTOTCORR`,
`ALLSKY_SFC_SW_DWN`, `RH2M`, `WS2M`.

**Features (16)** – all knowable at the end of the row's day:

`elevation_m, latitude, tmin, tmax, tmean, tmin_min3, tmean_mean3, tmin_delta1,
precip, precip_sum3, precip_sum7, radiation, rh, wind, doy_sin, doy_cos`

(`tmin_delta1` is the day-on-day cooling trend and `tmin_min3` a 3-day cold-snap
signal; `doy_sin/doy_cos` encode the season.)

**Built dataset:** **91 250 rows** → `ai/data/dataset.csv` + `dataset.meta.json`
(provenance). Class balance: frost **24.0 %** positive, heat **4.1 %** positive
– i.e. the events we care about are the rare ones.

## 3. Model

Two **logistic-regression** classifiers (one per risk), trained with **balanced
class weights** (the rare risk days count proportionally more) and L2
regularisation. Deliberately simple: it trains in seconds, is fully inspectable
(every weight is in the artefact), and needs no native ML wheels – which matters
because it must also run inside a Supabase edge function.

### Evaluation protocol (no leakage)

A strict **time-based** three-way split:

| Split | Period | Rows | Purpose |
|---|---|---|---|
| fit | < 2013-01-01 | 47 430 | train the weights |
| validate | 2013-01-01 → 2015-12-31 | 10 950 | choose the decision threshold |
| **test** | **≥ 2016-01-01** | **32 870** | the reported score (never seen during fit or threshold choice) |

Standardisation uses **fit statistics only**. The decision threshold is tuned on
the **validation** period to maximise F1 (a frost/heat warning wants recall, but
we still want the false-alarm rate under control).

### Test results (held-out 2016–2024)

**Frost**

| | Accuracy | Precision | Recall | F1 | ROC-AUC |
|---|---|---|---|---|---|
| **Model** (threshold 0.62) | **91.4 %** | 77.2 % | **89.8 %** | **83.0 %** | **0.972** |
| Persistence baseline | 89.5 % | 77.6 % | 77.6 % | 77.6 % | 0.854 |
| Majority baseline | 76.5 % | – | – | 0.0 % | 0.500 |

**Heat stress**

| | Accuracy | Precision | Recall | F1 | ROC-AUC |
|---|---|---|---|---|---|
| **Model** (threshold 0.91) | 96.1 % | 62.4 % | **70.4 %** | **66.2 %** | **0.977** |
| Persistence baseline | 96.1 % | 64.4 % | 64.6 % | 64.5 % | 0.813 |
| Majority baseline | 94.6 % | – | – | 0.0 % | 0.500 |

The model beats **both** honest baselines on F1 and ROC-AUC for both risks, and
the AUC gains (0.97 vs 0.85 frost, 0.98 vs 0.81 heat) show the features carry
real day-ahead signal rather than just persistence. Weights are interpretable:
frost is driven by `tmean`/`tmax`, the cooling trend and seasonality; heat by
`tmax`/`tmean`, the 3-day mean and radiation.

## 4. Serving

`supabase/functions/crop-advisory` imports the generated model and, for a
district, fetches the **live** forecast (Open-Meteo, `past_days=8&forecast_days=2`),
builds the same 16-feature vector, standardises it with the training scaler, and
returns the frost/heat probabilities, an alert flag (probability ≥ the tuned
threshold) and advice text. The same per-district `latitude`/`elevation_m` the
model was trained on are baked into the artefact, so serving reproduces the
training-time feature vector exactly.

`Learn.tsx` shows this as the **Farm intelligence → "Tomorrow's risk"** card with
a district selector; the placeholder buttons on the seasonal guides now scroll
to the live advisory. The card degrades gracefully (shows an error) until the
edge function is deployed.

**Live check (2026-11-11, real run):** heat alerts for Maseru (31.5 °C),
Quthing (31.5 °C), Mohale's Hoek (32.3 °C) and Mafeteng (31.4 °C); low frost
risk everywhere – consistent with a November day in Lesotho.

## 5. How to run it

```bash
cd ai
node src/fetch-weather.ts     # downloads real NASA POWER history -> data/raw/
node src/build-dataset.ts     # features + labels -> data/dataset.csv
node src/train.ts             # trains, evaluates, exports the model + edge copy
# or: npm run pipeline
```

Then deploy the function (after `supabase functions deploy` – see `docs/DEPLOY.md`):

```bash
supabase functions deploy crop-advisory
```

## 6. Design decisions worth stating in the presentation

- **Real data end-to-end.** Data is fetched from a live NASA API, stored
  verbatim, and the dataset is derived from it – every number traces back to the
  source (provenance kept in `dataset.meta.json`).
- **Zero ML dependencies.** Node's native TypeScript support runs the whole
  pipeline (no numpy/scikit-learn/Python), so the same model runs in the edge
  function and any grader can reproduce it with one command.
- **Honest evaluation.** Time-ordered split, threshold chosen on held-out
  validation data, and two baselines (majority + persistence) reported next to
  the model so the value added is visible.
- **Simple and explainable.** A logistic regression with published thresholds is
  auditable and defensible for an advisory a farmer may act on, and avoids
  over-claiming accuracy the data cannot support.

## 7. Known limitations (be honest about these)

- **Cross-source shift.** The model is trained on NASA POWER/MERRA-2 (the only
  source with a long, quota-free history) but scored on an Open-Meteo forecast
  at serve time. The variables are physically comparable, but a small bias
  (e.g. Open-Meteo's grid elevation differs from POWER's) can shift probabilities
  near the threshold. *Production fix:* retrain on the operational forecast
  source once enough history exists.
- **Rare heat events.** Heat is only 4.1 % of days; even with balanced weights
  and a tuned threshold, precision is ~62 % (about two in five alerts are false
  alarms). That is a deliberate recall-oriented trade-off for a warning system.
- **Coarse spatial resolution.** MERRA-2 grid cells snap neighbours together
  (Berea/Leribe/Butha-Buthe share one cell, and so do Mohale's Hoek/Mafeteng),
  so district-level detail is limited. A production system would blend in
  ground stations.
- **No probability calibration or uncertainty bounds**; the reported probability
  is the raw model score.
- **Not yet deployed.** The edge function and five Supabase functions
  (`anchor-order`, `verify-order`, `crop-advisory`, …) still need
  `supabase functions deploy`; the UI shows an error until then.
- **Linear model.** No interactions or nonlinear models were tried; a gradient-
  boosted model would likely lift the heat F1, at the cost of explainability and
  the dependency-free constraint.
