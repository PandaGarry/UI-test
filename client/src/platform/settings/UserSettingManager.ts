import type {Setting, SettingCategory} from "./Setting";
import type {DebugRendererLayer} from "../../renderer/layer/debug/DebugRenderer";
import type {GameTheme} from "../../renderer/GameTheme";
import {SettingRegistry} from "./SettingRegistry";
import {MultiSelectSetting} from "./MultiSelectSetting";
import {SingleSelectSetting} from "./SingleSelectSetting";
import {StringSetting} from "./StringSetting";
import {gameServerAddress} from "../Constants";

/**
 * Settings categories, in tab order. `name` is a translation key, resolved with tUnsafe when the panel is built;
 * the description uses the same key with `settings.desc.` instead of `settings.category.`.
 * `icon` is the CSS class suffix of the tab icon (`icon-section-<icon>`).
 */
export const categoryGeneral = {name: "settings.category.general", icon: "section-game"} as SettingCategory;
export const categoryControls = {name: "settings.category.controls", icon: "section-controls"} as SettingCategory;
export const interfaceGeneral = {name: "settings.category.interface", icon: "section-interface"} as SettingCategory;
/** Locked until the graphics presets exist (plan 2b.5). */
export const categoryGraphics = {name: "settings.category.graphics", icon: "section-graphics"} as SettingCategory;
/** Locked until game sound exists (plan 2b.6). */
export const categorySound = {name: "settings.category.sound", icon: "section-sound"} as SettingCategory;
export const categoryAdvanced = {name: "settings.category.advanced", icon: "section-advanced"} as SettingCategory;

/**
 * Setting registry, all register calls need to be chained together
 */
const registry = SettingRegistry.init("wf")
	.register("theme", new SingleSelectSetting<GameTheme>("pastel", categoryGeneral))
	.registerString("player-name", "UnknownPlayer", null) // placeholder, localized in MainMenu (menu.playerName.default)
	.registerString("keybinds", "{}", null) // player overrides only, see util/keybinds/KeybindModel.ts
	.registerBoolean("hud-clock", true, interfaceGeneral)
	.registerBoolean("map-sand", true, interfaceGeneral) // visual only: sand strip on coast cells (shore detail)
	.registerBoolean("map-depth", true, interfaceGeneral) // visual only: water depth bands (depth details)
	.register("game-server", StringSetting.asAddress(gameServerAddress, categoryAdvanced))
	.register("debug-renderer", MultiSelectSetting.init<DebugRendererLayer>(categoryAdvanced));

/**
 * Get a setting value
 * @param key identifier of the setting
 * @throws IllegalStateException if the setting has not been initialized
 */
export function getSetting<K extends SettingKey>(key: K): SettingType<K> {
	return registry.get(key).get() as SettingType<K>;
}

/**
 * Get a setting object
 * @param key identifier of the setting
 */
export function getSettingObject<K extends SettingKey>(key: K): typeof registry["registry"][K] {
	return registry.get(key);
}

/**
 * Update and save a setting value
 * @param key identifier of the setting
 * @param value new value
 */
export function updateSetting<K extends SettingKey>(key: K, value: SettingType<K>) {
	registry.get(key).set(value as never).save();
}

/**
 * Register a setting listener that will be called before the value is updated or initialized
 * @param key identifier of the setting
 * @param listener listener to register, argument is the new value of the setting
 */
export function registerSettingListener<K extends SettingKey>(key: K, listener: (value: SettingType<K>, obj: typeof registry["registry"][K]) => void) {
	registry.get(key).registerListener(listener as never);
}

export type SettingKey = keyof typeof registry["registry"];
export type SettingType<K extends SettingKey> = typeof registry["registry"][K] extends Setting<infer T> ? T : never;