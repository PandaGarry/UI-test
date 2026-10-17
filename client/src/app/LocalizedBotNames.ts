import {setBotNameFormatter} from "@frontline/core/game/bot/BotNames";
import {currentLanguage} from "../platform/Lang";
import {botDisplayName} from "./BotNameGenerator";

// Bot names: the simulation asks for a name, the client decides how it reads (see BotNameGenerator).
// Country names follow the UI language at the moment a game starts bots.
setBotNameFormatter(id => botDisplayName(id, currentLanguage === "rus" ? "ru" : "en"));
