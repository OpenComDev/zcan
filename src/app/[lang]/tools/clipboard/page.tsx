import { ClipboardGuard } from "@/components/tools/clipboard-guard";
import { ToolIntro } from "@/components/tools/tool-ui";
import { T } from "@/lib/i18n";
import { pageMeta } from "@/lib/page-meta";

export function generateMetadata({ params }: { params: Promise<{ lang: string }> }) {
  return pageMeta(params, "/tools/clipboard", "clipboard");
}

export default function ClipboardPage() {
  return (
    <div className="grid gap-3">
      <ToolIntro title={<T k="shell.tool.clipboard" />}>
        <p>
          <T k="tools.clip.intro" />
        </p>
      </ToolIntro>
      <ClipboardGuard />
    </div>
  );
}
