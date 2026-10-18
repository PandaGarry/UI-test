import {EventHandlerRegistry} from "@frontline/core/util/events/EventHandlerRegistry";

/**
 * Translate the given key.
 * @param key The key to translate
 * @param args The arguments to replace
 */
export const t = languageProxy<typeof eng>();

/**
 * Translate the given key.
 * This method is NOT typesafe, only use this when the key is not known (/dynamic)
 * @param key The key to translate
 * @param args The arguments to replace
 */
export const tUnsafe = languageProxy<Record<string, string>>() as (key: string, args?: Record<string, unknown>) => string;

/**
 * Create a translation function for the given language data type.
 * Set the generic parameter to your default language file, this will allow type-safe argument support.
 */
export function languageProxy<B extends Record<string, string>>() {
	return function <T extends LanguageKey<B>>(key: T, ...args: ({} extends Args<T, B> ? [] : never) | (Args<T, B> extends Record<string, never> ? [Record<string, never>] : [Args<T, B>])): Example<T, B> {
		let data = args[0] === undefined ? langData[key] : findContext<B>(key, args[0]);
		if (!data) return `Missing language string: ${key}` as Example<T, B>;
		const stringArgs = args[0] as Record<string, unknown> ?? [];
		const inline = data.matchAll(/{{([^},]+)(?:,([^}]+))?}}/g);
		for (const match of inline) {
			const arg = (match[1] ? match[1].trim() : "");
			const value = stringArgs[arg];
			if (arg === "" || value === undefined) continue;
			if (match[2] && match[2].trim() === "number") {
				data = data.replace(match[0], numberFormat.format(value as number));
			} else {
				data = data.replace(match[0], value as string);
			}
		}
		return data as Example<T, B>; //Show the English preview in the editor
	};
}

/**
 * Finds a translation, applying context narrowing if possible.
 * If the arguments contain a "context" property, a fitting suffix is appended.
 * @param key The key to translate
 * @param args The arguments to replace
 */
function findContext<R>(key: LanguageKey<R>, args: Record<string, unknown>): string | undefined {
	if ("context" in args) {
		const data = findPlural(`${key}_${args["context"] as string}` as LanguageKey<R>, args);
		if (data) return data;
	}
	return findPlural(key, args);
}

/**
 * Finds a translation, applying plural narrowing if possible.
 * If the arguments contain a "count" property, a fitting suffix (depending on the selected language) is appended.
 * @param key The key to translate
 * @param args The arguments to replace
 */
function findPlural<R>(key: LanguageKey<R>, args: Record<string, unknown>): string | undefined {
	if ("count" in args) {
		if (args["count"] === 0) { //prioritize zero if present
			const ordinal = langData[`${key}_ordinal_zero`];
			if (ordinal) return ordinal;
			const data = langData[`${key}_zero`];
			if (data) return data;
		}
		const ordinal = pluralRulesOrdinal.select(args["count"] as number);
		const ordinalData = langData[`${key}_ordinal_${ordinal}`];
		if (ordinalData) return ordinalData;
		const rule = pluralRules.select(args["count"] as number);
		const data = langData[`${key}_${rule}`];
		if (data) return data;
	}
	return langData[key];
}

//TODO: Nesting, to allow for multiple plural forms

/**
 * Set the used language.
 * @param code Three letter identifier of the language (ISO 639-3)
 * @param data Language data
 */
export function setLanguage(code: string, data: Record<string, string>) {
	patchLanguage(data);
	langCode = code;
	numberFormat = new Intl.NumberFormat(langCode);
	pluralRules = new Intl.PluralRules(langCode);
	pluralRulesOrdinal = new Intl.PluralRules(langCode, {type: "ordinal"});
	languageChangeRegistry.broadcast();
}

/**
 * Add additional strings to the selected Language.
 * NOTE: You have to inject them every time the language is changed, see {@link languageChangeRegistry}
 * @param data The additional strings
 */
export function patchLanguage(data: Record<string, string>) {
	langData = {...langData, ...data};
}

/**
 * Translate the given key if a translation exists, otherwise return the fallback.
 * Use for labels that may be either a translation key or plain text.
 * @param key The key to translate
 * @param fallback The text to return when the key has no translation
 */
