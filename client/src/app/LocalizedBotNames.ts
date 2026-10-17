import {setBotNameFormatter} from "@frontline/core/game/bot/BotNames";
import {botDisplayName} from "./BotNameGenerator";

// Bot names: the simulation asks for a name, the client decides how it reads (see BotNameGenerator).
setBotNameFormatter(botDisplayName);
