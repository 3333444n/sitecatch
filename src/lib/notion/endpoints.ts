/**
 * Notion REST API constants. See docs/notion-api.md.
 * Only the background script talks to these endpoints.
 */

export const NOTION_API_BASE = 'https://api.notion.com/v1';

/** Pinned API version (data-source endpoints, `in_trash` naming). */
export const NOTION_VERSION = '2026-03-11';

/** Single-part uploads are limited to 20 MiB (larger files need multi-part). */
export const SINGLE_PART_UPLOAD_MAX_BYTES = 20 * 1024 * 1024;

/** Max `page_size` accepted by paginated endpoints. */
export const MAX_PAGE_SIZE = 100;

export const endpoints = {
  me: () => `${NOTION_API_BASE}/users/me`,
  search: () => `${NOTION_API_BASE}/search`,
  dataSource: (id: string) => `${NOTION_API_BASE}/data_sources/${encodeURIComponent(id)}`,
  queryDataSource: (id: string) =>
    `${NOTION_API_BASE}/data_sources/${encodeURIComponent(id)}/query`,
  pages: () => `${NOTION_API_BASE}/pages`,
  page: (id: string) => `${NOTION_API_BASE}/pages/${encodeURIComponent(id)}`,
  fileUploads: () => `${NOTION_API_BASE}/file_uploads`,
  sendFileUpload: (id: string) =>
    `${NOTION_API_BASE}/file_uploads/${encodeURIComponent(id)}/send`,
} as const;