export function tOr(key: string, fallback: string): string {
	return key in langData ? tUnsafe(key) : fallback;
}

export const languageChangeRegistry = new EventHandlerRegistry();

//TODO: a translation system should probably support multiple languages (load and cache language files)

/**
 * Master language data, used to allow typesafe argument injection.
 * Syntax is compatible with i18next, only supporting parts of the feature set:
 * - Arguments: {{ name }} or {{ name, format }}
 * - Available formats: number
 * - Plurals: Suffix _zero _one _two _few _many _other _singular (dependent on used language), each is available as ordinal
 * - Context: Context data suffix
 */
const eng = {
	"game.result.title": "Game Result",
	"game.winner.single": "Player {{name}} won the game!",
	"game.action.leave": "Leave Game",
	"settings.title": "Settings",
	"theme.pastel": "Pastel",
	"hud.attack.decrease": "Decrease attack ratio",
	"settings.category.controls": "Controls",
	"controls.attackRatioDown": "Attack ratio: decrease",
	"controls.attackRatioUp": "Attack ratio: increase",
	"controls.press": "Press a key…",
	"controls.unbound": "Not bound",
	"controls.reset": "Reset keys",
	"controls.hint": "Esc cancels, Backspace clears the key",
	"hud.attack.increase": "Increase attack ratio",
	"settings.language": "Language",
	"settings.category.general": "Game",
	"settings.category.interface": "Game Interface",
	"settings.category.advanced": "Advanced",
		"game_menu.title": "Menu",
		"game_menu.settings": "Settings",
		"game_menu.exit": "Exit game",
		"game_menu.exit_confirm": "Leave the match? Progress will be lost.",
		"settings.category.graphics": "Graphics",
		"settings.category.sound": "Sound",
		"settings.desc.general": "Language and theme.",
		"settings.desc.controls": "Keys for playing the game.",
		"settings.desc.interface": "What is shown over the map.",
		"settings.desc.graphics": "Presets: Quality, Balance, Performance.",
		"settings.desc.sound": "Volume by category and pause when the window is hidden.",
		"settings.desc.advanced": "For advanced users and developers.",
	"game.load.fail": "Failed to load game",
	"menu.map.select": "Select a map to play",
	"menu.bots.select": "How many bots?",
	"menu.speed.select": "Game speed?",
	"setting.select.wf@theme": "Theme",
	"setting.select.wf@debug-renderer": "Toggle Debug Renderers",
	"setting.select.wf@debug-renderer.title": "Debug Renderers",
	"setting.boolean.wf@hud-clock": "Display a clock in game hud",
	"setting.boolean.wf@map-sand": "Sand strip on coasts (visual only)",
	"setting.boolean.wf@map-depth": "Water depth shading (visual only)",
	"setting.boolean.wf@map-textures": "Painterly textures on the map (visual only)",
	"setting.boolean.wf@map-texture-tint": "Tint territory over textures (visual only)",
	"setting.string.wf@game-server": "Server Address",
	"setting.string.wf@game-server.placeholder": "https://warfront.io",
} as const;

