/**
 * Bot display names, in order: country names first, then tribe-style words when the countries run out.
 *
 * - Countries: ISO 3166 codes (a plain list of codes) turned into names by the browser (Intl.DisplayNames) in the UI
 *   language, so no name data is copied into the project. Ids walk the list with a stride coprime to its length, so
 *   neighbouring bots do not get alphabetical neighbours.
 * - Tribes: a prefix and a suffix joined into one word (e.g. "Ashholm"). Our own lists.
 * Both are unique per bot id; past the tribe grid a number is appended.
 */

const COUNTRY_CODES = [
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

/** Stride coprime to the list length (195 = 3 * 5 * 13; 7 shares no factor with it). */
const COUNTRY_STRIDE = 7;

const TRIBE_PREFIXES = ["Ash", "Iron", "Storm", "Frost", "Ember", "Stone", "Raven", "Wolf", "Silver", "Dusk", "Thorn", "Crow"];
const TRIBE_SUFFIXES = ["holm", "dale", "ward", "mark", "reach", "crest", "fall", "gard", "moor", "vale", "wick", "haven"];
const TRIBE_GRID = TRIBE_PREFIXES.length * TRIBE_SUFFIXES.length;

/** The browser's name for a country code in the given language; the code itself if the browser cannot say. */
function countryName(code: string, locale: string): string {
	try {
		return new Intl.DisplayNames([locale], {type: "region"}).of(code) ?? code;
	} catch {
		return code;
	}
}

/**
 * Display name for a bot id. `locale` is a BCP-47 tag ("en", "ru"); the game passes its UI language.
 */
export function botDisplayName(id: number, locale: string = "en"): string {
	const n = Math.max(0, Math.floor(id));
	const countries = COUNTRY_CODES.length;
	if (n < countries) {
		const index = (n * COUNTRY_STRIDE) % countries;
		return countryName(COUNTRY_CODES[index], locale);
	}
	const t = n - countries;
	const word = TRIBE_PREFIXES[t % TRIBE_PREFIXES.length] + TRIBE_SUFFIXES[Math.floor(t / TRIBE_PREFIXES.length) % TRIBE_SUFFIXES.length];
	const cycle = Math.floor(t / TRIBE_GRID);
	return cycle === 0 ? word : `${word} ${cycle + 1}`;
}

/** Number of bot names that are countries (before tribe names start). */
export const BOT_COUNTRY_COUNT = COUNTRY_CODES.length;
