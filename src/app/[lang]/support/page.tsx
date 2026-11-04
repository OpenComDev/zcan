import Link from "@/components/locale-link";
import { Panel } from "@/components/hud/panel";
import { pageMeta } from "@/lib/page-meta";

export function generateMetadata({ params }: { params: Promise<{ lang: string }> }) {
  return pageMeta(params, "/support", "support");
}

const MAIL = "info@zcan.dev";
const Mail = () => <a href={`mailto:${MAIL}`}>{MAIL}</a>;

// Support text for the iOS app (version 1.0, Build 2). Kept in English, matching the App Store listing.
export default function SupportPage() {
  return (
    <div className="grid gap-3">
      <Panel title="Support" meta={<span>Zcan for iPhone · 1.0 (Build 2)</span>} marks bodyClassName="p-5 sm:p-8">
        <header className="max-w-[72ch]">
          <p className="eyebrow text-accent">Zcan Support</p>
          <h1 className="display mt-3 text-[32px] text-fg sm:text-[44px]">How can we help?</h1>
          <p className="mt-4 text-[15px] leading-relaxed text-muted">
            Zcan brings private browsing, link cleaning, and photo metadata removal together on your iPhone.
          </p>
          <p className="mt-2 text-[13px] leading-relaxed text-muted">This support page covers Zcan: Private Browser &amp; Tools, version 1.0 (Build 2).</p>
          <p className="mt-5">
            <a href={`mailto:${MAIL}`} className="btn-accent inline-flex h-11 items-center px-5 text-[12px] uppercase tracking-wider">
              Contact us: {MAIL}
            </a>
          </p>
        </header>

        <article className="report mt-10 max-w-[72ch]">
          <h2 id="getting-started">Getting started</h2>

          <h3>Browse privately</h3>
          <ol>
            <li>Open Browse or tap Start private browsing on the Home screen.</li>
            <li>Enter an HTTPS website address or a search term.</li>
            <li>Use the tab button to add, switch between, or close private tabs.</li>
            <li>Tap the flame button to clear your private session.</li>
          </ol>
          <p>You can open up to eight tabs. Searches use DuckDuckGo.</p>

          <h3>Adjust browser protection</h3>
          <p>Tap Basic blocking in the browser to open protection settings.</p>
          <p>You can:</p>
          <ul>
            <li>Enable or disable basic tracker blocking for the current tab.</li>
            <li>Enable clearing all tabs when the app enters the background.</li>
            <li>See the domains included in the bundled blocking list.</li>
          </ul>
          <p>Basic blocking covers a limited list of third-party advertising and analytics domains. It cannot block every tracker.</p>

          <h3>Clean a link</h3>
          <ol>
            <li>Open Tools.</li>
            <li>Paste a full link into Clean a link.</li>
            <li>Tap Clean link.</li>
            <li>Review the result before copying or sharing it.</li>
          </ol>
          <p>The tool removes supported tracking parameters. It does not open the link or check whether the destination is safe.</p>

          <h3>Share a cleaner photo</h3>
          <ol>
            <li>Open Tools.</li>
            <li>Tap Choose a photo.</li>
            <li>Select an image using Apple’s photo picker.</li>
            <li>Share or save the processed JPEG copy.</li>
          </ol>
          <p>Processing happens on your iPhone. Your original photo remains unchanged.</p>
          <p>The new copy does not carry the original image’s metadata, but visible faces, signs, documents, and landmarks remain in the picture.</p>

          <h2 id="faq">Frequently asked questions</h2>

          <h3>Do I need an account?</h3>
          <p>No. The native browser and privacy tools work without a Zcan account.</p>

          <h3>Does this version include a VPN?</h3>
          <p>No. Version 1.0, Build 2 does not include VPN connectivity or device enrollment.</p>
          <p>Private browsing does not hide your IP address or change your location.</p>

          <h3>Does Zcan save my browsing history?</h3>
          <p>Zcan does not save browsing history or tabs for your next app launch. Tabs use temporary website storage.</p>
          <p>Websites and search providers may retain information they receive. Clearing your Zcan session does not delete their records.</p>

          <h3>What happens when I clear my session?</h3>
          <p>All private tabs close and their temporary website data is discarded. You may need to sign in again when you revisit a website.</p>
          <p>Copies of content you saved or shared outside Zcan are unaffected.</p>

          <h3>Why did all my tabs disappear?</h3>
          <p>
            If Clear all tabs in background is enabled, switching away from Zcan closes the tabs and clears their temporary website data.
          </p>
          <p>This setting lasts until the app restarts. Zcan also does not restore tabs after a fresh app launch.</p>

          <h3>Why won’t a website load?</h3>
          <p>Check that:</p>
          <ul>
            <li>Your iPhone has a working internet connection.</li>
            <li>
              The address begins with <code>https://</code>.
            </li>
            <li>The address is typed correctly.</li>
          </ul>
          <p>
            If a page appears broken, try turning off basic blocking for that tab and reloading. Some websites may not work with temporary storage or
            blocked third-party resources.
          </p>

          <h3>Why was nothing removed from my link?</h3>
          <p>The link may not contain a tracking parameter supported by the cleaner. An unchanged link does not mean the destination is private or safe.</p>

          <h3>Does photo cleaning change the original?</h3>
          <p>No. Zcan creates a separate JPEG copy.</p>
          <p>
            Conversion may reduce quality and does not preserve Live Photo motion, animation, or HDR. The tool does not blur or remove anything
            visible in the image.
          </p>

          <h3>Are my links or photos uploaded?</h3>
          <p>The link-cleaning and photo-conversion tools run on your device. Zcan does not upload their inputs to its servers.</p>
          <p>If you share a result, the destination app or recipient receives the content you choose to send.</p>

          <h3>How do I request deletion of my information?</h3>
          <p>The native app has no Zcan account to delete. Clear your browser session to discard its temporary website data.</p>
          <p>
            For deletion of support emails you have sent us, contact <Mail />.
          </p>

          <h2 id="report-a-problem">Report a problem</h2>
          <p>
            Email <Mail /> with:
          </p>
          <ul>
            <li>Your iPhone model.</li>
            <li>Your iOS version.</li>
            <li>The Zcan version and build number.</li>
            <li>The steps that caused the problem.</li>
            <li>Any error message you saw.</li>
            <li>A screenshot, if useful, with personal information removed.</li>
          </ul>
          <p>
            Please do not include passwords, private keys, sensitive photos, or private browsing details. Use an example link or non-sensitive image
            when possible.
          </p>

          <h2 id="privacy-questions">Privacy questions</h2>
          <p>
            To ask about how Zcan handles information or to make a privacy request, email <Mail />.
          </p>
          <p>
            <Link href="/legal/website/privacy-policy">Read the Privacy Policy</Link>
          </p>
        </article>
      </Panel>
    </div>
  );
}