/** Russian translation. Missing keys fall back to English (see setLanguage). */
export const rus: Partial<Record<keyof typeof eng, string>> = {
	"game.result.title": "Итоги игры",
	"game.winner.single": "Игрок {{name}} победил!",
	"game.action.leave": "Покинуть игру",
	"settings.title": "Настройки",
	"theme.pastel": "Пастельная",
	"hud.attack.decrease": "Уменьшить долю атаки",
	"settings.category.controls": "Управление",
	"controls.attackRatioDown": "Доля атаки: уменьшить",
	"controls.attackRatioUp": "Доля атаки: увеличить",
	"controls.press": "Нажмите клавишу…",
	"controls.unbound": "Не назначено",
	"controls.reset": "Сбросить клавиши",
	"controls.hint": "Esc — отмена, Backspace — снять клавишу",
	"hud.attack.increase": "Увеличить долю атаки",
	"settings.language": "Язык",
	"settings.category.general": "Игра",
	"settings.category.interface": "Интерфейс игры",
	"settings.category.advanced": "Дополнительно",
		"game_menu.title": "Меню",
		"game_menu.settings": "Настройки",
		"game_menu.exit": "Выйти из игры",
		"game_menu.exit_confirm": "Выйти из партии? Прогресс будет потерян.",
		"settings.category.graphics": "Графика",
		"settings.category.sound": "Звук",
		"settings.desc.general": "Язык и тема оформления.",
		"settings.desc.controls": "Клавиши для игры.",
		"settings.desc.interface": "Что показывается поверх карты.",
		"settings.desc.graphics": "Пресеты: «Качество», «Баланс», «Производительность».",
		"settings.desc.sound": "Громкость по категориям и пауза, когда окно скрыто.",
		"settings.desc.advanced": "Для опытных игроков и разработчиков.",
	"game.load.fail": "Не удалось загрузить игру",
	"menu.map.select": "Выберите карту",
	"menu.bots.select": "Сколько ботов?",
	"menu.speed.select": "Скорость игры?",
	"setting.select.wf@theme": "Тема",
	"setting.select.wf@debug-renderer": "Отладочные слои",
	"setting.select.wf@debug-renderer.title": "Отладочные слои",
	"setting.boolean.wf@hud-clock": "Показывать часы в игре",
	"setting.boolean.wf@map-sand": "Песчаная полоса у берега (только вид)",
	"setting.boolean.wf@map-depth": "Оттенки глубины воды (только вид)",
	"setting.boolean.wf@map-textures": "Текстуры на карте (только вид)",
	"setting.boolean.wf@map-texture-tint": "Тонирование территории поверх текстур (только вид)",
	"setting.string.wf@game-server": "Адрес сервера",
	"setting.string.wf@game-server.placeholder": "https://warfront.io",
};

