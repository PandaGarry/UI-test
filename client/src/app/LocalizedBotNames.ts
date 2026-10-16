import {ui} from "../platform/Lang";
import {setBotNameFormatter} from "@frontline/core/game/bot/BotNames";

// Localized bot names: the simulation asks for a name, the client decides how it reads.
setBotNameFormatter(id => `${ui("bot.name")} ${id}`);
