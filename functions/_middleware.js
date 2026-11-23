export async function onRequest({ request, next }) {
  const response = await next();
  const headers = new Headers(response.headers);
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', 'DENY');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  headers.set('Cross-Origin-Resource-Policy', 'same-origin');
  headers.set('Content-Security-Policy', "default-src 'self'; script-src 'self' https://challenges.cloudflare.com https://esm.sh; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' https://*.supabase.co https://esm.sh https://challenges.cloudflare.com https://servicodados.ibge.gov.br; frame-src https://challenges.cloudflare.com; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'");
  if (new URL(request.url).protocol === 'https:') {
    headers.set('Strict-Transport-Security', 'max-age=31536000');
  }
  const pathname = new URL(request.url).pathname;
  if (pathname.startsWith('/api/') || pathname === '/conta.html' || pathname === '/js/conta.js' || pathname === '/index.html' || pathname === '/js/app.js' || pathname === '/js/company-assessment-adapter.js' || pathname === '/company-assessments.html' || pathname === '/js/company-assessments-page.js') {
    headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
    headers.set('Pragma', 'no-cache');
    headers.set('Expires', '0');
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
