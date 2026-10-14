import {describe, test} from "node:test";
import {notEqual, throws} from "node:assert";
import type {Transaction} from "../../src/game/transaction/Transaction";
import {getTransactionExecutors, registerTransactionType} from "../../src/game/transaction/TransactionExecutors";

// Minifiers can give different classes the same name; the registry must still keep them apart.
function classNamed(name: string): {prototype: Transaction} {
	const cls = class {};
	Object.defineProperty(cls, "name", {value: name});
	return cls as unknown as {prototype: Transaction};
}

describe("TransactionExecutors", () => {
	test("different classes with the same name do not collide", () => {
		const a = classNamed("e");
		const b = classNamed("e");
		registerTransactionType(a);
		registerTransactionType(b);
		notEqual(getTransactionExecutors(a), getTransactionExecutors(b));
	});

	test("registering the same class twice still throws", () => {
		const a = classNamed("Dup");
		registerTransactionType(a);
		throws(() => registerTransactionType(a));
	});
});
