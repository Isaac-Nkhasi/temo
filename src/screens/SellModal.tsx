import { FormEvent, useState } from "react";
import { Icon } from "../components/Icon";
import { useAuth } from "../auth/AuthProvider";
import { createListing } from "../lib/api";
import type { Category } from "../lib/types";

export function SellModal({ close, onCreated }: { close: () => void; onCreated: () => void }) {
  const { profile, districts } = useAuth();
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [unit, setUnit] = useState("");
  const [stock, setStock] = useState("1");
  const [category, setCategory] = useState<Category>("Produce");
  const [description, setDescription] = useState("");
  const [district, setDistrict] = useState(profile?.district ?? "Maseru");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      await createListing(profile!.id, {
        name, price: Number(price), unit, stock: Math.floor(Number(stock)), district, category, description, file,
      });
      setDone(true);
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not publish listing");
    } finally { setBusy(false); }
  };

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="modal">
        <button className="modal-close" onClick={close}><Icon name="close" /></button>
        {done ? (
          <div className="success">
            <span><Icon name="check" size={30} /></span>
            <h2>Listing published</h2>
            <p>Your product is ready for local farmers to discover.</p>
            <button onClick={close}>Back to market</button>
          </div>
        ) : (
          <>
            <p className="eyebrow">SELL LOCALLY</p>
            <h2>Create a listing</h2>
            <p className="modal-intro">Tell nearby farmers what you have available.</p>
            <form onSubmit={submit}>
              <label className={`photo-upload ${preview ? "has-photo" : ""}`}>
                {preview ? (
                  <img src={preview} alt="New listing preview" />
                ) : (
                  <span>
                    <Icon name="plus" size={24} />
                    <strong>Add a product photo</strong>
                    <small>JPG, PNG or WebP · max 5 MB</small>
                  </span>
                )}
                <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => {
                  const f = event.target.files?.[0];
                  if (!f) return;
                  if (f.size > 5 * 1024 * 1024) { setError("Photo must be smaller than 5 MB."); return; }
                  setError("");
                  setFile(f);
                  setPreview(URL.createObjectURL(f));
                }} />
                {preview && <em>Change photo</em>}
              </label>
              <label>Product name
                <input required minLength={2} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Fresh potatoes" />
              </label>
              <div className="form-row">
                <label>Price (Maloti)
                  <input required type="number" min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="180" />
                </label>
                <label>Sold per
                  <input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="20 kg bag" />
                </label>
              </div>
              <div className="form-row">
                <label>In stock
                  <input required type="number" min="1" step="1" value={stock} onChange={(e) => setStock(e.target.value)} />
                </label>
                <label>Category
                  <select value={category} onChange={(e) => setCategory(e.target.value as Category)}>
                    {["Produce", "Livestock", "Seeds", "Equipment"].map((c) => <option key={c}>{c}</option>)}
                  </select>
                </label>
              </div>
              <label>Pickup district
                <select value={district} onChange={(e) => setDistrict(e.target.value)}>
                  {districts.map((d) => <option key={d.name}>{d.name}</option>)}
                </select>
              </label>
              <label>Description
                <textarea rows={3} maxLength={2000} value={description} onChange={(e) => setDescription(e.target.value)}
                  placeholder="Quality, how it was grown, when it can be collected…" />
              </label>
              {error && <div className="form-error" role="alert">{error}</div>}
              <button className="primary" type="submit" disabled={busy}>{busy ? "Publishing…" : "Publish listing"}</button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
