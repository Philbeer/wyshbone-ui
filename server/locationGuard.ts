// server/locationGuard.ts
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

  console.log(`🔍 guardLocation: Checking "${location}" against default "${defCountry}"`);
  const result = await resolveLocationAgainstDefault(location, defCountry);
  console.log(`📊 guardLocation result:`, result);

  // ✅ Case 1: city is found in default country (incl. UK synonyms)
  if (result.action === "use_default") {
    return { proceed: true, country: defCountry, message: null };
  }

  // ⚠️ Case 2: location found but ONLY in non-default country/countries (single or multiple),
  //            AND default is not among candidates.
  if ((result.action === "auto_switch" || result.action === "ask_user") && result.candidates?.length) {
    const readable = result.candidates.map(titleCase).slice(0, 6).join(", ");

    // If there are multiple non-default candidates, ask which one AND ask to change default in the dropdown.
    if (result.action === "ask_user" && result.candidates.length > 1) {
      const msg = `"${location}" appears in multiple countries (${readable}), and not in your current default (${defCountry}). Which country do you mean? Please change your default country in the dropdown, then try the search again.`;
      return { proceed: false, country: defCountry, message: msg, options: result.candidates.map(titleCase) };
    }

    // If exactly one non-default candidate, warn and continue (do NOT auto-change default).
    const msg = `"${location}" appears to be in ${readable}, not your current default (${defCountry}). If that's correct, please change your default country in the dropdown. Proceeding with your current default for now.`;
    return { proceed: true, country: defCountry, message: msg };
  }

  // ❌ Case 3: no match – continue silently
  return { proceed: true, country: defCountry, message: null };
}

function titleCase(s: string) {
  return s.replace(/\b\w/g, (m) => m.toUpperCase());
}
