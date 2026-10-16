import {ui} from "../util/Lang";
import {setBotNameFormatter} from "../game/bot/BotNames";

// Localized bot names: the simulation asks for a name, the client decides how it reads.
setBotNameFormatter(id => `${ui("bot.name")} ${id}`);
