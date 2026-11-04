import { AddressChecker } from "@/components/tools/address-checker";
import { ToolIntro } from "@/components/tools/tool-ui";
import { T } from "@/lib/i18n";
import { pageMeta } from "@/lib/page-meta";

export function generateMetadata({ params }: { params: Promise<{ lang: string }> }) {
  return pageMeta(params, "/tools/address", "address");
}

export default function AddressPage() {
  return (
    <div className="grid gap-3">
      <ToolIntro title={<T k="shell.tool.address" />}>
        <p>
          <T k="tools.addr.intro" />
        </p>
      </ToolIntro>
      <AddressChecker />
    </div>
  );
}
