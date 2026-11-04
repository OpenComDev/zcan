import type { LocaleCode, Messages } from "./types";
import { common } from "./common";
import { shell } from "./shell";
import { swap } from "./swap";
import { order } from "./order";
import { send } from "./send";
import { history } from "./history";
import { pay } from "./pay";
import { markets } from "./markets";
import { network } from "./network";
import { status } from "./status";
import { tools } from "./tools";
import { agents } from "./agents";
import { help } from "./help";
import { learn } from "./learn";
import { misc } from "./misc";
import { tools2 } from "./tools2";
import { docs } from "./docs";
import { landing } from "./landing";
import { onboarding } from "./onboarding";
import { prefs } from "./prefs";
import { recurring } from "./recurring";
import { perf } from "./perf";
import { trust } from "./trust";
import { agentkit } from "./agentkit";
import { meta } from "./meta";
import { guides } from "./guides";
import { share } from "./share";
import { refer } from "./refer";

export type Dict = Record<string, Record<string, string> | undefined>;

const NAMESPACES: Record<string, Messages> = { common, shell, swap, order, send, history, pay, markets, network, status, tools, agents, help, learn, misc, tools2, docs, landing, onboarding, prefs, recurring, perf, trust, agentkit, meta, guides, share, refer };

export const DICTS = Object.fromEntries(
  (["en", "es", "pt", "tr", "ru", "zh"] as LocaleCode[]).map((l) => [l, Object.fromEntries(Object.entries(NAMESPACES).map(([ns, m]) => [ns, m[l]]))]),
) as Record<LocaleCode, Dict>;
