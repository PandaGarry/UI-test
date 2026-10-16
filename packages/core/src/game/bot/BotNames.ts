/**
 * Bot display names. The simulation uses a neutral default; the client registers a localized formatter at startup
 * (see app/LocalizedBotNames.ts). Same pattern as the command channel: the simulation never translates text.
 */
let formatter: (id: number) => string = id => `Bot ${id}`;

export function setBotNameFormatter(next: (id: number) => string): void {
	formatter = next;
}

export function botName(id: number): string {
	return formatter(id);
}
