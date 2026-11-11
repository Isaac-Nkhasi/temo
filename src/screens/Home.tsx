import { useEffect, useState } from "react";
import { Icon } from "../components/Icon";
import { ProductCard } from "../components/ProductCard";
import { useAuth } from "../auth/AuthProvider";
import { fetchWeather, plantingNote, Weather } from "../lib/weather";
import { currentSeason, sesothoDay } from "../lib/season";
import type { Product } from "../lib/types";

export type Tab = "home" | "community" | "market" | "learn" | "profile";

export function Home({
  go, products, savedIds, onToggleSave, onSelectProduct,
}: {
  go: (tab: Tab) => void; products: Product[]; savedIds: string[];
  onToggleSave: (p: Product) => void; onSelectProduct: (p: Product) => void;
}) {
  const { profile, districts } = useAuth();
  const [weather, setWeather] = useState<Weather | null>(null);
  const [weatherError, setWeatherError] = useState(false);
  const district = profile?.district ?? "Maseru";
  const place = districts.find((d) => d.name === district) ?? districts.find((d) => d.name === "Maseru");

  useEffect(() => {
    if (!place) return;
    let cancelled = false;
    setWeatherError(false);
    fetchWeather(place.latitude, place.longitude)
      .then((w) => !cancelled && setWeather(w))
      .catch(() => !cancelled && setWeatherError(true));
    return () => { cancelled = true; };
  }, [place?.name]);

  const season = currentSeason();
  const note = plantingNote(weather);
  const firstName = (profile?.full_name ?? "").split(" ")[0];

  return (
    <main className="screen">
      <section className="welcome">
        <div>
          <p className="eyebrow">{sesothoDay().toUpperCase()}, {new Date().getFullYear()}</p>
          <h1>Khotso, {firstName || "farmer"}</h1>
          <p>Here’s what your farm needs today.</p>
        </div>
        <div className="weather-symbol"><Icon name="cloud" size={32} /></div>
      </section>

      <section className="weather-card">
        <div className="weather-main">
          <div>
            <div className="temperature">{weather ? `${weather.temp}°` : "–°"}</div>
            <p>{weather ? weather.summary : weatherError ? "Weather unavailable" : "Loading…"}</p>
          </div>
          <div className="weather-meta">
            <strong>{district}</strong>
            <span>{weather ? `High ${weather.high}° · Low ${weather.low}°` : "—"}</span>
            <span>{weather ? `Rain chance ${weather.rainChance}%` : "—"}</span>
          </div>
        </div>
        <div className="weather-note">
          <Icon name="leaf" size={19} />
          <p><strong>{note.title}</strong> {note.body}</p>
        </div>
      </section>

      <section>
        <div className="section-title">
          <div><span>Seasonal guidance</span><h2>What to do this week</h2></div>
          <button onClick={() => go("learn")}>See all</button>
        </div>
        <div className="guidance-scroll">
          {season.cards.map((card) => (
            <article className={`guidance-card ${card.color}`} key={card.title}>
              <div className="card-icon"><Icon name={card.icon} /></div>
              <span>{card.label}</span>
              <h3>{card.title}</h3>
              <p>{card.body}</p>
              <button onClick={() => go("learn")}>Read guide <Icon name="arrow" size={16} /></button>
            </article>
          ))}
        </div>
      </section>

      <section className="quick-grid">
        <button onClick={() => go("community")}>
          <span><Icon name="users" /></span>
          <div><strong>Ask the community</strong><small>Get advice from local farmers</small></div>
          <Icon name="arrow" size={18} />
        </button>
        <button onClick={() => go("market")}>
          <span><Icon name="store" /></span>
          <div><strong>Browse market</strong><small>Buy and sell farm products</small></div>
          <Icon name="arrow" size={18} />
        </button>
      </section>

      <section>
        <div className="section-title">
          <div><span>NEAR YOU</span><h2>Fresh from the market</h2></div>
          <button onClick={() => go("market")}>View all</button>
        </div>
        {products.length ? (
          <div className="product-scroll">
            {[...products]
              .sort((a, b) => Number(b.district === district) - Number(a.district === district))
              .slice(0, 3)
              .map((product) => (
                <ProductCard key={product.id} product={product} saved={savedIds.includes(product.id)}
                  onToggleSave={onToggleSave} onSelect={onSelectProduct} />
              ))}
          </div>
        ) : (
          <div className="empty"><Icon name="store" size={30} /><h3>No listings yet</h3><p>Be the first to list produce.</p></div>
        )}
      </section>
    </main>
  );
}
