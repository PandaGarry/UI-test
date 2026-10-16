import type {Transaction} from "./Transaction";
import {InvalidArgumentException} from "../../util/Exceptions";

/**
 * Executors are keyed by the class object itself, not by `type.name`:
 * minifiers rename classes (several different classes may end up with the same
 * short name), so name-based keys collide in production builds.
 */
const pool = new Map<unknown, ((this: Transaction) => void)[]>();

/**
 * Register a transaction executor.
 * @param type The type of transaction
 * @param executor The executor to register
 * @throws InvalidArgumentException if the type is unknown
 */
export function registerTransactionExecutor<T extends Transaction>(type: { prototype: T }, executor: (this: T) => void) {
	const executors = pool.get(type);
	if (!executors) {
		throw new InvalidArgumentException(`Unknown transaction type: ${type.prototype.constructor.name}`);
	}
	executors.push(executor as (this: Transaction) => void);
}

/**
 * Register a transaction type to the pool.
 * @param type The type of transaction
 * @throws InvalidArgumentException if the type is already registered
 */
export function registerTransactionType<T extends Transaction>(type: { prototype: T }) {
	if (pool.has(type)) {
		throw new InvalidArgumentException(`Transaction type already registered: ${type.prototype.constructor.name}`);
	}
	pool.set(type, []);
}

/**
 * Get the transaction executors for the given type.
 * @param type The type of transaction
 * @returns The transaction executors
 */
export function getTransactionExecutors<T extends Transaction>(type: { prototype: T }): ((this: T) => void)[] {
	return pool.get(type) ?? [];
}
