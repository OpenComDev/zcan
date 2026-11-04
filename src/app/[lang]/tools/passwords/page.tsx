import { PasswordCheck } from "@/components/tools/password-check";
import { ToolIntro } from "@/components/tools/tool-ui";
import { T } from "@/lib/i18n";
import { pageMeta } from "@/lib/page-meta";

export function generateMetadata({ params }: { params: Promise<{ lang: string }> }) {
  return pageMeta(params, "/tools/passwords", "passwords");
}

export default function PasswordsPage() {
  return (
    <div className="grid gap-3">
      <ToolIntro title={<T k="shell.tool.passwords" />}>
        <p>
          <T k="tools.pw.intro" />
        </p>
      </ToolIntro>
      <PasswordCheck />
    </div>
  );
}
