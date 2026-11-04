import { Globe, House, Info, Lock, Shield, SlidersHorizontal, ArrowRight, Image as ImageIcon, Link2, Eye } from "lucide-react";
import { T } from "@/lib/i18n";

type Screen = "browser" | "tools";

/** iPhone frame showing a Zcan app screen, as in the brand film. Static illustration. */
export function PhoneMockup({ screen, className = "" }: { screen: Screen; className?: string }) {
  return (
    <div
      // A device illustration: always the dark app, whatever the page theme.
      data-theme="dark"
      className={`relative mx-auto w-[280px] rounded-[46px] border border-fg/15 bg-[#0b0b0d] p-2.5 shadow-[0_40px_120px_-30px_rgba(0,0,0,0.9),0_0_0_1px_rgba(255,255,255,0.04)_inset] ${className}`}
      aria-hidden
    >
      <div className="relative h-[560px] overflow-hidden rounded-[38px] bg-[#111114]">
        {/* status bar */}
        <div className="flex items-center justify-between px-7 pt-4 text-[12px] font-semibold text-fg">
          <span>09:41</span>
          <span className="h-[22px] w-[84px] rounded-full bg-black" />
          <span className="flex items-center gap-1">
            <span className="h-2.5 w-4 rounded-[3px] border border-fg/70">
              <span className="block h-full w-3 rounded-[2px] bg-green" />
            </span>
          </span>
        </div>

        {screen === "browser" ? <BrowserScreen /> : <ToolsScreen />}

        {/* tab bar */}
        <div className="absolute inset-x-3 bottom-3 flex items-center justify-around rounded-[22px] border border-fg/10 bg-[#1a1a1e]/95 px-2 py-2 text-[9px] text-zinc-400">
          {[
            { id: "home", icon: House },
            { id: "browse", icon: Globe, on: screen === "browser" },
            { id: "vpn", icon: Shield },
            { id: "tools", icon: SlidersHorizontal, on: screen === "tools" },
            { id: "about", icon: Info },
          ].map(({ id, icon: Icon, on }) => (
            <span key={id} className={`flex min-w-0 flex-col items-center gap-0.5 rounded-xl px-1.5 py-1 ${on ? "bg-accent/15 text-accent" : ""}`}>
              <Icon size={16} />
              <span className="max-w-[44px] truncate">{id === "vpn" ? "VPN" : <T k={`misc.phone.tab.${id}`} />}</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function BrowserScreen() {
  return (
    <div className="px-4 pt-5">
      <p className="text-center text-[13px] font-semibold text-fg">
        <T k="misc.app.browser.title" />
      </p>
      <div className="mt-3 flex items-center gap-2 rounded-xl bg-[#1d1d22] px-3 py-2 text-[11px] text-zinc-500">
        <Lock size={12} className="text-accent" />
        <span className="min-w-0 flex-1 truncate">
          <T k="misc.phone.searchBar" />
        </span>
        <span className="flex size-5 items-center justify-center rounded-full bg-accent text-accent-ink">
          <ArrowRight size={11} />
        </span>
      </div>
      <div className="mt-1.5 flex justify-between px-1 text-[9px] text-zinc-500">
        <span className="flex items-center gap-1">
          <Eye size={9} /> <T k="misc.phone.tempSession" />
        </span>
        <span className="flex items-center gap-1">
          <Shield size={9} /> <T k="misc.phone.blockingOn" />
        </span>
      </div>
      <div className="mt-16 flex flex-col items-center text-center">
        <span className="flex size-12 items-center justify-center rounded-full border border-accent/60 text-accent">
          <Globe size={24} />
        </span>
        <p className="mt-4 text-[17px] font-bold tracking-tight text-fg">
          <T k="misc.app.headline" />
        </p>
        <p className="mt-2 px-2 text-[11px] leading-relaxed text-zinc-400">
          <T k="misc.phone.browseBody" />
        </p>
        <p className="mt-3 px-3 text-[9px] leading-relaxed text-zinc-500">
          <T k="misc.phone.browseNote" />
        </p>
      </div>
    </div>
  );
}

function ToolsScreen() {
  return (
    <div className="px-4 pt-6">
      <p className="text-[20px] font-bold tracking-tight text-fg">
        <T k="misc.app.tools.title" />
      </p>
      <p className="mt-1 font-mono text-[8px] uppercase tracking-[0.2em] text-accent">
        <T k="misc.phone.toolsTagline" />
      </p>
      <div className="mt-3 rounded-2xl bg-[#1a1a1e] p-3">
        <p className="flex items-center gap-1.5 text-[12px] font-semibold text-fg">
          <Link2 size={13} /> <T k="misc.phone.cleanLink" />
        </p>
        <p className="mt-1 text-[9.5px] leading-snug text-zinc-400">
          <T k="misc.phone.cleanLinkBody" />
        </p>
        <div className="mt-2 rounded-lg bg-[#111114] px-2 py-1.5 text-[9px] text-zinc-600">
          <T k="misc.phone.pasteLink" />
        </div>
        <span className="mt-2 inline-block rounded-full bg-accent px-2.5 py-1 text-[10px] font-medium text-accent-ink">
          <T k="misc.phone.cleanBtn" />
        </span>
      </div>
      <div className="mt-2.5 rounded-2xl bg-[#1a1a1e] p-3">
        <p className="flex items-center gap-1.5 text-[12px] font-semibold text-fg">
          <ImageIcon size={13} /> <T k="misc.phone.cleanPhoto" />
        </p>
        <p className="mt-1 text-[9.5px] leading-snug text-zinc-400">
          <T k="misc.phone.cleanPhotoBody" />
        </p>
        <span className="mt-2 inline-flex items-center gap-1 text-[10px] font-medium text-accent">
          <ImageIcon size={11} /> <T k="misc.phone.choosePhoto" />
        </span>
      </div>
    </div>
  );
}
