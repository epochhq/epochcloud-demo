import type { RequestHandler } from './$types';
import '#lib/server/checks.js';
import { snapshotResponse } from '#lib/server/snapshot.js';

// The server's latest check of one integration. It reads a stored result: the
// request itself calls nothing upstream.
export const GET: RequestHandler = ({ params }) => snapshotResponse(params.name);
