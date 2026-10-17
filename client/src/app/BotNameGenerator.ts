/**
 * Bot display names.
 *
 * Names follow the map, as in the reference game (each map's manifest lists its nations):
 *   - World: all countries of the world; Europe: European countries; Africa: African countries.
 *   - Any other map (or no country left for the bot): generated names, "Adjective Noun" from our own word lists.
 *
 * Country names are not stored: the list holds ISO 3166 codes and the browser (Intl.DisplayNames) writes the name in
 * the UI language. Ids walk each list with a stride coprime to its length, so neighbouring bots do not get
 * alphabetical neighbours. Every name is unique within one map; past the list a number is appended.
 */

const WORLD_CODES = [
  "AF", "AL", "DZ", "AD", "AO", "AG", "AR", "AM", "AU", "AT", "AZ", "BS", "BH", "BD", "BB", "BY", "BE", "BZ", "BJ", "BT",
  "BO", "BA", "BW", "BR", "BN", "BG", "BF", "BI", "CV", "KH", "CM", "CA", "CF", "TD", "CL", "CN", "CO", "KM", "CG", "CD",
  "CR", "CI", "HR", "CU", "CY", "CZ", "DK", "DJ", "DM", "DO", "EC", "EG", "SV", "GQ", "ER", "EE", "SZ", "ET", "FJ", "FI",
  "FR", "GA", "GM", "GE", "DE", "GH", "GR", "GD", "GT", "GN", "GW", "GY", "HT", "HN", "HU", "IS", "IN", "ID", "IR", "IQ",
  "IE", "IL", "IT", "JM", "JP", "JO", "KZ", "KE", "KI", "KP", "KR", "KW", "KG", "LA", "LV", "LB", "LS", "LR", "LY", "LI",
  "LT", "LU", "MG", "MW", "MY", "MV", "ML", "MT", "MH", "MR", "MU", "MX", "FM", "MD", "MC", "MN", "ME", "MA", "MZ", "MM",
  "NA", "NR", "NP", "NL", "NZ", "NI", "NE", "NG", "MK", "NO", "OM", "PK", "PW", "PA", "PG", "PY", "PE", "PH", "PL", "PT",
  "QA", "RO", "RU", "RW", "KN", "LC", "VC", "WS", "SM", "ST", "SA", "SN", "RS", "SC", "SL", "SG", "SK", "SI", "SB", "SO",
  "ZA", "SS", "ES", "LK", "SD", "SR", "SE", "CH", "SY", "TW", "TJ", "TZ", "TH", "TL", "TG", "TO", "TT", "TN", "TR", "TM",
  "TV", "UG", "UA", "AE", "GB", "US", "UY", "UZ", "VU", "VE", "VN", "YE", "ZM", "ZW",
];

const EUROPE_CODES = [
  "AL", "AD", "AT", "BY", "BE", "BA", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IS", "IE", "IT",
  "XK", "LV", "LI", "LT", "LU", "MT", "MD", "MC", "ME", "NL", "MK", "NO", "PL", "PT", "RO", "RU", "SM", "RS", "SK", "SI",
  "ES", "SE", "CH", "UA", "GB", "VA",
];

const AFRICA_CODES = [
  "DZ", "AO", "BJ", "BW", "BF", "BI", "CM", "CV", "CF", "TD", "KM", "CG", "CD", "CI", "DJ", "EG", "GQ", "ER", "SZ", "ET",
  "GA", "GM", "GH", "GN", "GW", "KE", "LS", "LR", "LY", "MG", "MW", "ML", "MR", "MU", "MA", "MZ", "NA", "NE", "NG", "RW",
  "ST", "SN", "SC", "SL", "SO", "ZA", "SS", "SD", "TZ", "TG", "TN", "UG", "ZM", "ZW",
];

const REGION_CODES: Record<string, string[]> = {
  World: WORLD_CODES,
  Europe: EUROPE_CODES,
  Africa: AFRICA_CODES,
};

/** Generated names for bots beyond the country list: "Adjective Noun", our own words. */
const GENERATED_ADJECTIVES = ["Iron", "Ashen", "Storm", "Frost", "Ember", "Stone", "Raven", "Silver", "Dusk", "Thorn", "Crimson", "Amber"];
const GENERATED_NOUNS = ["Republic", "Union", "Marches", "Dominion", "Covenant", "Reach", "Throne", "Pact", "Hold", "Crown", "Vanguard", "Accord"];
const GENERATED_GRID = GENERATED_ADJECTIVES.length * GENERATED_NOUNS.length;

/** Stride coprime to the list length. */
function strideFor(length: number): number {
  for (const s of [7, 11, 13, 17, 19, 23]) {
    if (length % s !== 0) return s;
  }
  return 1;
}

function countryName(code: string, locale: string): string {
  try {
    return new Intl.DisplayNames([locale], { type: "region" }).of(code) ?? code;
  } catch {
    return code;
  }
}

let activeMap = "World";

/** Set by the lobby when a game starts: the name list follows this map. */
export function setBotNameMap(mapId: string): void {
  activeMap = mapId;
}

/**
 * Display name for a bot id. `locale` is a BCP-47 tag ("en", "ru"), taken from the UI language.
 */
export function botDisplayName(id: number, locale: string = "en"): string {
  const n = Math.max(0, Math.floor(id));
  const codes = REGION_CODES[activeMap];
  if (codes !== undefined && n < codes.length) {
    const index = (n * strideFor(codes.length)) % codes.length;
    return countryName(codes[index], locale);
  }
  // Countries used up on this map (or a map without a country list): generated names.
  const g = codes !== undefined ? n - codes.length : n;
  const word = `${GENERATED_ADJECTIVES[g % GENERATED_ADJECTIVES.length]} ${GENERATED_NOUNS[Math.floor(g / GENERATED_ADJECTIVES.length) % GENERATED_NOUNS.length]}`;
  const cycle = Math.floor(g / GENERATED_GRID);
  return cycle === 0 ? word : `${word} ${cycle + 1}`;
}

/** Number of country names available on the active map (0 when the map has no list). */
export function botCountryCount(): number {
  return REGION_CODES[activeMap]?.length ?? 0;
}
