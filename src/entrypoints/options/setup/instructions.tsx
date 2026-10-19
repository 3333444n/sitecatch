/**
 * Step-by-step Notion instructions shown in the wizard. Labels were checked
 * against Notion's docs in October 2026:
 *   https://developers.notion.com/guides/get-started/personal-access-tokens
 *   https://developers.notion.com/guides/get-started/internal-connections
 *   https://www.notion.com/help/add-and-manage-connections-with-the-api
 * Keep docs/setup-guide.md in sync when changing these.
 */
import { Banner, ExternalLink, ScreenshotSlot } from '@/ui/components';
import {
  NOTION_CONNECTION_DOCS_URL,
  NOTION_CONNECTIONS_URL,
  NOTION_HELP_CONNECTIONS_URL,
  NOTION_PAT_DOCS_URL,
  NOTION_PAT_URL,
  setupShot,
} from '../lib/constants';

export function CreatePatInstructions() {
  return (
    <div class="sco-instructions">
      <ol class="sco-steps-list">
        <li>
          Open <strong>Personal access tokens</strong> in Notion’s Developer portal:{' '}
          <ExternalLink href={NOTION_PAT_URL}>notion.so/developers/tokens</ExternalLink>. Sign in if Notion asks.
        </li>
        <li>
          Select <strong>New token</strong>.
        </li>
        <li>
          Fill in the form:
          <ul>
            <li>
              <strong>Name</strong>: <code>Sitecatch</code>, so you recognize it later.
            </li>
            <li>
              <strong>Capabilities</strong>: keep <strong>Notion API</strong> (read, create, update and search content).{' '}
              <strong>Workers</strong> isn’t needed.
            </li>
            <li>
              <strong>Expiration</strong>: 7 days, 30 days, 90 days, 180 days or 1 year. Longer means you paste a new
              token less often. The form shows the exact expiry date.
            </li>
            <li>
              If a <strong>workspace picker</strong> appears, choose the workspace that holds your databases.
            </li>
          </ul>
        </li>
        <li>
          Select <strong>Create token</strong>, then <strong>copy the token right away</strong>.
        </li>
      </ol>
      <Banner tone="warning" title="Notion shows the token only once" live={false}>
        Copy it before closing the dialog. If you lose it, revoke it in the Developer portal and create a new one. Treat
        it like a password: anyone with it can read and edit what you can.
      </Banner>
      <p class="sco-muted">
        Can’t select <strong>New token</strong>? Your workspace may restrict personal access tokens (on Free plans only
        workspace owners can create them; on Business and Enterprise, admins decide). Ask an admin, or go back and use
        an internal connection instead. <ExternalLink href={NOTION_PAT_DOCS_URL}>Notion’s guide</ExternalLink>
      </p>
      <div class="sco-shots">
        <ScreenshotSlot
          src={setupShot(1)}
          alt="Notion Developer portal, Personal access tokens page with the New token button"
          caption="1. Personal access tokens → New token"
        />
        <ScreenshotSlot
          src={setupShot(2)}
          alt="New token form with name Sitecatch, the Notion API capability and an expiration"
          caption="2. Name, capabilities and expiration"
        />
        <ScreenshotSlot
          src={setupShot(3)}
          alt="The created token shown once with a copy button"
          caption="3. Copy the token (shown only once)"
        />
      </div>
    </div>
  );
}

export function CreateConnectionInstructions() {
  return (
    <div class="sco-instructions">
      <Banner tone="info" title="You need to be a Workspace Owner" live={false}>
        Only workspace owners can create internal connections. If you aren’t one, ask an owner to create it and send
        you the token, or use a personal access token instead.
      </Banner>
      <ol class="sco-steps-list">
        <li>
          Open Notion’s <strong>Developer portal</strong>:{' '}
          <ExternalLink href={NOTION_CONNECTIONS_URL}>app.notion.com/developers/connections</ExternalLink>.
        </li>
        <li>
          In the <strong>Build</strong> section of the sidebar, select <strong>Internal connections</strong>.
        </li>
        <li>
          Click <strong>Create a new connection</strong>. Enter the name <code>Sitecatch</code> (you’ll search for this
          name when sharing databases) and choose the workspace that holds your databases.
        </li>
        <li>
          Open the <strong>Configuration</strong> tab. Under <strong>Capabilities</strong>, check{' '}
          <strong>Read content</strong>, <strong>Update content</strong> and <strong>Insert content</strong>. Under user
          capabilities choose <strong>No user information</strong>. <strong>Save</strong>.
        </li>
        <li>
          Still on <strong>Configuration</strong>, find <strong>API token</strong>, click <strong>Show</strong>, then{' '}
          <strong>Copy</strong>.
        </li>
      </ol>
      <p class="sco-muted">
        Treat the token like a password. If it leaks, refresh it on the same tab and paste the new one here.{' '}
        <ExternalLink href={NOTION_CONNECTION_DOCS_URL}>Notion’s guide</ExternalLink>
      </p>
      <div class="sco-shots">
        <ScreenshotSlot
          src={setupShot(4)}
          alt="Developer portal, Internal connections, creating a connection named Sitecatch"
          caption="1–3. Internal connections → Create a new connection"
        />
        <ScreenshotSlot
          src={setupShot(5)}
          alt="Configuration tab with Read, Update and Insert content checked and No user information"
          caption="4. Capabilities: Read, Update, Insert content"
        />
        <ScreenshotSlot
          src={setupShot(6)}
          alt="Configuration tab, API token with Show and Copy buttons"
          caption="5. API token → Show → Copy"
        />
      </div>
    </div>
  );
}

export function ShareDatabasesInstructions() {
  return (
    <div class="sco-instructions">
      <p>
        A new connection can’t see anything until you share pages with it. Do this for every database you want to save
        into.
      </p>
      <ol class="sco-steps-list">
        <li>
          Open the database <strong>as a full page</strong> in Notion. For an inline database, open it with ↗ first, or
          share the page that contains it.
        </li>
        <li>
          Click <strong>•••</strong> in the top-right corner (in some layouts, then <strong>More</strong>).
        </li>
        <li>
          Go to <strong>Connections</strong> and click <strong>+ Add connection</strong>.
        </li>
        <li>
          Search for <strong>Sitecatch</strong> and select it.
        </li>
        <li>
          <strong>Confirm</strong> that Sitecatch may access the page and its child pages.
        </li>
      </ol>
      <ScreenshotSlot
        src={setupShot(9)}
        alt="Notion database page: ••• menu, Connections, + Add connection, Sitecatch selected"
        caption="••• → Connections → + Add connection → Sitecatch → Confirm"
      />
      <h4 class="sco-subheading">Or share several at once from the Developer portal</h4>
      <ol class="sco-steps-list">
        <li>
          Open the Sitecatch connection in the{' '}
          <ExternalLink href={NOTION_CONNECTIONS_URL}>Developer portal</ExternalLink>.
        </li>
        <li>
          Open the <strong>Content access</strong> tab and click <strong>Edit access</strong>.
        </li>
        <li>Select the databases (or pages) and save.</li>
      </ol>
      <ScreenshotSlot
        src={setupShot(10)}
        alt="Developer portal: the connection's Content access tab with the Edit access button"
        caption="Content access → Edit access"
      />
      <p class="sco-muted">
        Sharing a page shares everything inside it. Sharing only the databases is the tighter option. To stop sharing
        later: ••• → Connections → Sitecatch → <strong>Disconnect</strong>.{' '}
        <ExternalLink href={NOTION_HELP_CONNECTIONS_URL}>Notion help</ExternalLink>
      </p>
    </div>
  );
}
