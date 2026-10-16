import {spawnPhaseRegistry} from "@frontline/core/game/Game";

// Draws the local spawn-phase countdown. The simulation only publishes the remaining time.
const spawnTimerElement = (() => {
	const el = document.createElement("div");
	el.id = "spawnPhaseTimer";
	el.style.cssText = "position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:50;padding:6px 14px;border-radius:8px;background:#1e3a52;color:#fff;font:600 14px sans-serif;display:none;pointer-events:none;";
	document.body.appendChild(el);
	return el;
})();

spawnPhaseRegistry.register(msLeft => {
	spawnTimerElement.style.display = msLeft > 0 ? "block" : "none";
	spawnTimerElement.textContent = `Выберите место старта · ${Math.ceil(msLeft / 1000)} с`;
});
