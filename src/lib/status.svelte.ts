import { createContext } from 'svelte';
import { runCheck, type CheckOptions, type CheckState } from './check.js';

export interface Entry {
	state: CheckState;
	detail: string;
	data: Record<string, unknown> | null;
	/** When the answer arrived in this browser, for a live age. */
	at: number;
}

const UNCHECKED: Entry = { state: 'unchecked', detail: '', data: null, at: 0 };

/** One entry per integration, shared by the tab pills and the panels. */
export class StatusBoard {
	entries = $state<Record<string, Entry>>({});

	get(key: string): Entry {
		return this.entries[key] ?? UNCHECKED;
	}

	async run(key: string, url: string, options: CheckOptions = {}): Promise<void> {
		this.entries[key] = { state: 'checking', detail: '', data: null, at: 0 };
		const result = await runCheck(url, options);
		this.entries[key] = { state: result.state, detail: result.detail, data: result.data, at: Date.now() };
	}
}

export interface SessionView {
	user: { id: string; email: string; name: string; emailVerified: boolean };
	expiresAt: string;
}

/** The signed-in user as the server sees it, shared by the Account, Email and ntfy panels. */
export class AccountState {
	loaded = $state(false);
	session = $state<SessionView | null>(null);
	problem = $state('');

	async refresh(): Promise<void> {
		const result = await runCheck('/auth/session');
		this.loaded = true;
		if (result.state === 'failed' || !result.data) {
			this.session = null;
			this.problem = result.detail;
			return;
		}
		this.problem = '';
		this.session = (result.data.session as SessionView | null) ?? null;
	}
}

export interface PageState {
	board: StatusBoard;
	account: AccountState;
}

export const [getPage, setPage] = createContext<PageState>();
