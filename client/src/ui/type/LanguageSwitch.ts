import {buildContainer, type ContentField} from "./ContentField";
import {buildButton} from "./TextNode";
import {applyLanguage, currentLanguage, type LanguageCode} from "../../util/Lang";

//@module ui

/** Language names are shown in their own language, so they are not translated. */
const languages: {code: LanguageCode, label: string}[] = [
	{code: "rus", label: "Русский"},
	{code: "eng", label: "English"},
];

/**
 * RU/EN language switch. The choice is saved and the page reloads, so every
 * string (including static HTML and the map font) is rendered in the new language.
 */
export function buildLanguageSwitch(): ContentField {
	const container = buildContainer("grid", "grid-2col");
	for (const {code, label} of languages) {
		const button = buildButton(label, code === currentLanguage ? "primary" : "secondary");
		button.onClick(() => {
			if (code === currentLanguage) return;
			applyLanguage(code);
			window.location.reload();
		});
		container.add(button);
	}
	return container;
}
