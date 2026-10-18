import {describe, test} from "node:test";
import {equal, ok, deepEqual} from "node:assert";
import {RADIAL_LIMITS, RadialMenuModel, type RadialNode} from "../../src/ui/radial/RadialModel";

/** A plain element for tests; `calls` records the actions that ran. */
function leaf(id: string, calls: string[], enabled = true): RadialNode {
	return {id, label: id, hint: "", enabled, run: () => { calls.push(id); }};
}

function submenu(id: string, children: RadialNode[]): RadialNode {
	return {id, label: id, hint: "", enabled: true, children};
}

describe("RadialMenuModel: opening and closing", () => {
	test("opens the root level and reports the default centre state", () => {
		const m = new RadialMenuModel();
		const calls: string[] = [];
		const center = leaf("attack", calls);
		ok(m.openMenu([leaf("a", calls), leaf("b", calls)], center, 1000));
		equal(m.isOpen(), true);
		equal(m.depth(), 0);
		deepEqual(m.items().map(n => n.id), ["a", "b"]);
		equal(m.centerState(), "default");
		equal(m.centerNode(), center);
	});

	test("a second open while open is refused", () => {
		const m = new RadialMenuModel();
		const calls: string[] = [];
		ok(m.openMenu([leaf("a", calls)], leaf("c", calls), 0));
		equal(m.openMenu([leaf("x", calls)], leaf("c", calls), 0), false);
		deepEqual(m.items().map(n => n.id), ["a"]);
	});

	test("reopen cooldown: 300 ms after a close", () => {
		const m = new RadialMenuModel();
		const calls: string[] = [];
		ok(m.openMenu([leaf("a", calls)], leaf("c", calls), 1000));
		m.closeMenu(2000);
		equal(m.canOpen(2000 + RADIAL_LIMITS.reopenCooldownMs - 1), false);
		equal(m.openMenu([leaf("a", calls)], leaf("c", calls), 2000 + RADIAL_LIMITS.reopenCooldownMs - 1), false);
		ok(m.openMenu([leaf("a", calls)], leaf("c", calls), 2000 + RADIAL_LIMITS.reopenCooldownMs));
	});

	test("closing twice does not move the cooldown", () => {
		const m = new RadialMenuModel();
		const calls: string[] = [];
		ok(m.openMenu([leaf("a", calls)], leaf("c", calls), 0));
		m.closeMenu(500);
		m.closeMenu(9000);
		ok(m.canOpen(500 + RADIAL_LIMITS.reopenCooldownMs));
	});
});

describe("RadialMenuModel: taps on elements", () => {
	test("a disabled element does nothing", () => {
		const m = new RadialMenuModel();
		const calls: string[] = [];
		ok(m.openMenu([leaf("off", calls, false)], leaf("c", calls), 0));
		equal(m.select("off", 0), "ignored");
		deepEqual(calls, []);
		equal(m.isOpen(), true);
	});

	test("an action runs once and closes the menu", () => {
		const m = new RadialMenuModel();
		const calls: string[] = [];
		ok(m.openMenu([leaf("a", calls), leaf("b", calls)], leaf("c", calls), 0));
		equal(m.select("b", 0), "ran");
		deepEqual(calls, ["b"]);
		equal(m.isOpen(), false);
	});

	test("an unknown id is ignored", () => {
		const m = new RadialMenuModel();
		const calls: string[] = [];
		ok(m.openMenu([leaf("a", calls)], leaf("c", calls), 0));
		equal(m.select("zzz", 0), "ignored");
		deepEqual(calls, []);
	});

	test("taps while closed are ignored", () => {
		const m = new RadialMenuModel();
		equal(m.select("a", 0), "ignored");
		equal(m.pressCenter(0), "ignored");
		equal(m.back(0), "ignored");
	});
});

