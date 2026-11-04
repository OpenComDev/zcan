"use client";

import Link from "@/components/locale-link";
import { Bell, Menu, Search, X } from "lucide-react";
import { Suspense, useEffect, useState, type ReactNode } from "react";
import { useHistory } from "@/lib/history";
import { isFinal } from "@/lib/status";
import { useClock, useLatency } from "@/lib/telemetry";
import { formatUsd } from "@/lib/tokens";
import { useOrderWatcher } from "@/lib/use-order-watcher";
import { useLiveStatus } from "@/lib/live-prices";
import { useZecLive } from "@/lib/use-zec-live";
import { useRoutePath, useT } from "@/lib/i18n";
import { Ticker } from "../hud/ticker";
import { LogoMark } from "../logo";
import { Sparkline } from "../hud/sparkline";
import { ScheduleWatcher } from "../agents/schedule-watcher";
import { AlertWatcher } from "../alerts/alert-watcher";
import { OnboardingTour } from "../onboarding/tour";
import { RecurringWatcher } from "../recurring/recurring-watcher";
import { SOURCE_URL } from "@/lib/source";
import { EmptyState, emptySecondary } from "../onboarding/empty-state";
import { InstallButton } from "../pwa/install-button";
import { AlertFeed, FeedList } from "./alert-feed";
import { CommandPalette } from "./command-palette";
import { SettingsMenu, SettingsPanel } from "./settings-menu";
import { NAV, NAV_GROUPS, crumbs, isActive } from "./nav";
import { AI_MODEL_NAME } from "@/lib/ai-model";

const TOP = 56; // top bar height

const X_HANDLE = "@zcan";
const X_URL = "https://x.com/zcan";

/** The X (formerly Twitter) mark; lucide-react ships no brand logos. */
function XLogo() {
  return (
    <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" aria-hidden>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [palette, setPalette] = useState(false);
  const [feed, setFeed] = useState(false);
  const [menu, setMenu] = useState(false);
  const t = useT();
  useOrderWatcher();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette((p) => !p);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <TopBar onSearch={() => setPalette(true)} onAlerts={() => setFeed(true)} onMenu={() => setMenu((m) => !m)} menuOpen={menu} />
      {menu && <MobileMenu onClose={() => setMenu(false)} />}
      <div className="mx-auto flex w-full max-w-[1680px] gap-3 px-3 pb-24 pt-3 lg:pb-6">
        <Sidebar onAlerts={() => setFeed(true)} />
        <main id="main" className="min-w-0 flex-1">
          {children}
          <footer className="mt-6 border-t border-line pt-4">
            <p className="micro leading-relaxed">{t("shell.footer", { model: AI_MODEL_NAME })}</p>
            <nav aria-label={t("shell.footerNav")} className="micro mt-2 flex flex-wrap gap-x-4 gap-y-1">
              <Link href="/support" className="hover:text-fg">
                {t("shell.crumb.support")}
              </Link>
              <Link href="/legal/website/privacy-policy" className="hover:text-fg">
                {t("shell.crumb.privacy")}
              </Link>
              <Link href="/security" className="hover:text-fg">
                {t("shell.crumb.security")}
              </Link>
              <Link href="/transparency" className="hover:text-fg">
                {t("shell.crumb.transparency")}
              </Link>
              <Link href="/refer" className="hover:text-fg">
                {t("shell.crumb.refer")}
              </Link>
              <a href={SOURCE_URL} target="_blank" rel="noreferrer" className="hover:text-fg">
                {t("shell.source")}
              </a>
              <a href="mailto:info@zcan.dev" className="hover:text-fg">
                info@zcan.dev
              </a>
            </nav>
          </footer>
        </main>
      </div>
      <TabBar />
      <CommandPalette open={palette} onClose={() => setPalette(false)} />
      <AlertFeed open={feed} onClose={() => setFeed(false)} />
      <ScheduleWatcher />
      <AlertWatcher />
      <OnboardingTour />
      <RecurringWatcher />
    </>
  );
}

