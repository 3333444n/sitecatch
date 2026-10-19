# Setup guide

Setup takes about five minutes. You create a private Notion **connection** (Notion's new name for an "integration"), paste its token into Sitecatch, and share the databases you want to save into. Sitecatch opens this wizard automatically after install. You can reopen it any time from the options page.

> **You need to be a Workspace Owner** to create a connection. If you're not, ask an owner to create it and send you the token, or to make you an owner.

Notion's UI changes from time to time. The labels below were checked against Notion's developer docs in October 2026 ([Internal connections](https://developers.notion.com/guides/get-started/internal-connections), [Capabilities](https://developers.notion.com/reference/capabilities)). Older names are given in parentheses where they differ.

## 1. Create the Sitecatch connection in Notion

1. Open Notion's **Developer portal**: <https://app.notion.com/developers/connections>. The older link <https://www.notion.so/profile/integrations> also leads there.
2. In the **Build** section of the sidebar, select **Internal connections**.
3. Click **Create a new connection** ("New integration" in older UI).
4. Fill in:
   - **Name**: `Sitecatch`. This is the name you'll search for when sharing databases.
   - **Workspace**: the workspace that holds your databases.
   - Logo: optional.
5. Create it.

<!-- SCREENSHOT: setup-1 -->
![Developer portal: creating an internal connection named Sitecatch](images/setup-1.png)

6. Open the new connection's **Configuration** tab and set **Capabilities**:
   - **Content capabilities**: check **Read content**, **Update content** and **Insert content**.
     - Read: list databases, read their properties, find duplicates.
     - Insert: create new pages.
     - Update: "Update existing" on duplicates, and adding options to select/multi-select properties.
   - **Comment capabilities**: none needed.
   - **User capabilities**: **No user information**. Sitecatch never reads users.
7. **Save** the changes.

<!-- SCREENSHOT: setup-2 -->
![Configuration tab: capabilities Read, Update, Insert content; No user information](images/setup-2.png)

## 2. Copy the API token

1. Still on the **Configuration** tab, find **API token** ("Internal Integration Secret" in older UI).
2. Reveal it (**Show**) and **Copy** it. It starts with `ntn_`.

Treat it like a password. Anyone with it can read and edit whatever you share with the connection. If it leaks, refresh it on the same tab.

<!-- SCREENSHOT: setup-3 -->
![Configuration tab: API token, Show and Copy](images/setup-3.png)

## 3. Connect Sitecatch

In the Sitecatch setup wizard:

1. **Grant access to api.notion.com**, if the wizard asks. Firefox normally grants this at install, but you can turn it off in `about:addons`. Click **Grant access** and accept the browser prompt.
2. **Paste the token** into the field. Sitecatch validates it right away (`GET /v1/users/me`) and shows the connection's bot name and workspace.
   - "Notion rejected your token" → it was mistyped, copied partially, or the connection was deleted. Copy it again.

The token stays on this device (see [permissions-privacy.md](./permissions-privacy.md#token-storage)).

<!-- SCREENSHOT: setup-4 -->
![Sitecatch wizard: grant access, paste token, validated workspace](images/setup-4.png)

## 4. Share your databases with Sitecatch

A new connection can see **nothing** until you share pages with it. Do this for each database you want to save into (for example "Resources" and "Fav websites"):

1. Open the database **as a full page** in Notion. For an inline database, open it with ↗ / "Open as page" first, or share its parent page.
2. Click **•••** in the top-right corner.
3. Go to **Connections**. In some layouts it sits under **More**. Then click **+ Add connection** ("Add connections").
4. Search for **Sitecatch** and select it.
5. **Confirm** that Sitecatch may access the page and its child pages.

<!-- SCREENSHOT: setup-5 -->
![Database page: ••• → Connections → Add connection → Sitecatch → Confirm](images/setup-5.png)

Alternative, from the Developer portal: open the Sitecatch connection → **Content access** tab → **Edit access** → pick the databases → save.

<!-- SCREENSHOT: setup-6 -->
![Developer portal: Content access tab → Edit access](images/setup-6.png)

Sharing a page also shares everything inside it. Sharing a parent page that contains several databases works too, but it gives Sitecatch access to the whole page tree. Sharing just the databases is the tighter option.

To stop sharing later: ••• → Connections → hover Sitecatch → **Disconnect**.

## 5. Check your databases

Back in the wizard, click **Refresh**. Your shared databases appear in the list. You're done. Next, create your first preset.

<!-- SCREENSHOT: setup-7 -->
![Sitecatch wizard: list of visible databases](images/setup-7.png)

### Can't see your database?

| Cause | Fix |
| --- | --- |
| **Not shared yet** (most common) | Step 4 for that database, then **Refresh**. |
| **Shared the wrong thing**: a different page, or a linked view of the database instead of the original | Find the **original** database (a linked view shows ↗ next to its name; open the source) and share that, or share the page that contains the original. |
| **Inline database** whose parent page isn't shared | Share the parent page, or open the database as a full page and share it. |
| **Wrong workspace**: the connection was created for another workspace | Check the workspace shown in the wizard. Create the connection in the right workspace and paste its token. |
| **Token revoked or refreshed** | Validation fails with "Notion rejected your token". Copy the current token from the Configuration tab. |
| **Connection deleted / no longer allowed** by a workspace admin | Recreate it (step 1) or ask your workspace owner. |
| **Just created** the database or shared it seconds ago | Search can take a moment. Wait a few seconds and Refresh, or type part of its name in the search box. |

## Your first preset

A preset says *which database* and *where each property's value comes from*. Example: a "Resources" database with Name (title), URL, Description, Type (select), Tags (multi-select) and Screenshot (files).

1. Options → **Presets** → **New preset**.
2. **Name** it `Resources` and **pick the database** "Resources".
3. Sitecatch lists the database's properties. **Map** the ones you want filled. Unmapped properties are left alone.
   - **Name** ← extractor *Open Graph title*, fallback *Page title*. Check *Editable in popup*.
   - **URL** ← extractor *Canonical URL*, fallback *Page URL*.
   - **Description** ← *Open Graph description*, fallback *Meta description*.
   - **Type** ← *Ask in popup*, default `Article`, required.
   - **Tags** ← *Ask in popup*.
4. **Screenshot**: send it to the **Screenshot** files property. Optionally also use it as the cover, or add it to the page body.
5. **Cover**: *Open Graph image* (or *Screenshot*). **Icon**: *Favicon*.
6. **Duplicate detection**: compare against **URL**.
7. **Save** the preset.

Try it: open any article, click the Sitecatch toolbar button, check the pre-filled form, pick a Type, add Tags, click **Save**. When it's done, click **Open in Notion**.

<!-- SCREENSHOT: setup-8 -->
![Preset editor: Resources preset mappings](images/setup-8.png)

<!-- SCREENSHOT: setup-9 -->
![Popup: pre-filled form and success with Open in Notion](images/setup-9.png)

More on presets: [preset-model.md](./preset-model.md). Popup states: [ui-flows.md](./ui-flows.md).

---

> **Note on personal access tokens.** Notion also offers personal access tokens (Developer portal → Personal access tokens), which act as *you* and don't need databases shared. Sitecatch v0 is designed and tested with an internal connection token. PAT support is tracked in [roadmap.md](./roadmap.md).
