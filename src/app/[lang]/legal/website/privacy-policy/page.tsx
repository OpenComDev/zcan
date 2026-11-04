import { Panel } from "@/components/hud/panel";
import { pageMeta } from "@/lib/page-meta";

export function generateMetadata({ params }: { params: Promise<{ lang: string }> }) {
  return pageMeta(params, "/legal/website/privacy-policy", "privacy");
}

const MAIL = "info@zcan.dev";
const Mail = () => <a href={`mailto:${MAIL}`}>{MAIL}</a>;

// Legal text: kept verbatim and in English. Change it only with the policy's effective date.
export default function PrivacyPolicyPage() {
  return (
    <div className="grid gap-3">
      <Panel title="Legal" meta={<span>Effective October 19, 2026</span>} marks bodyClassName="p-5 sm:p-8">
        <header className="max-w-[72ch]">
          <p className="eyebrow text-accent">Zcan: Private Browser &amp; Tools</p>
          <h1 className="display mt-3 text-[32px] text-fg sm:text-[44px]">Privacy Policy</h1>
          <p className="mt-3 text-[13px] text-muted">
            Effective date: <time dateTime="2026-10-19">October 19, 2026</time>
          </p>
        </header>

        <article className="report mt-8 max-w-[72ch]">
          <p>
            Zcan is provided by ONETHOUSANDMILL TRADING. This policy explains how the Zcan iOS app handles information when you browse, clean links,
            process photos, or contact support.
          </p>
          <p>
            This policy applies to version 1.0, Build 2. The Zcan website, web-based services, and earlier VPN-enabled test builds are outside its
            scope.
          </p>

          <h2 id="approach">1. Our approach to privacy</h2>
          <p>The app does not require a Zcan account. It contains no advertising or analytics SDKs and does not register your device with Zcan.</p>
          <p>
            This release does not include a VPN. It does not send device identifiers, browsing history, search history, links submitted to the link
            cleaner, or photos submitted to the photo tool to Zcan servers.
          </p>
          <p>Using private browsing does not make you anonymous or hide your IP address.</p>

          <h2 id="private-browsing">2. Private browsing</h2>
          <p>Zcan uses Apple’s WebKit browser technology. Each private tab uses separate, temporary website storage.</p>
          <p>
            Zcan does not save your tabs or browsing history for your next app launch. You can close individual tabs or clear your entire session to
            close all tabs and discard their temporary website data. You can also enable the option to clear all tabs when the app enters the
            background.
          </p>
          <p>
            Clearing a session does not delete information already received by websites, search providers, or other external services. It also does
            not remove files or information you have shared or saved outside Zcan.
          </p>
          <h3>Websites and search providers</h3>
          <p>
            When you visit a website, your device connects to that website and any resources it loads. Those services may receive your IP address,
            request details, and information you choose to provide.
          </p>
          <p>
            Searches entered into Zcan’s address bar are sent to DuckDuckGo. Its handling of those requests is described in the{" "}
            <a href="https://duckduckgo.com/privacy" target="_blank" rel="noopener noreferrer">
              DuckDuckGo Privacy Policy
            </a>
            .
          </p>
          <p>
            Websites you visit operate under their own privacy policies. Your internet provider and other network operators may also observe
            connection information.
          </p>
          <h3>Basic tracker blocking</h3>
          <p>
            Zcan includes a small, bundled list of advertising and analytics domains for blocking certain third-party requests. This list does not
            provide comprehensive protection and cannot block every tracker.
          </p>
          <p>You can turn basic blocking off for a tab if it interferes with a website.</p>

          <h2 id="link-cleaning">3. Link cleaning</h2>
          <p>
            The link cleaner processes the link you enter on your device. It removes supported tracking parameters without opening the link or
            uploading it to Zcan.
          </p>
          <p>
            Cleaning a link does not establish that its destination is safe or remove every possible identifier. Review the resulting link before
            sharing or opening it.
          </p>
          <p>If you copy or share a cleaned link, the destination app or recipient handles it under its own privacy practices.</p>

          <h2 id="photo-processing">4. Photo processing</h2>
          <p>
            Zcan uses Apple’s photo picker to let you choose a photo. Photo conversion takes place on your device; Zcan does not upload the selected
            image to its servers.
          </p>
          <p>
            The tool creates a JPEG copy without copying the original image’s metadata, including source EXIF, GPS, and IPTC metadata. Your original
            photo remains unchanged.
          </p>
          <p>
            Conversion can change image quality and does not preserve animation, Live Photo motion, or HDR. Removing metadata does not remove
            identifying information visible in the image, such as faces, signs, documents, or landmarks.
          </p>
          <p>When you share or save a processed image, the app, service, or recipient you choose handles that copy under its own privacy practices.</p>

          <h2 id="support">5. Support correspondence</h2>
          <p>
            If you email <Mail />, we receive your email address, message, and any attachments you choose to send.
          </p>
          <p>
            We use this information to respond to your request, investigate reported problems, and maintain relevant support records. Our email
            service providers process correspondence to deliver and store these messages.
          </p>
          <p>
            We retain support correspondence for as long as reasonably necessary to handle the request and meet applicable legal obligations. You can
            request deletion by contacting <Mail />.
          </p>
          <p>Please do not send passwords, private keys, payment credentials, or sensitive browsing information.</p>

          <h2 id="sharing">6. Sharing information</h2>
          <p>The app does not send your browsing activity, tool inputs, or device identifiers to Zcan for advertising or tracking.</p>
          <p>Information may leave your device when you:</p>
          <ul>
            <li>Visit a website or perform a search.</li>
            <li>Submit information to a website.</li>
            <li>Share a link or processed photo.</li>
            <li>Contact support.</li>
          </ul>
          <p>These actions send information to the destination you select or the service needed to complete your request.</p>
          <p>
            We may disclose support correspondence where necessary to comply with applicable law, respond to a valid legal request, or protect our
            legal rights.
          </p>

          <h2 id="choices">7. Your choices</h2>
          <p>You can:</p>
          <ul>
            <li>Close individual private tabs or clear the entire browser session.</li>
            <li>Enable clearing all tabs when the app enters the background.</li>
            <li>Turn basic tracker blocking on or off for a tab.</li>
            <li>Choose which photo to process.</li>
            <li>Decide whether to copy, save, or share a result.</li>
            <li>Contact us about access, correction, or deletion of support correspondence.</li>
          </ul>
          <p>
            Depending on where you live, you may have additional rights under applicable privacy laws. Contact us to make a request. We may need
            information reasonably necessary to verify and fulfil it.
          </p>

          <h2 id="security">8. Security and limitations</h2>
          <p>Zcan uses Apple’s platform features for browsing and photo selection. The browser supports HTTPS navigation.</p>
          <p>
            No app or internet connection can guarantee complete privacy or security. Temporary browsing storage and basic tracker blocking do not
            prevent websites, network operators, or recipients from retaining information they receive.
          </p>

          <h2 id="changes">9. Changes to this policy</h2>
          <p>
            We may update this policy when the app’s features or information-handling practices change. We will publish the revised policy with a new
            effective date and provide additional notice where required.
          </p>

          <h2 id="contact">10. Contact</h2>
          <p>ONETHOUSANDMILL TRADING</p>
          <p>
            For privacy questions or requests: <Mail />
          </p>
        </article>
      </Panel>
    </div>
  );
}