/* ---------------- top bar ---------------- */

function TopBar({ onSearch, onAlerts, onMenu, menuOpen }: { onSearch: () => void; onAlerts: () => void; onMenu: () => void; menuOpen: boolean }) {
  const history = useHistory();
  const active = history.filter((h) => !isFinal(h.status)).length;
  const t = useT();

  return (
    <header
      className="sticky top-0 z-40 border-b border-line bg-bg/95 pt-[env(safe-area-inset-top)] backdrop-blur supports-[backdrop-filter]:bg-bg/80"
      style={{ height: `calc(${TOP}px + env(safe-area-inset-top))` }}
    >
      <div className="mx-auto flex h-14 max-w-[1680px] items-center gap-4 px-4">
        <span className="hidden items-center gap-2 lg:flex" aria-hidden>
          <span className="size-3 rounded-full bg-[#ff5f57]" />
          <span className="size-3 rounded-full bg-[#febc2e]" />
          <span className="size-3 rounded-full bg-[#28c840]" />
        </span>
        <Link href="/" className="flex items-center gap-2 lg:hidden" aria-label={t("shell.home")}>
          <LogoMark size={26} />
        </Link>
        <nav aria-label="Breadcrumb" className="min-w-0 flex-1 truncate text-[13px] lg:pl-4">
          <Suspense fallback={<span className="text-muted">Zcan</span>}>
            <Breadcrumbs />
          </Suspense>
        </nav>

        <Status />

        <button
          type="button"
          onClick={onSearch}
          className="hidden h-9 w-60 items-center gap-2 border border-line bg-surface px-3 text-[12px] uppercase tracking-wider text-subtle transition-colors hover:border-line-strong hover:text-muted md:flex"
        >
          <Search size={14} aria-hidden />
          <span className="flex-1 text-left">{t("shell.search")}</span>
          <kbd className="micro">⌘K</kbd>
        </button>
        <button type="button" onClick={onSearch} aria-label={t("shell.searchLabel")} className="inline-flex size-10 items-center justify-center border border-line text-muted md:hidden">
          <Search size={16} />
        </button>

        <div className="hidden md:block">
          <SettingsMenu />
        </div>
        <InstallButton />

        <a
          href={X_URL}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={t("shell.xLabel", { handle: X_HANDLE })}
          className="inline-flex h-9 min-w-9 items-center justify-center gap-2 border border-line px-2.5 text-[12px] font-medium text-muted transition-colors hover:border-line-strong hover:text-fg sm:px-3"
        >
          <XLogo />
          <span className="hidden sm:inline" translate="no">
            {X_HANDLE}
          </span>
        </a>

        <button
          type="button"
          onClick={onAlerts}
          aria-label={t("shell.ordersActive", { n: active })}
          className={`inline-flex h-9 items-center gap-2 px-3 text-[12px] font-medium uppercase tracking-wider transition-colors ${
            active ? "btn-accent" : "border border-line text-muted hover:border-line-strong hover:text-fg"
          }`}
        >
          <Bell size={14} aria-hidden />
          <span className="hidden sm:inline">{t("shell.orders")}</span>
          <span className="tabular">· {active}</span>
        </button>

        <button
          type="button"
          onClick={onMenu}
          aria-label={menuOpen ? t("shell.closeMenu") : t("shell.openMenu")}
          aria-expanded={menuOpen}
          className="inline-flex size-10 items-center justify-center border border-line text-muted lg:hidden"
        >
          {menuOpen ? <X size={16} /> : <Menu size={16} />}
        </button>
      </div>
    </header>
  );
}

function Breadcrumbs() {
  const t = useT();
  const parts = crumbs(useRoutePath(), t);
  return (
    <ol className="flex min-w-0 items-center">
      {parts.map((p, i) => (
        <li key={i} className={`truncate ${i === parts.length - 1 ? "text-fg" : "text-muted"}`}>
          {i > 0 && <span className="text-subtle">/</span>}
          {p}
        </li>
      ))}
    </ol>
  );
}

