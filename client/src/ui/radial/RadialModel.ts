/**
 * Radial menu model (no DOM): element tree, navigation stack, centre button, reopen cooldown.
 * Rules follow docs/RADIAL-MENU-REFERENCE-2026-10-18.md (sections 1.2, 3.2–3.6). The view (RadialMenu.ts) only draws
 * the current level and forwards taps here; every decision about what a tap does is made in this file, so it can be tested.
 */

/** One element of the menu. `children` opens a submenu; `run` is the action (the menu closes after it). */
export interface RadialNode {
	readonly id: string;
	readonly label: string;
	/** Short text for the tooltip (what the element does, or why it is unavailable). */
	readonly hint: string;
	readonly enabled: boolean;
	readonly children?: readonly RadialNode[];
	readonly run?: () => void;
}

/** Limits of the menu (reference defaults: maxNestedLevels 3, menuTransitionDuration 300, reopenCooldownMs 300). */
export const RADIAL_LIMITS = {
	/** Levels including the root: the root plus at most two submenus. */
	maxLevels: 3,
	transitionMs: 300,
	reopenCooldownMs: 300,
} as const;

/** What a tap did. The view redraws on "navigated" and "back", closes on "ran", and does nothing on "ignored". */
export type RadialOutcome = "ignored" | "navigated" | "back" | "ran";

export class RadialMenuModel {
	private open = false;
	private closedAt = Number.NEGATIVE_INFINITY;
	private transitionUntil = 0;
	/** levels[0] is the root list; each further entry is the submenu opened by parents[i-1]. */
	private levels: (readonly RadialNode[])[] = [];
	private parents: string[] = [];
	private center: RadialNode | null = null;

	isOpen(): boolean {
		return this.open;
	}

	/** Nesting depth: 0 at the root. */
	depth(): number {
		return this.levels.length - 1;
	}

	/** Elements of the level on screen (empty when closed). */
	items(): readonly RadialNode[] {
		return this.levels[this.levels.length - 1] ?? [];
	}

	/** Id of the element whose submenu is on screen, or null at the root (used to keep the parent highlighted). */
	parentId(): string | null {
		return this.parents[this.parents.length - 1] ?? null;
	}

	/** The centre button: "back" inside a submenu, otherwise its own action (default). */
	centerState(): "default" | "back" {
		return this.depth() > 0 ? "back" : "default";
	}

	centerNode(): RadialNode | null {
		return this.center;
	}

	/** Whether a transition between levels is running at `now` (taps are ignored meanwhile). */
	isTransitioning(now: number): boolean {
		return now < this.transitionUntil;
	}

	/** Whether the menu may open at `now` (not open, and the cooldown after the last close has passed). */
	canOpen(now: number): boolean {
		return !this.open && now - this.closedAt >= RADIAL_LIMITS.reopenCooldownMs;
	}

	/** Opens the root level. Returns false when the cooldown after the last close has not passed yet. */
	openMenu(items: readonly RadialNode[], center: RadialNode, now: number): boolean {
		if (!this.canOpen(now)) return false;
		this.open = true;
		this.levels = [items];
		this.parents = [];
		this.center = center;
		this.transitionUntil = 0;
		return true;
	}

	/** Closes the menu and starts the reopen cooldown. */
	closeMenu(now: number): void {
		if (!this.open) return;
		this.open = false;
		this.closedAt = now;
		this.levels = [];
		this.parents = [];
		this.center = null;
	}

	/**
	 * Replaces the elements with a newer state of the same tile (enabled flags can change while the menu is open).
	 * Submenus are rebuilt from their parent ids; a submenu whose parent is gone is closed.
	 */
	refresh(items: readonly RadialNode[], center: RadialNode): void {
		if (!this.open) return;
		let level: readonly RadialNode[] = items;
		const levels: (readonly RadialNode[])[] = [items];
		const parents: string[] = [];
		for (const parentId of this.parents) {
			const parent = level.find(n => n.id === parentId);
			if (!parent?.children) break;
			level = parent.children;
			levels.push(level);
			parents.push(parentId);
		}
		this.levels = levels;
		this.parents = parents;
		this.center = center;
	}

	/** A tap on an element of the current level. */
	select(id: string, now: number): RadialOutcome {
		if (!this.open || this.isTransitioning(now)) return "ignored";
		const node = this.items().find(n => n.id === id);
		if (!node || !node.enabled) return "ignored";
		if (node.children && node.children.length > 0) {
			if (this.levels.length >= RADIAL_LIMITS.maxLevels) return "ignored";
			this.levels.push(node.children);
			this.parents.push(node.id);
			this.transitionUntil = now + RADIAL_LIMITS.transitionMs;
			return "navigated";
		}
		if (node.run) {
			this.closeMenu(now);
			node.run();
			return "ran";
		}
		return "ignored";
	}

	/** A tap on the centre button: back inside a submenu, otherwise the centre action if it is available. */
	pressCenter(now: number): RadialOutcome {
		if (!this.open || this.isTransitioning(now)) return "ignored";
		if (this.depth() > 0) return this.back(now);
		const center = this.center;
		if (!center || !center.enabled || !center.run) return "ignored";
		this.closeMenu(now);
		center.run();
		return "ran";
	}

	/** Goes one level up (no-op at the root). */
	back(now: number): RadialOutcome {
		if (!this.open || this.depth() === 0 || this.isTransitioning(now)) return "ignored";
		this.levels.pop();
		this.parents.pop();
		this.transitionUntil = now + RADIAL_LIMITS.transitionMs;
		return "back";
	}
}
