import { PrivateSend } from "@/components/send/private-send";
import { T } from "@/lib/i18n";
import { pageMeta } from "@/lib/page-meta";

export function generateMetadata({ params }: { params: Promise<{ lang: string }> }) {
  return pageMeta(params, "/send", "send");
}

export default function SendPage() {
  return (
    <>
      <h1 className="sr-only">
        <T k="send.title" />
      </h1>
      <PrivateSend />
    </>
  );
}
