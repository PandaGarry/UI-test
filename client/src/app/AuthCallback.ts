import {InvalidArgumentException} from "@frontline/core/util/Exceptions";
import {storeRefreshToken} from "../network/NetworkAuthenticator";
import {showUIElement} from "../ui/UIManager";
import {displayAlert} from "../ui/type/TextNode";

/**
 * Handles the authentication callback (route /auth). Lives in the app layer: it shows UI and stores the token.
 * @param params The URL parameters
 * @param _path The path
 * @throws InvalidArgumentException If the parameters are invalid
 */
export function handleAuthCallback(params: URLSearchParams, _path: string[]) {
	const token = params.get("token");
	const state = params.get("state");
	if (token === null) {
		throw new InvalidArgumentException("Missing token");
	}
	if (state === null || sessionStorage.getItem("authState") === null || state !== sessionStorage.getItem("authState")) {
		throw new InvalidArgumentException("State mismatch");
	}
	storeRefreshToken(token);
	sessionStorage.removeItem("authState");
	window.history.replaceState(null, "", "/");
	displayAlert("success", "Successfully logged in");
	showUIElement("MainMenu");
}