/** UI strings that live outside the keyed dictionary (static HTML, buttons). */
export const uiStrings = {
	eng: {
		"menu.singleplayer": "Singleplayer",
		"bot.name": "Bot",
		"menu.playerName.placeholder": "Player Name",
		"menu.playerName.default": "UnknownPlayer",
		"menu.imprint": "Site Notice",
		"menu.privacy": "Privacy",
		"menu.news.label": "News",
		"menu.news.title.1": "Keys can be rebound",
		"menu.news.text.1": "Open Controls in the game settings.",
		"menu.news.title.2": "Multiplayer is in development",
		"menu.news.text.2": "Lobbies with live players are coming. For now, play with bots.",
		"menu.news.title.3": "Next: match epochs",
		"menu.news.text.3": "Supply lines: territory cut off from your capital loses income.",
		"menu.news.close": "Close",
		"lobby.title": "Create lobby",
		"lobby.start.counting": "Cancel · starts in {s} s",
		"lobby.start.starting": "Starting…",
		"loading.title": "Loading map…",
		"loading.hint": "The spawn-selection timer starts when the map is visible.",
		"lobby.map.random": "Random",
		"lobby.fair": "Fair sizes",
		"lobby.difficulty.easy": "Easy",
		"lobby.difficulty.medium": "Medium",
		"lobby.difficulty.hard": "Hard",
		"lobby.difficulty.impossible": "Impossible",
		"lobby.states": "States",
		"lobby.states.on": "On",
		"lobby.states.off": "Off",
		"lobby.nations.difficulty": "Difficulty",
		"lobby.states.hint": "The difficulty sets the bots and the states. States start on their own tiles of the map and grow and attack like players.",
		"lobby.mode": "Mode",
		"lobby.options": "Options",
		"lobby.players": "Players",
		"lobby.host": "host",
		"lobby.bots.count": "Bots: {count}",
		"lobby.summary": "{map} · bots {bots}",
		"lobby.back": "Back",
		"lobby.settings": "Lobby settings",
		"lobby.type.offline": "Offline",
		"lobby.type.private": "Private",
		"lobby.type.public": "Public",
		"lobby.type.offline.hint": "Only you and bots, on this device.",
		"lobby.map": "Map",
		"lobby.bots": "Bots",
		"lobby.speed": "Game speed",
		"lobby.difficulty": "States difficulty",
		"lobby.difficulty.standard": "Standard",
		"lobby.start": "Start game",
		"menu.menu": "Menu",
		"menu.player.label": "Player",
		"menu.mode.solo": "Singleplayer",
		"menu.mode.solo.meta": "1 player and bots",
		"menu.mode.lobby": "Lobby",
		"menu.create": "Create lobby",
		"menu.locked": "Coming soon: multiplayer",
		"menu.map.join": "Join",
		"menu.map.joinTitle": "Join the World lobby",
		"menu.skin": "Skin",
		"menu.mode.ffa": "FFA",
		"menu.mode.teams": "Teams",
		"menu.map.players": "players",
		"menu.map.empty": "Create a lobby to start a match.",
		"menu.account": "Account",
		"menu.live.title": "Lobby",
		"menu.live.running": "in progress",
		"menu.live.players": "players",
		"menu.live.bot": "Bot",
		"menu.joinLobby": "Join lobby",
		"menu.soon": "soon",
		"menu.drawer.home": "Home",
		"menu.drawer.lobbies": "Lobbies",
		"menu.drawer.settings": "Settings",
		"menu.drawer.close": "Close menu",
		"menu.drawer.community": "Community",
		"menu.drawer.source": "Source",
		"validation.name.invalid": "Name contains invalid characters.",
		"validation.name.short": "Name is too short (must be at least 3 characters).",
		"validation.name.long": "Name is too long (32 characters maximum).",
	},
	rus: {
		"menu.singleplayer": "Одиночная игра",
		"bot.name": "Бот",
		"menu.playerName.placeholder": "Имя игрока",
		"menu.playerName.default": "Безымянный игрок",
		"menu.imprint": "Об игре",
		"menu.privacy": "Конфиденциальность",
		"menu.news.label": "Новости",
		"menu.news.title.1": "Клавиши можно переназначить",
		"menu.news.text.1": "Откройте «Управление» в настройках игры.",
		"menu.news.title.2": "Мультиплеер в разработке",
		"menu.news.text.2": "Лобби с живыми игроками появятся позже, пока играйте с ботами.",
		"menu.news.title.3": "Дальше: эпохи матча",
		"menu.news.text.3": "Линии снабжения: территория без связи со столицей теряет доход.",
		"menu.news.close": "Закрыть",
		"lobby.title": "Создать лобби",
		"lobby.start.counting": "Отмена · старт через {s} с",
		"lobby.start.starting": "Запуск…",
		"loading.title": "Загрузка карты…",
		"loading.hint": "Таймер выбора места старта начнётся, когда карта откроется.",
		"lobby.map.random": "Случайно",
		"lobby.fair": "Честные размеры",
		"lobby.difficulty.easy": "Легко",
		"lobby.difficulty.medium": "Средне",
		"lobby.difficulty.hard": "Сложно",
		"lobby.difficulty.impossible": "Невозможно",
		"lobby.states": "Государства",
		"lobby.states.on": "Включены",
		"lobby.states.off": "Выключены",
		"lobby.nations.difficulty": "Сложность",
		"lobby.states.hint": "Сложность задаёт ботов и государства. Государства стартуют на своих клетках карты, растут и атакуют как игроки.",
		"lobby.mode": "Режим",
		"lobby.options": "Параметры",
		"lobby.players": "Игроки",
		"lobby.host": "хост",
		"lobby.bots.count": "Боты: {count}",
		"lobby.summary": "{map} · ботов {bots}",
		"lobby.back": "Назад",
		"lobby.settings": "Настройки лобби",
		"lobby.type.offline": "Оффлайн",
		"lobby.type.private": "Приватно",
		"lobby.type.public": "Публично",
		"lobby.type.offline.hint": "Только вы и боты, на этом устройстве.",
		"lobby.map": "Карта",
		"lobby.bots": "Боты",
		"lobby.speed": "Скорость игры",
		"lobby.difficulty": "Сложность государств",
		"lobby.difficulty.standard": "Обычная",
		"lobby.start": "Начать игру",
		"menu.menu": "Меню",
		"menu.player.label": "Игрок",
		"menu.mode.solo": "Одиночная игра",
		"menu.mode.solo.meta": "1 игрок и боты",
		"menu.mode.lobby": "Лобби",
		"menu.create": "Создать лобби",
		"menu.locked": "Скоро: мультиплеер",
		"menu.map.join": "Войти",
		"menu.map.joinTitle": "Вход в лобби World",
		"menu.skin": "Скин",
		"menu.mode.ffa": "FFA",
		"menu.mode.teams": "Команды",
		"menu.map.players": "игроков",
		"menu.map.empty": "Создайте лобби, чтобы начать матч.",
		"menu.account": "Аккаунт",
		"menu.live.title": "Лобби",
		"menu.live.running": "идёт игра",
		"menu.live.players": "игроков",
		"menu.live.bot": "Бот",
		"menu.joinLobby": "Войти в лобби",
		"menu.soon": "скоро",
		"menu.drawer.home": "Главная",
		"menu.drawer.lobbies": "Лобби",
		"menu.drawer.settings": "Настройки",
		"menu.drawer.close": "Закрыть меню",
		"menu.drawer.community": "Сообщество",
		"menu.drawer.source": "Исходный код",
		"validation.name.invalid": "Имя содержит недопустимые символы.",
		"validation.name.short": "Имя слишком короткое (минимум 3 символа).",
		"validation.name.long": "Имя слишком длинное (максимум 32 символа).",
	},
} as const;

