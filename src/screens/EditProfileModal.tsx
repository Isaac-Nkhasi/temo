import { FormEvent, useState } from "react";
import { Icon } from "../components/Icon";
import { useAuth } from "../auth/AuthProvider";

export function EditProfileModal({ close, flash }: { close: () => void; flash: (m: string) => void }) {
  const { profile, districts, saveProfile } = useAuth();
  const [fullName, setFullName] = useState(profile!.full_name);
  const [phone, setPhone] = useState(profile!.phone ?? "");
  const [district, setDistrict] = useState(profile!.district ?? "Maseru");
  const [farmName, setFarmName] = useState(profile!.farm_name ?? "");
  const [farmType, setFarmType] = useState(profile!.farm_type ?? "Crop production");
  const [about, setAbout] = useState(profile!.farm_description ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await saveProfile({
        full_name: fullName.trim(), phone: phone.trim() || null, district,
        farm_name: farmName.trim() || null, farm_type: farmType, farm_description: about.trim() || null,
      });
      flash("Profile updated");
      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save profile");
    } finally { setBusy(false); }
  };

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="modal">
        <button className="modal-close" onClick={close}><Icon name="close" /></button>
        <p className="eyebrow">YOUR DETAILS</p>
        <h2>Edit profile</h2>
        <p className="modal-intro">Your phone number is private and never shown to other users.</p>
        <form onSubmit={submit}>
          <label>Full name<input required value={fullName} onChange={(e) => setFullName(e.target.value)} /></label>
          <div className="form-row">
            <label>Phone<input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="+266 5…" /></label>
            <label>District
              <select value={district} onChange={(e) => setDistrict(e.target.value)}>
                {districts.map((d) => <option key={d.name}>{d.name}</option>)}
              </select>
            </label>
          </div>
          <label>Farm name<input value={farmName} onChange={(e) => setFarmName(e.target.value)} placeholder="Nthako Family Farm" /></label>
          <label>Farm type
            <select value={farmType} onChange={(e) => setFarmType(e.target.value)}>
              {["Crop production", "Livestock", "Mixed farming", "Horticulture"].map((t) => <option key={t}>{t}</option>)}
            </select>
          </label>
          <label>About your farm
            <textarea rows={3} value={about} onChange={(e) => setAbout(e.target.value)} placeholder="Vegetables · Maize · Sheep" />
          </label>
          {error && <div className="form-error" role="alert">{error}</div>}
          <button className="primary" type="submit" disabled={busy}>{busy ? "Saving…" : "Save changes"}</button>
        </form>
      </div>
    </div>
  );
}
