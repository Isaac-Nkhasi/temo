import { useCallback, useEffect, useState } from "react";
import { Icon } from "../components/Icon";
import { currentSeason } from "../lib/season";
import { images } from "../lib/images";
import { fetchDistricts, getCropAdvisory } from "../lib/api";
import type { CropAdvisory, RiskAdvisory } from "../lib/types";
import type { Tab } from "./Home";

function RiskCard({
  kind, advisory, forecast, unit,
}: {
  kind: string; advisory: RiskAdvisory; forecast: number | null; unit: "min" | "max";
}) {
  const percent = Math.round(advisory.probability * 100);
  return (
    <article className={`risk-card ${advisory.alert ? "risk-alert" : "risk-clear"}`}>
      <header>
        <span>{kind}</span>
        <strong>{advisory.alert ? "Alert" : "Low"}</strong>
      </header>
      <p className="risk-prob">{percent}%</p>
      <p className="risk-forecast">
        Tomorrow’s {unit} {forecast === null ? "—" : `${forecast} °C`}
      </p>
      <p className="risk-advice">{advisory.advice}</p>
    </article>
  );
}

export function Learn({
  go, flash, defaultDistrict,
}: {
  go: (tab: Tab) => void;
  flash: (msg: string) => void;
  defaultDistrict?: string | null;
}) {
  const season = currentSeason();
  const [districts, setDistricts] = useState<string[]>([]);
  const [district, setDistrict] = useState(defaultDistrict || "Maseru");
  const [advisory, setAdvisory] = useState<CropAdvisory | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchDistricts()
      .then((rows) => setDistricts(rows.map((row) => row.name)))
      .catch(() => undefined);
  }, []);

  const load = useCallback(
    async (name: string) => {
      setLoading(true);
      setError("");
      try {
        setAdvisory(await getCropAdvisory(name));
      } catch (e) {
        const message = e instanceof Error ? e.message : "Could not load the farm advisory";
        setAdvisory(null);
        setError(message);
        flash(message);
      } finally {
        setLoading(false);
      }
    },
    [flash],
  );

  useEffect(() => {
    load(district);
  }, [district, load]);

  const options = districts.length ? districts : [district];

  return (
    <main className="screen">
      <div className="page-heading">
        <p className="eyebrow">FARM SMARTER</p>
        <h1>Seasonal insights</h1>
        <span>Timely advice made for Lesotho farms.</span>
      </div>
      <div className="insight-hero">
        <img src={images.farmer} alt="Farmer in Lesotho" />
        <div>
          <span>{season.heroLabel}</span>
          <h2>{season.heroTitle}</h2>
          <p>{season.heroBody}</p>
        </div>
      </div>

      <section className="advisory-card" id="crop-advisory">
        <div className="advisory-head">
          <div>
            <p className="eyebrow">FARM INTELLIGENCE</p>
            <h2>Tomorrow’s risk</h2>
          </div>
          <label className="district-filter">
            <Icon name="leaf" size={15} />
            <select value={district} onChange={(e) => setDistrict(e.target.value)} aria-label="District">
              {options.map((name) => (
                <option key={name} value={name}>{name}</option>
              ))}
            </select>
          </label>
        </div>

        {loading ? (
          <p className="advisory-note">Scoring tomorrow’s forecast…</p>
        ) : error ? (
          <p className="advisory-note advisory-error">{error}</p>
        ) : advisory ? (
          <>
            <div className="risk-grid">
              <RiskCard kind="Frost" advisory={advisory.frost} forecast={advisory.forecast.tomorrow_min_c} unit="min" />
              <RiskCard kind="Heat stress" advisory={advisory.heat} forecast={advisory.forecast.tomorrow_max_c} unit="max" />
            </div>
            <p className="advisory-note">
              Day-ahead model trained on NASA POWER history, scored against an Open-Meteo forecast. As of {advisory.as_of}.
            </p>
          </>
        ) : null}
      </section>

      <div className="guide-list">
        {season.guides.map((guide) => (
          <article className={`guide-row ${guide.color}`} key={guide.title}>
            <div className="guide-icon"><Icon name={guide.icon} /></div>
            <div>
              <span>{guide.label}</span>
              <h3>{guide.title}</h3>
              <p>{guide.body}</p>
              <button onClick={() => document.getElementById("crop-advisory")?.scrollIntoView({ behavior: "smooth" })}>
                See live advisory <Icon name="arrow" size={16} />
              </button>
            </div>
          </article>
        ))}
      </div>
      <div className="expert-box">
        <Icon name="message" size={27} />
        <div>
          <h3>Need specific advice?</h3>
          <p>Ask a question and get help from farmers in your district.</p>
        </div>
        <button onClick={() => go("community")}>Ask</button>
      </div>
    </main>
  );
}
