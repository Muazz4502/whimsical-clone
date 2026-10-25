# Branches Mind Mapper: Google Drive edition

A Whimsical-style mind-mapping app (mind maps, sticky notes, text, tables, images) that stores every board in **your own Google Drive**. There's no server, no database, and no dependency on Claude. It's one HTML file plus a settings file. It runs from `http://localhost:8080` on any laptop, or from any static web host.

```
Whimsical/
├── index.html        ← the whole app (UI + Google Drive storage + sync)
├── config.js         ← the 3 Google values (filled in once; see SETUP.md)
├── serve.sh          ← starts the app at http://localhost:8080
├── SETUP.md          ← one-time Google Cloud setup (15 min)
├── AGENT_BRIEF.md    ← runbook for an AI agent / developer to set up, verify and go live
├── tests/            ← automated end-to-end test (fake Google, no account needed)
└── legacy/           ← the previous Claude-artifact version, kept for migrating old boards
```

---

## 1. How it works

### Google Drive is the database

| Database idea | How Drive provides it |
|---|---|
| A table | A folder called **Branches Mind Mapper** in the owner's My Drive |
| A row | One file per board: `<board title>.mindmap.json` |
| Row ID | Drive file ID (this is what share links contain: `…/#b-<fileId>`) |
| Index / `WHERE` clause | Each board file is tagged with Drive *properties* `mmKind=board`, `mmId=<board id>`. The app runs the query `properties has {key='mmKind' and value='board'}` to list boards |
| Row contents | The board as JSON: `{format, version, id, title, nodes, roots, items, updated}`. Images are stored inside it as compressed data URLs |
| Version column | Drive's `headRevisionId`, which changes on every content save |
| Backups / undo history | Drive's built-in **version history** on each file (right-click → *Manage versions*) and Drive **trash** |
| Permissions | Drive sharing. "Invite" in the app creates a normal Drive permission |

Because boards are plain Drive files, you can always find, back up, download or share them from drive.google.com, even if this app disappears.

### Signing in

The browser signs in with **Google Identity Services** (a popup) and gets an access token. That token is used to call the Drive REST API directly from the page. Nothing passes through any server of ours.

- **Permission level `drive.file`:** the app can only see files **it created**, or files the user **explicitly picked** in Google's file picker. It can't read the rest of your Drive. This is also why Google needs no security review.
- Tokens last **about one hour**. After that, a banner says *"Your Google session expired"* with a **Reconnect** button: one click, no password. Edits made meanwhile aren't lost (see below).

### Saving and syncing

1. You edit. About 1.2 s after you stop, the board is uploaded (one request; the whole board file is replaced).
2. **Before** uploading, a copy of the unsaved board is kept in the browser (`localStorage`). It's deleted once Drive confirms the save. If the tab closes, the laptop dies, the network drops or the session expires, those edits are re-uploaded the next time you sign in on **that browser**.
3. Every 20 s (and whenever you come back to the tab) the app asks Drive which boards changed. Changes made on another laptop or by a colleague appear automatically. Boards are only downloaded when you open them.
4. **Two people editing the same board at the same moment:** the last save wins. The app warns you when that happens, and the other version is still in that file's Drive version history. Restored offline edits never overwrite newer work: if the board changed elsewhere, they're saved as a separate board named *"… (unsaved changes)"*.

### Sharing

- **Share → Invite by email** adds a Drive permission and Google emails them a link like `https://your-app/#b-<fileId>`.
- **"Anyone with the link can edit"** adds Drive's *anyone with the link* permission.
- **The first time** a colleague opens a shared board, the app shows **"Choose the board in Google Drive"**. Google requires them to pick the file once before an app with `drive.file` access may open it. After that it's in their *Shared* list for good. This step needs the API key and app ID in `config.js`.
- **Delete** sends the file to the owner's Drive trash (recoverable for 30 days). **Leave** removes your own access.
- Your company's Drive policies apply as usual, for example blocking sharing outside the domain.

### Without Google

If `config.js` has no Client ID, or someone clicks *"Use without Google"*, the app runs in **This browser** mode: boards live only in that browser's storage, as in the original version. Connecting Google Drive later offers a **Move to Google Drive** button.

---

## 2. Using it on another laptop

Your boards are in Google Drive, so moving laptops means **moving the app folder, not the data**.

1. **Get the folder onto the new laptop:** a git clone, a zip, AirDrop, or a copy from Google Drive. It must include the **same `config.js`**.
   - ⚠️ Use the same Client ID everywhere. With `drive.file`, Drive gives each Client ID access only to the files that Client ID created. A new Client ID would start with an empty board list. Your files would still be in Drive, and you could re-open them via *Open a board from Google Drive…*.
2. You need **Python 3**: run `python3 --version`. macOS asks to install the developer tools if it's missing. On Windows, install it from python.org, or run `npx serve -l 8080` instead.
3. In the folder, run `./serve.sh` and open **http://localhost:8080**. Keep port **8080**: it's the address registered with Google. For another port, add that address in SETUP.md Part 3 first.
4. Click **Continue with Google** and sign in. All your boards appear.

Once the app is deployed to a public address (see AGENT_BRIEF.md), a new laptop just needs that link, with nothing to install.

**Before leaving the old laptop:** if any boards sit under **This browser** in the sidebar, use the profile menu → **Move … boards from this browser to Google Drive**. Browser-only boards don't travel.

### Migrating boards from the old Claude version

Boards made in the old Claude-hosted version (`legacy/mindmap-claude-artifact.html`) live in Claude's storage. To bring them over:

1. Open the old app at its claude.ai link, open a board, and click **Export** in the sidebar. Inside Claude it may copy the JSON instead of downloading it. If so, paste it into a text file saved as `name.json`.
2. In the new app (signed in to Google), click **Import** and choose that file. It's saved to Drive immediately.

---

## 3. Everyday operations

| Task | How |
|---|---|
| Start the app | `./serve.sh` → http://localhost:8080 (or the live link) |
| Force a sync | Profile menu → **Sync now** |
| See the files | Profile menu → **Show my boards folder in Google Drive** |
| Open a board file someone sent you / a hand-uploaded export | Profile menu → **Open a board from Google Drive…** |
| Restore an older version of a board | Drive → right-click the `.mindmap.json` → **Manage versions** / **Version history**, then reload the app |
| Back up | The Drive folder *is* the backup. Also **Export** (one board as JSON) or Google Takeout |
| Switch Google account | Profile menu → **Sign out of Google** |
| Run the tests | `cd tests && npm install && npm test` (no Google account needed) |

## 4. Limits worth knowing

- **Hourly reconnect click.** Browser-only Google sign-in can't refresh silently. Removing it requires a small backend that holds a refresh token (a possible future improvement; see AGENT_BRIEF.md).
- **Not real-time co-editing.** Changes from others arrive within about 20 s, and simultaneous edits to one board are last-save-wins (the other version stays in Drive history).
- **Images** are stored inside the board file (up to 1600 px, about 600 KB each). A board with dozens of large images gets slow to save. Prefer a few images per board.
- **Colleagues need Google accounts.** People opening shared boards must be allowed by your OAuth setup: Internal = same Workspace, or listed test users / a published app.
