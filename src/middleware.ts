import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';

/** Refreshes the Supabase session cookie and sends signed-out users to /login. */
// Website + sign-in pages are prebuilt per language; "/" is served from "/mr" (or the chosen language).
const SITE = new Set(['/', '/pricing', '/privacy', '/terms', '/login']);
const LANGS = new Set(['mr', 'hi', 'en']);

export async function middleware(request: NextRequest) {
  const path0 = request.nextUrl.pathname;
  if (SITE.has(path0)) {
    const c = request.cookies.get('poulgo_lang')?.value;
    const lang = c && LANGS.has(c) ? c : 'mr';
    const to = request.nextUrl.clone();
    to.pathname = `/${lang}${path0 === '/' ? '' : path0}`;
    return NextResponse.rewrite(to); // no session work at all for public pages
  }
  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  // Reads the session cookie and refreshes it only when it has expired (no network call otherwise).
  // This is just for routing: every page verifies the user again through the database (my_account).
  const { data } = await supabase.auth.getSession();
  const user = data?.session?.access_token ? true : null;

  const path = request.nextUrl.pathname;
  const isProtected = path === '/app' || path.startsWith('/app/') || path.startsWith('/driver') || path === '/change-password'
    || path === '/suspended' || path === '/no-access' || (path.startsWith('/admin') && !path.startsWith('/admin/login'));
  if (!user && isProtected) {
    const to = request.nextUrl.clone();
    to.pathname = path.startsWith('/admin') ? '/admin/login' : '/login';
    to.search = '';
    return NextResponse.redirect(to);
  }
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icons/|manifest.webmanifest|sw.js|.*\\.(?:png|svg|jpg|webp|ico)$).*)'],
};
