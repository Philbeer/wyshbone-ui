import { resolveLocationAgainstDefault } from "./locationResolver";

export type Params = {
  userId: string;
  location?: string;
  country?: string;       // current default country (from prefs or env)
};

const FALLBACK_DEFAULT = process.env.DEFAULT_COUNTRY || "United Kingdom";

export async function guardLocation(params: Params) {
  const location = params.location || "";
  const defCountry = params.country || FALLBACK_DEFAULT;

  if (!location) {
    return { proceed: true, country: defCountry, message: null };
  }

  const result = await resolveLocationAgainstDefault(location, defCountry);

  if (result.action === "use_default") {
    return { proceed: true, country: defCountry, message: null };
  }

  if (result.action === "auto_switch" && result.chosenCountry) {
    // Auto-switch default country and inform user
    const msg = `🌍 I noticed "${location}" is in ${titleCase(result.chosenCountry)}, not your default (${defCountry}). I've switched your default country so we search in the right place.`;
    return { proceed: true, country: result.chosenCountry, message: msg };
  }

  if (result.action === "ask_user" && result.candidates?.length) {
    const opts = result.candidates.map(titleCase).slice(0, 6).join(", ");
    const msg = `"${location}" exists in multiple countries (${opts}). Which country should I use for this search?`;
    return { proceed: false, country: defCountry, message: msg, options: result.candidates.map(titleCase) };
  }

  // no match – just proceed with default (or you could ask to rephrase)
  return { proceed: true, country: defCountry, message: null };
}

function titleCase(s: string) {
  return s.replace(/\b\w/g, m => m.toUpperCase());
}
