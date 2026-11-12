import { json, requireFormPost } from './http.js';
import { createLimiter } from './ratelimit.js';
import { requireVerifiedSession, type Session } from './session.js';

// Every route that writes, sends, spends or looks something up on request goes
// through here: the app's own sign-in, a form-encoded POST where the request
// changes anything (so the framework's origin check always applies), and a
// per-user limit.
const perUser = createLimiter({ points: 60, durationSeconds: 60 });

export async function guard(request: Request, options: { write?: boolean } = {}): Promise<{ session: Session } | { refusal: Response }> {
	if (options.write) {
		const notForm = requireFormPost(request);
		if (notForm) return { refusal: notForm };
	}
	const auth = await requireVerifiedSession(request);
	if ('refusal' in auth) return auth;
	const limited = await perUser.take(auth.session.user.id);
	if (limited) return { refusal: limited };
	return auth;
}

export const unavailable = (what: string) => json({ success: false, error: `${what} not configured` }, 503);
