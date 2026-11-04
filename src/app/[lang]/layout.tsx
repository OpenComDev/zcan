import type { Metadata, Viewport } from "next";
import { Suspense, type ReactNode } from "react";
import { IBM_Plex_Mono, Inter } from "next/font/google";
import { notFound } from "next/navigation";
import { ThemeSync } from "@/components/prefs/theme-toggle";
import { RegisterSW } from "@/components/pwa/register-sw";
import { AppShell } from "@/components/shell/app-shell";
import { ClientBoot } from "@/components/shell/client-boot";
import { LocaleMigrate } from "@/components/shell/locale-migrate";
import { LocaleProvider, T } from "@/lib/i18n";
import { LOCALES, LOCALE_CODES, isLocale } from "@/lib/locales";
import { translate } from "@/lib/translate";
import { languageAlternates } from "@/lib/page-meta";
import "../globals.css";

// latin-ext and cyrillic cover Turkish and Russian pages (each subset only downloads when a page uses it).
const inter = Inter({ variable: "--font-inter", subsets: ["latin", "latin-ext", "cyrillic"], weight: ["300", "400", "500", "600"] });
const mono = IBM_Plex_Mono({ variable: "--font-plex-mono", subsets: ["latin", "latin-ext", "cyrillic"], weight: ["400", "500", "600"] });

/** One static copy of every page per language: /tools, /es/tools, /pt/tools… */
export function generateStaticParams() {
  return LOCALE_CODES.map((lang) => ({ lang }));
}

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  const l = isLocale(lang) ? lang : "en";
  const title = translate(l, "meta.site.title");
  const description = translate(l, "meta.site.desc");
  return {
    metadataBase: new URL("https://www.zcan.dev"),
    alternates: languageAlternates("/", l),
    keywords: ["Zcash", "ZEC", "private swap", "non-custodial", "NEAR Intents", "privacy tools", "privacy agents"],
    openGraph: {
      type: "website",
      siteName: "Zcan",
      url: l === "en" ? "/" : `/${l}`,
      title,
      description,
      locale: LOCALES.find((x) => x.code === l)?.og,
    },
    twitter: { card: "summary", site: "@zcan", title, description },
    title: { default: title, template: "%s · Zcan" },
    description,
    applicationName: "Zcan",
    appleWebApp: { capable: true, title: "Zcan", statusBarStyle: "default" },
    formatDetection: { telephone: false },
  };
}

// Browser-chrome colours per theme (match --bg in globals.css and THEME_COLORS in src/lib/theme.ts).
const THEME_DARK = "#050505";
const THEME_LIGHT = "#f6f5f2";

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: THEME_LIGHT },
    { media: "(prefers-color-scheme: dark)", color: THEME_DARK },
  ],
  colorScheme: "dark light",
};

/*
 * Render-blocking theme bootstrap: reads the saved choice (zcan:theme:v1 — see src/lib/theme.ts)
 * or the system preference and sets data-theme + color-scheme on <html> before first paint.
 * An explicit choice also pins the theme-color metas. <ThemeSync /> keeps it right afterwards.
 */
const THEME_SCRIPT = `(function(){try{var d=document.documentElement,p=null;try{p=localStorage.getItem("zcan:theme:v1")}catch(e){}if(p!=="light"&&p!=="dark")p=null;var t=p||(window.matchMedia&&window.matchMedia("(prefers-color-scheme: light)").matches?"light":"dark");d.setAttribute("data-theme",t);d.style.colorScheme=t;if(p){var c=t==="light"?"${THEME_LIGHT}":"${THEME_DARK}",f=function(){var m=document.querySelectorAll('meta[name="theme-color"]');for(var i=0;i<m.length;i++)m[i].setAttribute("content",c)};f();document.addEventListener("DOMContentLoaded",f)}}catch(e){}})();`;

/*
 * Every form in Zcan is handled by its own JavaScript; none posts to the server. Until the page has loaded
 * that JavaScript, a click on a submit button (or Enter) would make the browser submit natively, putting the
 * fields (a link being cleaned, a password being checked, an address) into the URL and the server's logs.
 * This capture-phase guard, set before anything renders, cancels native submission; React's own submit
 * handlers still run.
 */
const FORM_GUARD = `document.addEventListener("submit",function(e){e.preventDefault()},true);`;

export default async function RootLayout({ children, params }: { children: ReactNode; params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  return (
    <html lang={lang} className={`${inter.variable} ${mono.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT + FORM_GUARD }} />
      </head>
      <body className="min-h-full">
        <LocaleProvider locale={lang}>
          <a href="#main" className="btn-accent sr-only z-50 px-4 py-2 focus:not-sr-only focus:fixed focus:left-4 focus:top-4">
            <T k="common.skip" />
          </a>
          <AppShell>{children}</AppShell>
          <RegisterSW />
          <ThemeSync />
          <LocaleMigrate />
          {/* Reads the URL (usePathname), so it streams in after the static shell. */}
          <Suspense fallback={null}>
            <ClientBoot />
          </Suspense>
        </LocaleProvider>
      </body>
    </html>
  );
}