export type LanguageCode = keyof typeof uiStrings;

/** Current UI language: saved choice → browser language → English. */
export function detectLanguage(): LanguageCode {
	try {
		const saved = window.localStorage.getItem("frontline-language");
		if (saved === "rus" || saved === "eng") return saved;
	} catch { /* localStorage unavailable */ }
	return (typeof navigator !== "undefined" && navigator.language?.toLowerCase().startsWith("ru")) ? "rus" : "eng";
}

export function applyLanguage(code: LanguageCode): void {
	currentLanguage = code;
	try { window.localStorage.setItem("frontline-language", code); } catch { /* ignore */ }
	if (code === "eng") {
		langData = {...eng};
		setLanguage("eng", {});
	} else {
		setLanguage("rus", rus);
	}
}

/** Translate a UI string (see {@link uiStrings}) in the current language. */
export function ui(key: keyof typeof uiStrings.eng): string {
	return uiStrings[currentLanguage][key] ?? uiStrings.eng[key];
}

let langData: Record<string, string>;
let langCode: string;
let numberFormat: Intl.NumberFormat;
let pluralRules: Intl.PluralRules;
let pluralRulesOrdinal: Intl.PluralRules;

setLanguage("eng", eng);
export let currentLanguage: LanguageCode = "eng";
{
	const initial = detectLanguage();
	if (initial === "rus") {
		currentLanguage = "rus";
		setLanguage("rus", rus);
	}
}

type LanguageKey<B> = (keyof B | { [K in keyof B]: K extends `${infer A}_${string}` ? A : never }[keyof B]) & string;
type Args<T extends LanguageKey<B>, B> = ImplicitArgs<T, B, { [K in ExtractArgsRecursive<T, B> as ExtractName<K>]: ExtractType<K> }, { [K in keyof B]: K extends `${T}_${infer A}` ? ExtractImplicit<A> : never }[keyof B]>;
type ImplicitArgs<T extends LanguageKey<B>, B, C, D> = T extends keyof B ? C | C & D : C & D;
type ExtractArgsRecursive<T extends LanguageKey<B>, B> = (T extends keyof B ? ExtractArgs<B[T]> : never) | { [K in keyof B]: K extends `${T}_${string}` ? ExtractArgs<B[K]> : never }[keyof B];
type ExtractArgs<T> = T extends `{{${infer A}}}${infer B}` ? A | ExtractArgs<B> : T extends `${string}${infer A}` ? ExtractArgs<A> : never;
type ExtractImplicit<T extends string> = T extends `${string}_${string}` ? {count: number, context: string} : T extends "zero" | "one" | "two" | "few" | "many" | "other" | "singular" ? {count: number} | {context: string} : {context: string};
type Trim<T> = T extends ` ${infer A}` ? Trim<A> : T extends `${infer A} ` ? Trim<A> : T;
type ExtractName<T extends string> = T extends `${infer A},${string}` ? Trim<A> : Trim<T>;
type ExtractType<T extends string> = T extends `${string},${infer A}` ? MatchType<Trim<A>> : string;
type MatchType<T extends string> = T extends "number" ? number : T;
type Example<T extends LanguageKey<B>, B> = T extends keyof B ? B[T] : { [K in keyof B]: K extends `${T}_${string}` ? B[K] : never }[keyof B];