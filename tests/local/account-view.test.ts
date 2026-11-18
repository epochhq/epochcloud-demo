import { expect, it } from 'vite-plus/test';
import { createRawSnippet } from 'svelte';
import { render } from 'svelte/server';
import { AccountState } from '../../src/lib/status.svelte.js';
import SignInGate from '../../src/lib/components/SignInGate.svelte';
import BetterAuthDemo from '../../src/routes/components/demos/BetterAuthDemo.svelte';
import WithPage from './WithPage.svelte';

// What the Account tab and the gate show in each state of the session.

function account(state: 'out' | 'unconfirmed' | 'in'): AccountState {
	const a = new AccountState();
	a.loaded = true;
	if (state === 'unconfirmed') a.pending = 'new@example.test';
	if (state === 'in') a.session = { user: { id: 'u', email: 'in@example.test', name: 'Visitor', emailVerified: true }, expiresAt: '2030-01-01T00:00:00Z' };
	return a;
}

const page = (component: unknown, state: 'out' | 'unconfirmed' | 'in') =>
	render(WithPage, {
		props: { component: component as never, account: account(state), children: createRawSnippet(() => ({ render: () => '<p>the demo</p>' })) }
	}).body;

it('shows a signed-out visitor a sign-in form a password manager can fill, and a way to sign up', () => {
	const html = page(BetterAuthDemo, 'out');
	expect(html).toMatch(/<label[^>]*for="sign-in-email"/);
	expect(html).toMatch(/id="sign-in-email"[^>]*autocomplete="username"|autocomplete="username"[^>]*id="sign-in-email"/);
	expect(html).toContain('autocomplete="current-password"');
	expect(html).toContain('autocomplete="new-password"');
	expect(html).toContain('Create account');
	expect(html).not.toContain('Sign out');
});

it('tells a visitor with an unconfirmed address what to do and offers the mail again', () => {
	const html = page(BetterAuthDemo, 'unconfirmed');
	expect(html).toContain('new@example.test');
	expect(html).toContain('Send the mail again');
	expect(html).not.toContain('current-password');
});

it('shows who is signed in and a sign-out button', () => {
	const html = page(BetterAuthDemo, 'in');
	expect(html).toContain('Visitor');
	expect(html).toContain('Sign out');
	expect(html).not.toContain('current-password');
});

it('gives the gate a control that leads to the Account tab, and opens for a confirmed sign-in', () => {
	const out = page(SignInGate, 'out');
	expect(out).toMatch(/<button[^>]*>Sign in or create an account<\/button>/);
	expect(out).not.toContain('the demo');
	expect(page(SignInGate, 'in')).toContain('the demo');
});
