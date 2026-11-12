import { expect, it } from 'vite-plus/test';
import { DEMOS } from '../../src/lib/demos.js';

// The text a pill shows is what the server's checks found. The Prometheus pill
// counts the queries Prometheus answered, an answer with no data included.

it('counts the queries Prometheus answered, not the ones with data', () => {
	const describe = DEMOS.find((tab) => tab.id === 'prometheus')!.describe!;
	const proofs = [
		{ answered: true, value: 5 },
		{ answered: true, value: null },
		{ answered: true, value: Number.NaN },
		{ answered: false, value: null }
	];
	expect(describe({ proofs })).toBe('3 of 4 queries answered');
});
