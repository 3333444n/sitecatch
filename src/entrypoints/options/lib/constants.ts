/** Links and copy constants used across the options page. */

/**
 * Base URL of the docs on GitHub. Placeholder until the public repo exists;
 * update it (one place) when the repository is created.
 */
export const DOCS_BASE_URL = 'https://github.com/sitecatch/sitecatch/blob/main/docs/';

export function docsUrl(page: string, anchor?: string): string {
  return `${DOCS_BASE_URL}${page}${anchor ? `#${anchor}` : ''}`;
}

/** Notion Developer portal → Personal access tokens. */
export const NOTION_PAT_URL = 'https://www.notion.so/developers/tokens';
/** Notion Developer portal → Internal connections. */
export const NOTION_CONNECTIONS_URL = 'https://app.notion.com/developers/connections';
export const NOTION_PAT_DOCS_URL = 'https://developers.notion.com/guides/get-started/personal-access-tokens';
export const NOTION_CONNECTION_DOCS_URL = 'https://developers.notion.com/guides/get-started/internal-connections';
export const NOTION_HELP_CONNECTIONS_URL = 'https://www.notion.com/help/add-and-manage-connections-with-the-api';

/** The only origin Sitecatch talks to. */
export const NOTION_API_ORIGIN = 'https://api.notion.com/*';

/** Setup screenshots live in `public/setup/` (served at the extension root). */
export function setupShot(n: number): string {
  return `/setup/setup-${String(n)}.png`;
}