const clockFmt = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });

function Status() {
  const now = useClock();
  const latency = useLatency();
  const t = useT();
  let offset = "";
  if (now !== null) {
    const m = -new Date(now * 1000).getTimezoneOffset();
    offset = `UTC${m >= 0 ? "+" : "-"}${Math.floor(Math.abs(m) / 60)}${m % 60 ? `:${String(Math.abs(m) % 60).padStart(2, "0")}` : ""}`;
  }
  return (
    <div className="tabular hidden items-center gap-5 text-[12px] text-text xl:flex">
      <FeedStatus />
      <span>{now === null ? "--:--:--" : `${clockFmt.format(now * 1000)} ${offset}`}</span>
      <span>
        {t("shell.latency")}: <span className={latency !== null && latency > 800 ? "text-warn" : ""}>{latency === null ? "—" : `${latency}ms`}</span>
      </span>
    </div>
  );
}

/** Real-time market feed connection state. */
function FeedStatus() {
  const status = useLiveStatus();
  const live = status === "live";
  const t = useT();
  return (
    <span className={`flex items-center gap-1.5 uppercase tracking-wider ${live ? "text-accent" : "text-subtle"}`} title={t("shell.feedTitle")}>
      <span className={`size-1.5 rounded-full ${live ? "bg-accent pulse-dot" : "bg-subtle"}`} aria-hidden />
      {live ? t("common.live") : status === "reconnecting" ? t("shell.reconnecting") : t("shell.connecting")}
    </span>
  );
}

/* ---------------- sidebar ---------------- */

