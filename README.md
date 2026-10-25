# Whimsical Clone

An open-source **Whimsical-style** mind mapper: mind maps, sticky notes, text, tables, and images — with **your Google Drive as the database**.

No backend. No SaaS lock-in. One HTML file + a small config. Boards are plain Drive files you own.

> **Not affiliated with [Whimsical](https://whimsical.com).** This is an independent open-source project inspired by that kind of canvas.

**Try it:** [branches-mind-mapper.vercel.app](https://branches-mind-mapper.vercel.app) · works in-browser immediately; connect Google Drive for sync & sharing.

---

## Features

- Mind maps with keyboard-first editing
- Sticky notes, text, tables, and images on the same canvas
- **Google Drive storage** — each board is a `.mindmap.json` file
- **Sharing** via Drive permissions (invite by email or link)
- Live sync across devices (~20s poll)
- Offline-safe: unsaved edits are kept in the browser until Drive confirms
- **This browser** mode if you skip Google setup
- Zero build step — deploy as a static site

## Quick start

```bash
git clone https://github.com/Muazz4502/whimsical-clone.git
cd whimsical-clone
./serve.sh
```

Open [http://localhost:8080](http://localhost:8080). Boards save in the browser until you add Google credentials (see below).

### Project layout

```
whimsical-clone/
├── index.html      ← the whole app
├── config.js       ← Google Client ID / API key / App ID
├── serve.sh        ← local server on :8080
├── SETUP.md        ← one-time Google Cloud setup (~15 min)
├── AGENT_BRIEF.md  ← deploy / verify runbook
├── tests/          ← e2e suite (fake Google, no account needed)
└── legacy/         ← older Claude-artifact build (for migrating boards)
```

---

## Google Drive as the database

| Database idea | How Drive provides it |
|---|---|
| A table | Folder **Whimsical Clone** in My Drive |
| A row | One file: `<board title>.mindmap.json` |
| Row ID | Drive file ID (share links use `#b-<fileId>`) |
| Index | File properties `mmKind=board`, `mmId=…` |
| Contents | JSON board: nodes, roots, items, images |
| Versions | Drive version history + trash |
| Permissions | Normal Drive sharing |

The app uses scope `drive.file` — it only sees files it created or that you pick. Nothing is stored on our servers.

### Connect Google (once per deployment)

Follow **[SETUP.md](./SETUP.md)** to create an OAuth Web client + Picker API key, then fill `config.js`:

```js
window.MINDMAP_CONFIG = {
  googleClientId: '….apps.googleusercontent.com',
  googleApiKey: 'AIza…',
  googleAppId: '1234567890',   // Cloud project number
  // …
};
```

These values are meant to be public in the page; lock them with authorized origins / referrers in Google Cloud.

### Sharing

- **Invite by email** → Drive permission + email with a board link
- **Anyone with the link can edit** → Drive link sharing
- First open of a shared board may ask the recipient to **choose the file in Drive** once (`drive.file` requirement)
- **Delete** → owner's Drive trash · **Leave** → removes your access

### Without Google

Empty `config.js` or **Use without Google** → boards stay in that browser’s storage. After you connect Drive, you can **Move … boards from this browser to Google Drive**.

---

## Deploy

Static hosting only (no build):

```bash
# example: Vercel
npx vercel deploy --prod
```

Then add the live origin to your OAuth client and API key restrictions (`https://your-domain`, no trailing slash). Details in [AGENT_BRIEF.md](./AGENT_BRIEF.md).

---

## Everyday ops

| Task | How |
|---|---|
| Start locally | `./serve.sh` → http://localhost:8080 |
| Force sync | Profile → **Sync now** |
| Open Drive folder | Profile → **Show my boards folder in Google Drive** |
| Open a shared / uploaded file | Profile → **Open a board from Google Drive…** |
| Restore an old version | Drive → file → **Manage versions** |
| Run tests | `cd tests && npm install && npm test` |

Tests use a fake Google stack in Chrome — no real account required. Expect `ALL PASSED`.

---

## Limits

- Access tokens last ~1 hour; use **Reconnect** (edits are kept)
- Sync is near-real-time (poll), not CRDT co-editing — last save wins; other version stays in Drive history
- Large image-heavy boards slow down saves
- Shared users need Google accounts allowed by your OAuth audience (Internal Workspace or External + test users / published)

---

## License

MIT — see [LICENSE](./LICENSE).

Whimsical® is a trademark of its respective owners. This project is not endorsed by them.
