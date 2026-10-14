import type {Setting, SettingCategory} from "../../util/settings/Setting";
import type {UIElement} from "../UIElement";
import {buildPanel, showPanel} from "../type/UIPanel";
import {buildContainer, type ContentField} from "../type/ContentField";
import {buildButton, buildIcon, buildParagraph, buildSectionHeader} from "../type/TextNode";
import {buildLanguageSwitch} from "../type/LanguageSwitch";
import {categoryGeneral} from "../../util/settings/UserSettingManager";
import {settingAddRegistry} from "../../util/settings/SettingRegistry";
import {buildCheckboxInput} from "../type/CheckboxInput";
import {buildSingleSelect} from "../type/SingleSelectElement";
import {BooleanSetting} from "../../util/settings/BooleanSetting";
import {AssertionFailedException} from "../../util/Exceptions";
import {SingleSelectSetting} from "../../util/settings/SingleSelectSetting";
import {StringSetting} from "../../util/settings/StringSetting";
import {buildValidatedInput} from "../type/ValidatedInput";
import {MultiSelectSetting, type Option} from "../../util/settings/MultiSelectSetting";
import {getUIElement} from "../UIManager";
import {tUnsafe} from "../../util/Lang";

//@module ui

const tabContainer = buildContainer("settings-tab-container");
const contentContainer = buildContainer("settings-category-container");
const categories = new Map<SettingCategory, ContentField>();
const categoryTabs = new Map<SettingCategory, ContentField>();

let currentCategory: SettingCategory | null = null;

buildPanel("SettingsPanel").setTitle(tUnsafe("settings.title")).addBodyClass("flex-row").add(tabContainer).add(contentContainer);

let settingTypeId = 0;
const types = new Map<number, (setting: Setting<unknown>) => UIElement>();
const pendingTypes: Setting<unknown>[] = [];

/**
 * Register a rendering function for a setting type.
 * @param type The setting type
 * @param builder The rendering function
 */
export function registerSettingType<T>(type: T extends Setting<infer _> ? { prototype: T } : never, builder: (setting: T) => UIElement) {
	const id = settingTypeId++;
	(type.prototype as Annotated<T>)["settingMagicRendererId"] = id;
	types.set(id, builder as (setting: Setting<unknown>) => UIElement);

	for (const setting of pendingTypes) {
		if ((setting as unknown as Annotated<T>)["settingMagicRendererId"] === id) {
			const category = setting.getCategory();
			if (!category) throw new AssertionFailedException("Setting has no category");
			const content = categories.get(category);
			if (!content) throw new AssertionFailedException("Category not found");
			content.add(builder(setting as T));
			pendingTypes.splice(pendingTypes.indexOf(setting), 1);
		}
	}
}

/**
 * Get the tab for a setting category.
 * @param category The category
 */
export function getSettingTab(category: SettingCategory) {
	return categories.get(category);
}

/**
 * Returns the content container of a settings category, creating its tab and section on first use.
 * Shared by the settings registry and by sections that are not backed by a setting (e.g. language).
 */
function ensureCategory(category: SettingCategory): ContentField {
	const existing = categories.get(category);
	if (existing) return existing;

	const content = buildContainer("settings-category").add(buildSectionHeader(tUnsafe(category.name)));
	contentContainer.add(content);

	const tab = buildContainer("settings-tab").add(buildIcon(category.icon ?? "close").setAttribute("tabindex", "0")).onClick(() => {
		if (currentCategory) {
			categories.get(currentCategory)?.getElement().classList.remove("settings-category-active");
			categoryTabs.get(currentCategory)?.getElement().classList.remove("settings-tab-active");
		}
		content.getElement().classList.add("settings-category-active");
		tab.getElement().classList.add("settings-tab-active");
		currentCategory = category;
	});
	tabContainer.add(tab);

	categories.set(category, content);
	categoryTabs.set(category, tab);
	if (!currentCategory) {
		currentCategory = category;
		content.getElement().classList.add("settings-category-active");
		tab.getElement().classList.add("settings-tab-active");
	}
	return content;
}

settingAddRegistry.register(setting => {
	const category = setting.getCategory();
	if (!category) return; // Settings without a category are not displayed
	ensureCategory(category);
});

// Language is not a registry setting (it is stored by Lang.ts); it is the first section of the General category.
ensureCategory(categoryGeneral).add(buildParagraph(tUnsafe("settings.language"))).add(buildLanguageSwitch());

const observer = new MutationObserver(() => {
	if (!currentCategory) return;
	const category = categories.get(currentCategory);
	if (!category || !category.getElement().checkVisibility()) return;

	const rowGap = parseFloat(getComputedStyle(category.getElement()).rowGap);
	const height = category.getChildren().reduce((sum, child) => sum + child.getClientHeight() + rowGap, 0);
	const halfHeight = category.getChildren().reduce((sum, child) => sum > height / 2 ? sum : sum + child.getClientHeight() + rowGap, 0);
	category.getElement().style.maxHeight = `${halfHeight + 5}px`;
});
observer.observe(getUIElement("SettingsPanel").getElement(), {childList: true, subtree: true, attributes: true, characterData: true});

type Annotated<T> = T & { settingMagicRendererId: number };