function NavLinks({ pathname, onNavigate, dense }: { pathname?: string; onNavigate?: () => void; dense?: boolean }) {
  const t = useT();
  return (
    <div className={dense ? "grid gap-px bg-line" : "space-y-3"}>
      {NAV_GROUPS.map((g) => (
        <div key={g} className={dense ? "bg-surface" : ""}>
          <p className={`micro px-4 ${dense ? "pb-1 pt-3" : "pb-1"}`}>{t(`shell.group.${g}`)}</p>
          <ul className={dense ? "grid grid-cols-2" : "space-y-0.5"}>
            {NAV.filter((n) => n.group === g).map((n) => {
              const on = pathname !== undefined && isActive(n.href, pathname);
              return (
                <li key={n.href}>
                  <Link
                    href={n.href}
                    onClick={onNavigate}
                    aria-current={on ? "page" : undefined}
                    className={`group flex h-10 items-center gap-3 px-4 text-[13px] uppercase tracking-wider transition-colors ${
                      on ? "bg-surface-2 text-fg" : "text-muted hover:bg-surface-2/60 hover:text-fg"
                    }`}
                  >
                    <span className={`h-4 w-0.5 ${on ? "bg-accent" : "bg-transparent"}`} aria-hidden />
                    {t(`shell.nav.${n.id}`)}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

function ActiveNav(props: { onNavigate?: () => void; dense?: boolean }) {
  return <NavLinks pathname={useRoutePath()} {...props} />;
}

function Sidebar({ onAlerts }: { onAlerts: () => void }) {
  const history = useHistory();
  const zec = useZecLive();
  const change = zec.change ?? 0;
  const t = useT();

  return (
    <aside
      className="panel sticky hidden w-[280px] shrink-0 flex-col overflow-y-auto lg:flex"
      style={{ top: TOP + 12, height: `calc(100dvh - ${TOP + 24}px)` }}
      aria-label={t("shell.sidebar")}
    >
      <div className="flex items-center justify-between px-5 py-5">
        <Link href="/" className="text-[18px] font-medium tracking-wide text-fg">
          [ZCAN]
        </Link>
        <LogoMark size={26} />
      </div>
      <nav aria-label={t("shell.mainNav")}>
        <Suspense fallback={<NavLinks />}>
          <ActiveNav />
        </Suspense>
      </nav>

      <div className="hatch mx-4 my-5 h-3 border-y border-line" aria-hidden />

      <div className="px-4">
        <div className="mb-2 flex items-center justify-between">
          <p className="label">{t("shell.orders")}</p>
          {history.length > 0 && (
            <button type="button" onClick={onAlerts} className="micro hover:text-fg">
              {t("shell.viewAll", { n: history.length })}
            </button>
          )}
        </div>
        {history.length === 0 ? (
          <EmptyState
            compact
            className="border border-dashed border-line"
            icon={<Bell size={16} />}
            title={t("shell.feedEmpty")}
            body={t("shell.noOrders")}
            actions={
              <Link href="/" className={emptySecondary}>
                {t("shell.startSwap")}
              </Link>
            }
          />
        ) : (
          <div className="-mx-1 border border-line">
            <FeedList entries={history} limit={4} />
          </div>
        )}
      </div>

      <div className="mt-auto border-t border-line p-4">
        <div className="flex items-center justify-between">
          <p className="label text-fg">ZEC / USD</p>
          <p className={`micro ${zec.live ? "text-accent" : ""}`}>{zec.live ? `● ${t("common.live")}` : "24H"}</p>
        </div>
        <div className="mt-2 flex items-end justify-between">
          <p className="num text-[30px] text-fg">
            <Ticker value={zec.price}>{zec.price != null ? formatUsd(zec.price) : "—"}</Ticker>
          </p>
          {zec.change != null && (
            <p className={`tabular text-[12px] ${change >= 0 ? "text-green" : "text-accent"}`}>
              {change >= 0 ? "+" : ""}
              {change.toFixed(2)}%
            </p>
          )}
        </div>
        <div className="mt-3 border border-line">
          {zec.error ? (
            <p className="micro px-3 py-6 text-center">{t("shell.historyUnavailable")}</p>
          ) : (
            <Sparkline values={zec.series} height={72} label={t("shell.sparkLabel")} />
          )}
        </div>
        <div className="micro mt-1.5 flex justify-between">
          <span>{t("shell.ago24h")}</span>
          <span>{t("common.now")}</span>
        </div>
      </div>
    </aside>
  );
}

/* ---------------- mobile ---------------- */

function MobileMenu({ onClose }: { onClose: () => void }) {
  const t = useT();
  return (
    <div
      className="fixed inset-x-0 z-30 max-h-[calc(100dvh-140px)] overflow-y-auto overscroll-contain border-b border-line bg-surface lg:hidden"
      style={{ top: `calc(${TOP}px + env(safe-area-inset-top))` }}
    >
      <nav aria-label={t("shell.mobileNav")}>
        <Suspense fallback={<NavLinks onNavigate={onClose} dense />}>
          <ActiveNav onNavigate={onClose} dense />
        </Suspense>
      </nav>
      <details className="border-t border-line md:hidden">
        <summary className="micro cursor-pointer px-4 py-3.5 hover:text-fg">{t("shell.settings.title")}</summary>
        <div className="border-t border-line">
          <SettingsPanel />
        </div>
      </details>
    </div>
  );
}

function TabBar() {
  const t = useT();
  return (
    <nav
      aria-label={t("shell.tabs")}
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden"
    >
      <Suspense fallback={<Tabs />}>
        <ActiveTabs />
      </Suspense>
    </nav>
  );
}

function ActiveTabs() {
  return <Tabs pathname={useRoutePath()} />;
}

function Tabs({ pathname }: { pathname?: string }) {
  const t = useT();
  return (
    <ul className="grid grid-cols-5">
      {NAV.filter((n) => n.tab).map((n) => {
        const on = pathname !== undefined && isActive(n.href, pathname);
        const Icon = n.icon;
        return (
          <li key={n.href}>
            <Link
              href={n.href}
              aria-current={on ? "page" : undefined}
              className={`flex h-14 flex-col items-center justify-center gap-1 text-[10px] uppercase tracking-wider ${on ? "text-accent" : "text-subtle"}`}
            >
              <Icon size={18} aria-hidden />
              <span className="max-w-full truncate px-1">{t(`shell.nav.${n.id}`)}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
