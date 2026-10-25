// Vercel Routing Middleware: fyll.app and www.fyll.app show the marketing landing page at "/".
// Every other path on those hosts (tracking, payments, checkout links, dashboard redirects) and every
// other host (dashboard.fyll.app, track.fyll.app, ...) is untouched and served by the app as before.
// The page itself is web/landing/, copied to dist/landing/ by scripts/vercel-build-web.sh.
export const config = { matcher: '/' };

const LANDING_HOSTS = new Set(['fyll.app', 'www.fyll.app']);

export default function middleware(request) {
  const host = (request.headers.get('host') ?? '').toLowerCase().split(':')[0];
  if (!LANDING_HOSTS.has(host)) return undefined;
  return new Response(null, {
    headers: { 'x-middleware-rewrite': new URL('/landing/index.html', request.url).toString() },
  });
}
