// The ten Lesotho districts, with the same coordinates the app stores in
// public.districts (supabase/001_schema.sql). Kept here so the AI pipeline and
// the live advisory service resolve weather for exactly the districts users
// can select in the marketplace.
export type District = {
  name: string;
  slug: string;
  latitude: number;
  longitude: number;
};

export const DISTRICTS: District[] = [
  { name: "Maseru", slug: "maseru", latitude: -29.31, longitude: 27.48 },
  { name: "Berea", slug: "berea", latitude: -29.2, longitude: 27.9 },
  { name: "Leribe", slug: "leribe", latitude: -28.87, longitude: 28.05 },
  { name: "Butha-Buthe", slug: "butha-buthe", latitude: -28.77, longitude: 28.25 },
  { name: "Mokhotlong", slug: "mokhotlong", latitude: -29.29, longitude: 29.07 },
  { name: "Thaba-Tseka", slug: "thaba-tseka", latitude: -29.52, longitude: 28.61 },
  { name: "Qacha's Nek", slug: "qachas-nek", latitude: -30.11, longitude: 28.69 },
  { name: "Quthing", slug: "quthing", latitude: -30.4, longitude: 27.7 },
  { name: "Mohale's Hoek", slug: "mohales-hoek", latitude: -30.15, longitude: 27.47 },
  { name: "Mafeteng", slug: "mafeteng", latitude: -29.82, longitude: 27.24 },
];

export function districtBySlug(slug: string): District | undefined {
  return DISTRICTS.find((d) => d.slug === slug);
}
