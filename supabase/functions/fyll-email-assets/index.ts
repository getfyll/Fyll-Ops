import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const FIELD_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="1440" height="900" viewBox="0 0 1440 900">
  <defs>
    <filter id="grain" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="0.0035 0.009" numOctaves="4" seed="41" result="n" />
      <feColorMatrix in="n" type="matrix" values="0 0 0 0 0.52  0 0 0 0 0.62  0 0 0 0 0.05  0 0 0 1.4 -0.35" result="c" />
      <feComposite in="c" in2="SourceGraphic" operator="in" />
    </filter>
    <filter id="dust" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="turbulence" baseFrequency="0.85" numOctaves="2" seed="5" result="g" />
      <feColorMatrix in="g" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.08 0" />
    </filter>
    <linearGradient id="base" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#4a560a" />
      <stop offset="0.45" stop-color="#7b8a14" />
      <stop offset="0.8" stop-color="#2c3306" />
      <stop offset="1" stop-color="#1b1d10" />
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.4" r="0.6">
      <stop offset="0" stop-color="#d5e057" stop-opacity="0.8" />
      <stop offset="1" stop-color="#d5e057" stop-opacity="0" />
    </radialGradient>
  </defs>
  <rect width="1440" height="900" fill="url(#base)" />
  <rect width="1440" height="900" fill="url(#glow)" />
  <rect width="1440" height="900" fill="#d5e057" filter="url(#grain)" />
  <rect width="1440" height="900" filter="url(#dust)" />
</svg>`

serve((req) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return new Response('Method not allowed', { status: 405 })
  }

  return new Response(req.method === 'HEAD' ? null : FIELD_SVG, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Content-Type': 'image/svg+xml; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
    },
  })
})
