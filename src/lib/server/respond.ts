import { json } from './http.js';

export const unavailable = (what: string) => json({ success: false, error: `${what} not configured` }, 503);
