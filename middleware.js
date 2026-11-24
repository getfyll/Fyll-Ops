// Vercel Routing Middleware: fyll.app and www.fyll.app show the marketing landing page at "/" and the
// free tools at "/tools/". Every other path on those hosts (tracking, payments, checkout links, dashboard
// redirects) and every other host (dashboard.fyll.app, track.fyll.app, ...) is untouched and served by the app.
// The pages live in public/landing/ (free tools in public/landing/tools/), copied to dist/landing/ by expo export.
export const config = { matcher: ['/', '/tools', '/tools/:path*', '/robots.txt', '/sitemap.xml'] };

const LANDING_HOSTS = new Set(['fyll.app', 'www.fyll.app']);

const rewrite = (request, path) => new Response(null, {
  headers: { 'x-middleware-rewrite': new URL(path, request.url).toString() },
});

export default function middleware(request) {
  const host = (request.headers.get('host') ?? '').toLowerCase().split(':')[0];
  if (!LANDING_HOSTS.has(host)) return undefined;

  const url = new URL(request.url);
  const path = url.pathname;

  // One address for search engines: www.fyll.app -> fyll.app for the marketing pages.
  if (host === 'www.fyll.app') {
    const target = new URL(request.url);
    target.host = 'fyll.app';
    return Response.redirect(target.toString(), 308);
  }

  if (path === '/') return rewrite(request, '/landing/index.html');
  if (path === '/robots.txt') return rewrite(request, '/landing/robots.txt');
  if (path === '/sitemap.xml') return rewrite(request, '/landing/sitemap.xml');

  // /tools -> /tools/ so the hub's relative links resolve under /tools/.
  if (path === '/tools') return Response.redirect(new URL('/tools/' + url.search, request.url), 308);
  if (path === '/tools/') return rewrite(request, '/landing/tools/index.html');

  // /tools/invoice-generator -> /landing/tools/invoice-generator.html (clean URLs; .html also works).
  const page = path.slice('/tools/'.length).replace(/\.html$/, '');
  if (/^[a-z0-9-]+$/.test(page)) return rewrite(request, `/landing/tools/${page}.html`);
  return undefined;
}
