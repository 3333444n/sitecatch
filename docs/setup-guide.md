# Setup guide

Setup takes about five minutes. You create a Notion token, paste it into Sitecatch, and pick the databases you want to save into. Sitecatch opens this wizard automatically after install. You can reopen it any time from the options page (**Setup**).

There are two ways to connect. The wizard asks you to choose first:

| | **Personal access token** (recommended) | **Internal connection** |
| --- | --- | --- |
| Acts as | You | A bot ("Sitecatch") |
| Sees | Every database you can open | Only databases you share with it |
| Per-database sharing | Not needed | Required (••• → Connections) |
| Who can create it | Full workspace members, subject to the workspace's PAT policy (Free: owners only; Plus: all members; Business/Enterprise: admins decide) | Workspace Owners only |
| Expires | After 7 days, 30 days, 90 days, 180 days or 1 year (you choose) | No |

Both tokens are sent the same way (`Authorization: Bearer …`) and work identically once set up.

Notion's UI changes from time to time. The labels below were checked against Notion's docs in October 2026: [Personal access tokens](https://developers.notion.com/guides/get-started/personal-access-tokens), [Internal connections](https://developers.notion.com/guides/get-started/internal-connections), [Add and manage connections](https://www.notion.com/help/add-and-manage-connections-with-the-api).

## 1. Create the token

### Option A: Personal access token (recommended)

1. Open **Personal access tokens** in Notion's Developer portal: <https://www.notion.so/developers/tokens>.
2. Select **New token**.
3. Fill in the form:
   - **Name**: `Sitecatch`.
   - **Capabilities**: keep **Notion API** (read, create, update and search content). **Workers** isn't needed.
   - **Expiration**: 7 days, 30 days, 90 days, 180 days or 1 year. The form shows the exact expiry date.
   - If a **workspace picker** appears, choose the workspace that holds your databases.
4. Select **Create token**, then **copy the token right away**.

> **Notion shows the token only once.** If you lose it, revoke it in the Developer portal and create a new one. Treat it like a password: anyone with it can read and edit what you can.

If you can't select **New token**, your workspace restricts personal access tokens. Ask an admin, or use an internal connection (Option B).

<!-- SCREENSHOT: setup-1 -->
![Developer portal: Personal access tokens page with the New token button](images/setup-1.png)

<!-- SCREENSHOT: setup-2 -->
![New token form: name Sitecatch, Notion API capability, expiration](images/setup-2.png)

<!-- SCREENSHOT: setup-3 -->
![Token created dialog with the copy button (token blurred)](images/setup-3.png)

To revoke it later: Developer portal → Personal access tokens. Workspace admins can also revoke any PAT in **Settings → Connections → All personal access tokens**.

### Option B: Internal connection

> **You need to be a Workspace Owner** to create a connection. If you're not, ask an owner to create it and send you the token, or use a personal access token.

1. Open Notion's **Developer portal**: <https://app.notion.com/developers/connections>.
2. In the **Build** section of the sidebar, select **Internal connections**.
3. Click **Create a new connection**. Enter the name `Sitecatch` (you'll search for this name when sharing databases) and choose the workspace that holds your databases.

<!-- SCREENSHOT: setup-4 -->
![Developer portal: Internal connections, creating a connection named Sitecatch](images/setup-4.png)

4. Open the connection's **Configuration** tab and set **Capabilities**:
   - Check **Read content**, **Update content** and **Insert content**.
     - Read: list databases, read their properties, find duplicates.
     - Insert: create new pages.
     - Update: "Update existing" on duplicates, and adding options to select/multi-select properties.
   - User capabilities: **No user information**. Sitecatch never reads users.
   - **Save**.

<!-- SCREENSHOT: setup-5 -->
![Configuration tab: Read, Update, Insert content; No user information](images/setup-5.png)

5. Still on **Configuration**, find **API token**, click **Show**, then **Copy**. If it leaks, refresh it on the same tab.

<!-- SCREENSHOT: setup-6 -->
![Configuration tab: API token, Show and Copy](images/setup-6.png)

## 2. Allow access to api.notion.com

The wizard checks whether the browser lets Sitecatch reach `api.notion.com`. Firefox normally grants it at install, but you can turn it off in `about:addons`. If it's missing, click **Grant access to api.notion.com** and choose **Allow**. When access is already granted, the wizard skips this step.

This permission covers only `api.notion.com`. It does not give Sitecatch access to the sites you visit.

<!-- SCREENSHOT: setup-7 -->
![Browser prompt asking to allow Sitecatch to access api.notion.com](images/setup-7.png)

## 3. Paste the token

Paste the token into the field. Sitecatch checks it right away (`GET /v1/users/me`) and shows the workspace and token name. Use **Show** to check what you pasted.

- "Notion rejected this token": it was mistyped, copied partially, expired, revoked or refreshed. Copy it again (for a PAT, create a new one, since it's shown only once).

The token stays on this device (see [permissions-privacy.md](./permissions-privacy.md#token-storage)).

<!-- SCREENSHOT: setup-8 -->
![Sitecatch wizard: token pasted and validated, workspace shown](images/setup-8.png)

## 4. Share your databases (internal connection only)

Skip this with a personal access token: it already sees everything you can open.

A new connection can see **nothing** until you share pages with it. Do this for each database you want to save into (for example "Resources" and "Fav websites"):

1. Open the database **as a full page** in Notion. For an inline database, open it with ↗ first, or share its parent page.
2. Click **•••** in the top-right corner (in some layouts, then **More**).
3. Go to **Connections** and click **+ Add connection**.
4. Search for **Sitecatch** and select it.
5. **Confirm** that Sitecatch may access the page and its child pages.

<!-- SCREENSHOT: setup-9 -->
![Database page: ••• → Connections → + Add connection → Sitecatch → Confirm](images/setup-9.png)

Alternative, from the Developer portal: open the Sitecatch connection → **Content access** tab → **Edit access** → pick the databases → save.

<!-- SCREENSHOT: setup-10 -->
![Developer portal: Content access tab → Edit access](images/setup-10.png)

Sharing a page also shares everything inside it. Sharing only the databases is the tighter option. To stop sharing later: ••• → Connections → Sitecatch → **Disconnect**.

## 5. Check your databases

The last step lists the databases Sitecatch can see, with a search box and **Refresh**. You're done. Click **Create your first preset**.

<!-- SCREENSHOT: setup-11 -->
![Sitecatch wizard: list of visible databases](images/setup-11.png)

### Can't see your database?

With a **personal access token**:

| Cause | Fix |
| --- | --- |
| **Wrong workspace** | A PAT belongs to one workspace. Create a token in the workspace that holds the database (pick it in the workspace picker) and paste it. |
| **You don't have access** | The token sees exactly what you can open. Ask the database owner to share it with you. |
| **Linked view** | A linked view (↗ next to its name) points to another database. Pick the original. |
| **Token expired or revoked** | Validation fails with "Notion rejected this token". Create a new token and paste it. |
| **Just created** | Search can take a few seconds. Wait, then **Refresh** or type part of its name. |

With an **internal connection**:

| Cause | Fix |
| --- | --- |
| **Not shared yet** (most common) | Step 4 for that database, then **Refresh**. |
| **Inline database / shared parent page** | An inline database inherits access from its page. Share the parent page, or open the database as a full page and share it. |
| **Linked view** | Share the **original** database (a linked view shows ↗ next to its name), or the page that contains it. |
| **Wrong workspace** | The connection was created for another workspace. Create it in the right one and paste its token. |
| **Token revoked or refreshed** | Validation fails with "Notion rejected this token". Copy the current token from the Configuration tab. |
| **Just shared** | Search can lag a few seconds. Wait, then **Refresh**. |

### Changing or removing the token

Reopen **Setup**: when connected, it shows the workspace with **Replace token** and **Disconnect**. **Settings → Notion account** has **Disconnect** and **Re-run setup** too. Disconnecting removes the token from this device; presets stay.

## Your first preset

A preset says *which database* and *where each property's value comes from*. Example: a "Resources" database with Name (title), URL, Description (text), Type (select), Tags (multi-select) and Screenshot (files).

1. Options → **Presets** → **New preset**.
2. **Pick the database** "Resources". The preset is named after it; rename it if you like.
3. Sitecatch lists the database's properties. **Turn on** the ones you want filled. Others are left alone.
   - **Name** ← *From the page*: *Open Graph title*, fallback *Page title*. *Editable in popup* is on.
   - **URL** ← *From the page*: *Canonical URL*, fallback *URL*.
   - **Description** ← *Open Graph description*, fallback *Meta description*.
   - **Type** ← *Ask in popup*, default `Article`, *Required*.
   - **Tags** ← *Ask in popup*.
4. **Screenshot**: *Attach screenshot to* → **Screenshot**. Optionally also *Add screenshot to the page body*.
5. **Page cover**: *Open Graph image* (or *Screenshot*). **Page icon**: *Site favicon*.
6. **Duplicate detection**: compare with **URL** (preselected).
7. **Save preset**.

Try it: open any article, click the Sitecatch toolbar button, check the pre-filled form, pick a Type, add Tags, click **Save**. When it's done, click **Open in Notion**.

<!-- SCREENSHOT: setup-12 -->
![Preset editor: Resources preset mappings](images/setup-12.png)

<!-- SCREENSHOT: setup-13 -->
![Popup: pre-filled form and success with Open in Notion](images/setup-13.png)

More on presets: [preset-model.md](./preset-model.md). Popup and options states: [ui-flows.md](./ui-flows.md).

## Screenshots

Each `<!-- SCREENSHOT: setup-N -->` above is a slot. The same image is used in two places: `docs/images/setup-N.png` (these docs) and `public/setup/setup-N.png` (shown in the wizard, which falls back to a "Screenshot coming soon" placeholder until the file exists). setup-1 to setup-11 appear in the wizard; setup-12 and setup-13 only here. Blur tokens before committing.
