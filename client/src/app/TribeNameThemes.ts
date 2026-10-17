/**
 * Tribe / settlement name themes, ported from the reference game (OpenFrontIO, resources/tribeNameThemes.json).
 *
 * A name is a prefix + a suffix, for example "Roman Empire". Only the themes our maps use are ported:
 *   - default: ancient peoples and dynasties + political words (the reference's fallback theme, used for World);
 *   - europe: European peoples and dynasties (Europe map);
 *   - africa: African peoples and dynasties (Africa map).
 *
 * Russian lists (`ru`): the suffix stays a noun in the nominative and the prefix is the people / dynasty in the
 * genitive plural, so the phrase is grammatical without agreeing gender: "Империя римлян", "Династия Тюдоров",
 * "Королевство франков". Russian prefixes are therefore not adjectives.
 */

export type TribeNameList = {
	readonly prefixes: readonly string[];
	readonly suffixes: readonly string[];
};

export type TribeNameTheme = {
	readonly en: TribeNameList;
	readonly ru: TribeNameList;
};

export const TRIBE_NAME_THEMES: Readonly<Record<string, TribeNameTheme>> = {
	default: {
		en: {
			prefixes: ["Akkadian", "Babylonian", "Sumerian", "Hittite", "Phoenician", "Canaanite", "Minoan", "Mycenaean", "Etruscan", "Scythian", "Thracian", "Dacian", "Illyrian", "Median", "Chaldean", "Roman", "Greek", "Byzantine", "Persian", "Parthian", "Seleucid", "Ptolemaic", "Palmyrene", "Macedonian", "Carthaginian", "Ming", "Tang", "Song", "Yuan", "Mauryan", "Kushan", "Rajput", "Mughal", "Satavahana", "Vijayanagara", "Egyptian", "Nubian", "Kushite", "Aksumite", "Ethiopian", "Songhai", "Malian", "Ghanaian", "Benin", "Ashanti", "Zulu", "Tuareg", "Berber", "Kanem-Bornu", "Buganda", "Mossi", "Swahili", "Somali", "Wolof", "Umayyad", "Abbasid", "Ayyubid", "Fatimid", "Mamluk", "Seljuk", "Safavid", "Ottoman", "Almoravid", "Almohad", "Rashidun", "Ziyarid", "Frankish", "Visigothic", "Ostrogothic", "Viking", "Norman", "Saxon", "Anglo-Saxon", "Celtic", "Gaulish", "Carolingian", "Merovingian", "Capetian", "Plantagenet", "Tudor", "Stuart", "Habsburg", "Romanov", "Lancaster", "York", "Bourbon", "Napoleonic", "British", "French", "Spanish", "Portuguese", "Dutch", "Russian", "German", "Italian", "Swedish", "Norwegian", "Danish", "Polish", "Hungarian", "Austrian", "Swiss", "Czech", "Slovak", "Serbian", "Croatian", "Bosnian", "Montenegrin", "Bulgarian", "Romanian", "Apache", "Sioux", "Cherokee", "Navajo", "Iroquois", "Inuit", "Arawak", "Carib", "Taino", "Aztec", "Mayan", "Incan", "Mapuche", "Guarani", "Tupi", "Yanomami", "Zuni", "Hopi", "Kiowa", "Comanche", "Shoshone", "Japanese", "Ryukyu", "Ainu", "Cham", "Khmer", "Thai", "Vietnamese", "Burmese", "Balinese", "Malay", "Filipino", "Mongolian", "Korean", "Tibetan", "Manchu", "Uyghur", "Hmong", "Karen", "Pyu", "Hawaiian", "Fijian", "Tongan", "Samoan", "Maori", "Micronesian", "Hebrew", "Armenian", "Circassian", "Georgian", "Kurdish", "Turkic", "Kazakh", "Uzbek", "Kyrgyz", "Tajik", "Pashtun", "Baloch", "Afghan", "Kenyan", "Ugandan", "Bhutanese", "Latin", "Moldovan", "Militant", "Spartan"],
			suffixes: ["Empire", "Dynasty", "Kingdom", "Queendom", "Sultanate", "Confederation", "Union", "Republic", "Caliphate", "Dominion", "Realm", "State", "Federation", "Territory", "Commonwealth", "League", "Duchy", "Province", "Protectorate", "Colony", "Mandate", "Free State", "Canton", "Region", "Nation", "Assembly", "Hierarchy", "Archduchy", "Grand Duchy", "Metropolis", "Cluster", "Alliance", "Tribunal", "Council", "Confederacy", "Order", "Regime", "Syndicate", "Guild", "Corporation", "Patriarchy", "Matriarchy", "Legion", "Horde", "Clan", "Brotherhood", "Sisterhood", "Ascendancy", "Supremacy", "Tribe", "Army", "Dictatorship", "Country", "Oligarchy", "Monkdom", "Throng", "Host", "Area", "District", "Fief", "Wilderness", "Settlement", "Parliament", "Anarchy", "Democracy", "Autocracy"],
		},
		ru: {
			prefixes: ["аккадцев", "вавилонян", "шумеров", "хеттов", "финикийцев", "хананеев", "минойцев", "микенцев", "этрусков", "скифов", "фракийцев", "даков", "иллирийцев", "мидян", "халдеев", "римлян", "греков", "византийцев", "персов", "парфян", "селевкидов", "птолемеев", "пальмирцев", "македонцев", "карфагенян", "Мин", "Тан", "Сун", "Юань", "маурьев", "кушан", "раджпутов", "моголов", "сатавахан", "Виджаянагары", "египтян", "нубийцев", "кушитов", "аксумитов", "эфиопов", "сонгаев", "малийцев", "ганцев", "бенинцев", "ашанти", "зулусов", "туарегов", "берберов", "Канем-Борну", "буганды", "моси", "суахили", "сомалийцев", "волофов", "омейядов", "аббасидов", "айюбидов", "фатимидов", "мамлюков", "сельджуков", "сефевидов", "османов", "альморавидов", "альмохадов", "рашидунов", "зиядидов", "франков", "вестготов", "остготов", "викингов", "норманнов", "саксов", "англосаксов", "кельтов", "галлов", "Каролингов", "Меровингов", "Капетингов", "Плантагенетов", "Тюдоров", "Стюартов", "Габсбургов", "Романовых", "Ланкастеров", "Йорков", "Бурбонов", "Наполеона", "британцев", "французов", "испанцев", "португальцев", "голландцев", "русских", "немцев", "итальянцев", "шведов", "норвежцев", "датчан", "поляков", "венгров", "австрийцев", "швейцарцев", "чехов", "словаков", "сербов", "хорватов", "боснийцев", "черногорцев", "болгар", "румын", "апачей", "сиу", "чероки", "навахо", "ирокезов", "инуитов", "араваков", "карибов", "таино", "ацтеков", "майя", "инков", "мапуче", "гуарани", "тупи", "яномами", "зуни", "хопи", "кайова", "команчей", "шошонов", "японцев", "рюкюсцев", "айнов", "чамов", "кхмеров", "тайцев", "вьетнамцев", "бирманцев", "балийцев", "малайцев", "филиппинцев", "монголов", "корейцев", "тибетцев", "маньчжуров", "уйгуров", "хмонгов", "карен", "пью", "гавайцев", "фиджийцев", "тонганцев", "самоанцев", "маори", "микронезийцев", "иудеев", "армян", "черкесов", "грузин", "курдов", "тюрков", "казахов", "узбеков", "киргизов", "таджиков", "пуштунов", "белуджей", "афганцев", "кенийцев", "угандийцев", "бутанцев", "латинян", "молдаван", "бойцов", "спартанцев"],
			suffixes: ["Империя", "Династия", "Королевство", "Царство", "Султанат", "Конфедерация", "Союз", "Республика", "Халифат", "Владычество", "Держава", "Государство", "Федерация", "Территория", "Содружество", "Лига", "Герцогство", "Провинция", "Протекторат", "Колония", "Мандат", "Вольное государство", "Кантон", "Край", "Народ", "Собрание", "Иерархия", "Эрцгерцогство", "Великое герцогство", "Метрополия", "Скопление", "Альянс", "Трибунал", "Совет", "Коалиция", "Орден", "Режим", "Синдикат", "Гильдия", "Корпорация", "Патриархат", "Матриархат", "Легион", "Орда", "Клан", "Братство", "Сестринство", "Господство", "Верховенство", "Племя", "Армия", "Диктатура", "Страна", "Олигархия", "Монашество", "Толпа", "Войско", "Область", "Округ", "Вотчина", "Дикие земли", "Поселение", "Парламент", "Анархия", "Демократия", "Автократия"],
		},
	},
	europe: {
		en: {
			prefixes: ["Roman", "Greek", "Byzantine", "Frankish", "Visigothic", "Ostrogothic", "Viking", "Norman", "Saxon", "Anglo-Saxon", "Celtic", "Gaulish", "Carolingian", "Merovingian", "Capetian", "Plantagenet", "Tudor", "Stuart", "Habsburg", "Romanov", "Lancaster", "York", "Bourbon", "Napoleonic", "British", "French", "Spanish", "Portuguese", "Dutch", "Russian", "German", "Italian", "Swedish", "Norwegian", "Danish", "Polish", "Hungarian", "Austrian", "Swiss", "Czech", "Slovak", "Serbian", "Croatian", "Bosnian", "Montenegrin", "Bulgarian", "Romanian", "Finnish", "Estonian", "Latvian", "Lithuanian", "Irish", "Scottish", "Welsh", "Basque", "Galician", "Sardinian", "Sicilian", "Venetian", "Florentine", "Genoese", "Milanese", "Prussian", "Bavarian", "Teutonic", "Knights Templar", "Crusader", "Papal", "Holy Roman"],
			suffixes: ["Kingdom", "Empire", "Republic", "Duchy", "Grand Duchy", "Archduchy", "County", "Principality", "Barony", "Lordship", "March", "Shire", "Fief", "Realm", "Dominion", "Crown", "Dynasty", "House", "Order", "League", "Confederation", "Alliance", "Pact", "Union", "Federation", "Commonwealth", "State", "Nation", "Province", "Territory"],
		},
		ru: {
			prefixes: ["римлян", "греков", "византийцев", "франков", "вестготов", "остготов", "викингов", "норманнов", "саксов", "англосаксов", "кельтов", "галлов", "Каролингов", "Меровингов", "Капетингов", "Плантагенетов", "Тюдоров", "Стюартов", "Габсбургов", "Романовых", "Ланкастеров", "Йорков", "Бурбонов", "Наполеона", "британцев", "французов", "испанцев", "португальцев", "голландцев", "русских", "немцев", "итальянцев", "шведов", "норвежцев", "датчан", "поляков", "венгров", "австрийцев", "швейцарцев", "чехов", "словаков", "сербов", "хорватов", "боснийцев", "черногорцев", "болгар", "румын", "финнов", "эстонцев", "латышей", "литовцев", "ирландцев", "шотландцев", "валлийцев", "басков", "галисийцев", "сардинцев", "сицилийцев", "венецианцев", "флорентийцев", "генуэзцев", "миланцев", "пруссаков", "баварцев", "тевтонов", "тамплиеров", "крестоносцев", "папства", "ганзейцев"],
			suffixes: ["Королевство", "Империя", "Республика", "Герцогство", "Великое герцогство", "Эрцгерцогство", "Графство", "Княжество", "Баронство", "Владение", "Марка", "Земля", "Вотчина", "Держава", "Владычество", "Корона", "Династия", "Дом", "Орден", "Лига", "Конфедерация", "Альянс", "Пакт", "Союз", "Федерация", "Содружество", "Государство", "Народ", "Провинция", "Территория"],
		},
	},
	africa: {
		en: {
			prefixes: ["Egyptian", "Nubian", "Kushite", "Aksumite", "Ethiopian", "Songhai", "Malian", "Ghanaian", "Benin", "Ashanti", "Zulu", "Tuareg", "Berber", "Kanem-Bornu", "Buganda", "Mossi", "Swahili", "Somali", "Wolof", "Yoruba", "Igbo", "Hausa", "Fulani", "Maasai", "Kikuyu", "Shona", "Luba", "Lunda", "Kongo", "Lozi", "Tswana", "Sotho", "Xhosa", "Rwandan", "Burundian", "Baganda", "Bamileke", "Fang", "San", "Khoikhoi", "Merina", "Sakalava", "Betsileo", "Matabele", "Rozvi", "Mutapa"],
			suffixes: ["Empire", "Kingdom", "Sultanate", "Caliphate", "Dynasty", "Chiefdom", "Confederation", "Republic", "State", "Territory", "Province", "Region", "Nation", "Tribe", "Clan", "Alliance", "League", "Council", "Assembly", "Federation", "Union", "Dominion", "Realm", "Colony", "Protectorate"],
		},
		ru: {
			prefixes: ["египтян", "нубийцев", "кушитов", "аксумитов", "эфиопов", "сонгаев", "малийцев", "ганцев", "бенинцев", "ашанти", "зулусов", "туарегов", "берберов", "Канем-Борну", "буганды", "моси", "суахили", "сомалийцев", "волофов", "йоруба", "игбо", "хауса", "фулани", "масаев", "кикуйю", "шона", "луба", "лунда", "конго", "лози", "тсвана", "сото", "коса", "руандийцев", "бурундийцев", "баганда", "бамилеке", "фанг", "сан", "кхойкхой", "мерина", "сакалава", "бетсилео", "матабеле", "роцви", "мутапа"],
			suffixes: ["Империя", "Королевство", "Султанат", "Халифат", "Династия", "Вождество", "Конфедерация", "Республика", "Государство", "Территория", "Провинция", "Край", "Народ", "Племя", "Клан", "Альянс", "Лига", "Совет", "Собрание", "Федерация", "Союз", "Владычество", "Держава", "Колония", "Протекторат"],
		},
	},
};

/** Theme ids for each map (the reference's `themes` field); a map without an entry uses "default". */
const MAP_THEMES: Readonly<Record<string, readonly string[]>> = {
	Europe: ["europe"],
	Africa: ["africa"],
};

export function themesForMap(mapId: string): readonly string[] {
	return MAP_THEMES[mapId] ?? ["default"];
}
