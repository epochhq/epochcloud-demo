import { createAuthClient } from 'better-auth/client';

// BetterAuth client SDK - connects to standalone auth server
// Will be initialized when BETTERAUTH_URL is set
export function createAuth(baseURL: string) {
	return createAuthClient({
		baseURL
	});
}
