// Southern-hemisphere (Lesotho) seasonal content, driven by today's date instead of hardcoded April text.
export type Guide = { label: string; title: string; body: string; color: "olive" | "ochre" | "clay"; icon: string };
export type Season = {
  name: string; heroLabel: string; heroTitle: string; heroBody: string;
  cards: [Guide, Guide]; guides: Guide[];
};

const SESOTHO_DAYS = ["Sontaha", "Mantaha", "Labobedi", "Laboraro", "Labone", "Labohlano", "Moqebelo"];
export const sesothoDay = (d = new Date()) => SESOTHO_DAYS[d.getDay()];

const SPRING: Season = {
  name: "Spring",
  heroLabel: "SPRING FIELD GUIDE",
  heroTitle: "Planting season is here",
  heroBody: "Soils are warming. Prepare seedbeds and plant maize, beans and summer vegetables as the rains settle in.",
  cards: [
    { label: "PLANTING", title: "Plant maize and beans", body: "Sow once soil is warm and rains are reliable – usually October to November.", color: "olive", icon: "sprout" },
    { label: "WEATHER ALERT", title: "Watch for late frost", body: "Cover young seedlings on clear, cold nights until the end of the month.", color: "ochre", icon: "cloud" },
  ],
  guides: [
    { label: "THIS WEEK", title: "Prepare seedbeds and plant maize", body: "Seedbed preparation, spacing and planting dates for lowland and foothill farms.", color: "olive", icon: "sprout" },
    { label: "LIVESTOCK", title: "Spring dosing and dipping", body: "Plan parasite control and vaccinations as pastures green up.", color: "ochre", icon: "cloud" },
    { label: "CROP HEALTH", title: "Spot maize nutrient stress", body: "Learn what yellow leaves can tell you and when adding nitrogen will help.", color: "clay", icon: "leaf" },
  ],
};
const SUMMER: Season = {
  name: "Summer",
  heroLabel: "SUMMER FIELD GUIDE",
  heroTitle: "Keep crops growing strong",
  heroBody: "Weed early, top-dress maize and watch for pests and hail during the heaviest rains.",
  cards: [
    { label: "CROP CARE", title: "Weed and top-dress", body: "Remove weeds and apply nitrogen to maize 4–6 weeks after planting.", color: "olive", icon: "sprout" },
    { label: "WEATHER ALERT", title: "Hail and storm season", body: "Check drainage and secure shelters ahead of afternoon thunderstorms.", color: "ochre", icon: "cloud" },
  ],
  guides: [
    { label: "THIS WEEK", title: "Weed control and top-dressing", body: "When and how much nitrogen to apply to maize and sorghum.", color: "olive", icon: "sprout" },
    { label: "PESTS", title: "Armyworm and stalk borer", body: "Scouting tips and early treatment options for summer pests.", color: "clay", icon: "leaf" },
    { label: "LIVESTOCK", title: "Heat and water for animals", body: "Keep animals shaded and watered during hot spells.", color: "ochre", icon: "cloud" },
  ],
};
const AUTUMN: Season = {
  name: "Autumn",
  heroLabel: "AUTUMN FIELD GUIDE",
  heroTitle: "Harvest and prepare for winter",
  heroBody: "Finish harvesting summer crops, store grain safely and prepare for colder, drier days.",
  cards: [
    { label: "PLANTING", title: "Start winter vegetables", body: "Plant spinach, cabbage and onions while the soil is still warm.", color: "olive", icon: "sprout" },
    { label: "WEATHER ALERT", title: "Cold front arriving", body: "Protect seedlings and young livestock before the first frosts.", color: "ochre", icon: "cloud" },
  ],
  guides: [
    { label: "THIS WEEK", title: "Prepare fields for winter crops", body: "A practical checklist for soil preparation, composting and planting dates in the lowlands.", color: "olive", icon: "sprout" },
    { label: "HARVEST", title: "Drying and storing grain", body: "Dry maize properly and protect stored grain from moisture and weevils.", color: "clay", icon: "leaf" },
    { label: "WEATHER", title: "Protecting livestock from frost", body: "Simple shelter, bedding and water steps before temperatures fall below zero.", color: "ochre", icon: "cloud" },
  ],
};
const WINTER: Season = {
  name: "Winter",
  heroLabel: "WINTER FIELD GUIDE",
  heroTitle: "Protect and plan",
  heroBody: "Keep animals sheltered and fed, repair equipment and plan next season's crops.",
  cards: [
    { label: "LIVESTOCK", title: "Winter feed and shelter", body: "Plan supplementary feed and dry, wind-free shelter for young animals.", color: "ochre", icon: "cloud" },
    { label: "PLANNING", title: "Plan next season", body: "Test soil, order seed early and plan crop rotation.", color: "olive", icon: "sprout" },
  ],
  guides: [
    { label: "THIS WEEK", title: "Frost protection for livestock", body: "Shelter, bedding and water steps before temperatures fall below zero.", color: "ochre", icon: "cloud" },
    { label: "PLANNING", title: "Soil testing and crop rotation", body: "Use winter to test soil and plan rotations for higher yields.", color: "olive", icon: "sprout" },
    { label: "TOOLS", title: "Repair and prepare equipment", body: "Service ploughs, planters and sprayers before the planting rush.", color: "clay", icon: "leaf" },
  ],
};

export function currentSeason(date = new Date()): Season {
  const m = date.getMonth() + 1;
  if (m >= 9 && m <= 11) return SPRING;
  if (m === 12 || m <= 2) return SUMMER;
  if (m >= 3 && m <= 5) return AUTUMN;
  return WINTER;
}
