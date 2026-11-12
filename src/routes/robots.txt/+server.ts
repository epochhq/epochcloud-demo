import type { RequestHandler } from './$types';

// The demo is a showcase of the platform; crawlers may read the page but have
// no reason to call the live endpoints behind it.
export const GET: RequestHandler = () => new Response('User-agent: *\nAllow: /$\nDisallow: /\n', { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
