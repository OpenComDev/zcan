import { AgentPromo } from "@/components/agents/agent-promo";
import { Landing } from "@/components/landing/landing";
import { SwapView } from "@/components/swap/swap-view";
import { T } from "@/lib/i18n";

export default function Home() {
  return (
    <div className="grid gap-3">
      <h1 className="sr-only">
        <T k="swap.pageTitle" />
      </h1>
      <SwapView />
      <AgentPromo />
      <Landing />
    </div>
  );
}
