/**
 * Relation classes between two players, from the relation value -100..100 (reference PlayerImpl.relationFromValue).
 * Hostile below -50, Distrustful below 0, Neutral below 50, Friendly from 50 on. Ids follow the reference enum.
 */
export enum Relation {
	Hostile = 0,
	Distrustful = 1,
	Neutral = 2,
	Friendly = 3,
}

export function relationFromValue(value: number): Relation {
	if (value < -50) return Relation.Hostile;
	if (value < 0) return Relation.Distrustful;
	if (value < 50) return Relation.Neutral;
	return Relation.Friendly;
}