describe("RadialMenuModel: submenus and levels", () => {
	const calls: string[] = [];
	const tree = () => [
		submenu("attack", [leaf("land", calls), leaf("sea", calls)]),
		leaf("info", calls, false),
	];

	test("a submenu opens a level, and the centre button becomes 'back'", () => {
		const m = new RadialMenuModel();
		ok(m.openMenu(tree(), leaf("c", calls), 0));
		equal(m.select("attack", 0), "navigated");
		equal(m.depth(), 1);
		equal(m.parentId(), "attack");
		equal(m.centerState(), "back");
		deepEqual(m.items().map(n => n.id), ["land", "sea"]);
	});

	test("taps during the transition are ignored; after 300 ms they work", () => {
		const m = new RadialMenuModel();
		ok(m.openMenu(tree(), leaf("c", calls), 0));
		m.select("attack", 1000);
		equal(m.isTransitioning(1000 + RADIAL_LIMITS.transitionMs - 1), true);
		equal(m.select("land", 1000 + RADIAL_LIMITS.transitionMs - 1), "ignored");
		equal(m.isTransitioning(1000 + RADIAL_LIMITS.transitionMs), false);
		equal(m.back(1000 + RADIAL_LIMITS.transitionMs), "back");
	});

	test("the centre button goes back one level inside a submenu", () => {
		const m = new RadialMenuModel();
		ok(m.openMenu(tree(), leaf("c", calls), 0));
		m.select("attack", 0);
		equal(m.pressCenter(RADIAL_LIMITS.transitionMs), "back");
		equal(m.depth(), 0);
		equal(m.parentId(), null);
		equal(m.isOpen(), true);
	});

	test("the nesting limit: root plus two submenus, a third level is refused", () => {
		const m = new RadialMenuModel();
		const deep: RadialNode = submenu("l1", [submenu("l2", [leaf("l3", calls)])]);
		ok(m.openMenu([submenu("l0", [deep])], leaf("c", calls), 0));
		let now = 0;
		equal(m.select("l0", now), "navigated");
		now += RADIAL_LIMITS.transitionMs;
		equal(m.select("l1", now), "navigated");
		now += RADIAL_LIMITS.transitionMs;
		equal(m.depth(), RADIAL_LIMITS.maxLevels - 1);
		equal(m.select("l2", now), "ignored");
		equal(m.depth(), RADIAL_LIMITS.maxLevels - 1);
	});

	test("a leaf inside a submenu runs and closes", () => {
		const m = new RadialMenuModel();
		const local: string[] = [];
		ok(m.openMenu([submenu("p", [leaf("q", local)])], leaf("c", local), 0));
		m.select("p", 0);
		equal(m.select("q", RADIAL_LIMITS.transitionMs), "ran");
		deepEqual(local, ["q"]);
		equal(m.isOpen(), false);
	});

	test("back at the root is ignored", () => {
		const m = new RadialMenuModel();
		ok(m.openMenu(tree(), leaf("c", calls), 0));
		equal(m.back(0), "ignored");
		equal(m.depth(), 0);
	});
});

describe("RadialMenuModel: centre button at the root", () => {
	test("runs its action when it is available", () => {
		const m = new RadialMenuModel();
		const calls: string[] = [];
		ok(m.openMenu([leaf("a", calls)], leaf("attack", calls), 0));
		equal(m.pressCenter(0), "ran");
		deepEqual(calls, ["attack"]);
		equal(m.isOpen(), false);
	});

	test("does nothing when it is unavailable", () => {
		const m = new RadialMenuModel();
		const calls: string[] = [];
		ok(m.openMenu([leaf("a", calls)], leaf("attack", calls, false), 0));
		equal(m.pressCenter(0), "ignored");
		deepEqual(calls, []);
		equal(m.isOpen(), true);
	});
});

describe("RadialMenuModel: refresh while open", () => {
	test("enabled flags are updated in place", () => {
		const m = new RadialMenuModel();
		const calls: string[] = [];
		ok(m.openMenu([leaf("a", calls, false)], leaf("c", calls, false), 0));
		m.refresh([leaf("a", calls, true)], leaf("c", calls, true));
		equal(m.items()[0].enabled, true);
		equal(m.select("a", 0), "ran");
	});

	test("a submenu is rebuilt from its parent id", () => {
		const m = new RadialMenuModel();
		const calls: string[] = [];
		ok(m.openMenu([submenu("p", [leaf("old", calls)])], leaf("c", calls), 0));
		m.select("p", 0);
		m.refresh([submenu("p", [leaf("new", calls)])], leaf("c", calls));
		equal(m.depth(), 1);
		deepEqual(m.items().map(n => n.id), ["new"]);
	});

	test("a submenu whose parent disappeared returns to the root", () => {
		const m = new RadialMenuModel();
		const calls: string[] = [];
		ok(m.openMenu([submenu("p", [leaf("x", calls)])], leaf("c", calls), 0));
		m.select("p", 0);
		m.refresh([leaf("other", calls)], leaf("c", calls));
		equal(m.depth(), 0);
		deepEqual(m.items().map(n => n.id), ["other"]);
	});

	test("refresh of a closed menu changes nothing", () => {
		const m = new RadialMenuModel();
		m.refresh([leaf("a", [])], leaf("c", []));
		equal(m.isOpen(), false);
		deepEqual(m.items(), []);
	});
});
