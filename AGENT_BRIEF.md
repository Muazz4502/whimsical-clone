# Agent brief: set up, verify and take Branches Mind Mapper live

You are taking a finished static web app to production. **The code is done and tested. Your job is configuration, verification and deployment, not a rewrite.** Read `README.md` (how it works) and `SETUP.md` (Google Cloud steps) before starting.

## What you're working with

- `index.html` is the entire app. Storage is Google Drive via the Drive v3 REST API, called from the browser with a Google Identity Services token. There's no backend.
- `config.js` holds `googleClientId`, `googleApiKey`, `googleAppId`. They ship empty. While empty, the app runs in browser-only mode.
- `tests/e2e.js` runs the real app in Chrome against an in-memory fake of Google sign-in, Drive and Picker. It currently runs **52 checks, all passing**: sign-in, folder creation, saving, reloads, second laptop, live sync, invite, the shared-board Picker flow, session expiry and reconnect, crash recovery, conflict copies, delete to trash, local mode, and moving local boards into Drive.

## Non-negotiables

1. **Don't change the scope from `drive.file` to `drive`** without the owner's explicit OK. `drive` is a *restricted* scope: External apps then need Google's paid security assessment. (Internal Workspace apps don't.)
2. **Don't change the Client ID after users have boards.** Under `drive.file`, file access is tied to the Client ID. A new ID means users must re-pick their files.
3. **Never put the OAuth client secret anywhere in this repo.** The app doesn't use it. Client ID and API key are public by design. Lock them down with origin and referrer restrictions instead.
4. **The board file format is a contract** (`format: 'mindmap', version: 2`). If you change it, bump `version` and keep reading old files.
5. **Don't set `Cross-Origin-Opener-Policy: same-origin`** on the host. It breaks the Google sign-in popup. Use `same-origin-allow-popups`, or nothing.
6. Run `cd tests && npm install && npm test` after **any** change to `index.html`. It must print `ALL PASSED`.

## Phase 0: Baseline (5 min, you)

- [ ] `cd tests && npm install && npm test` → `ALL PASSED`. If Chrome isn't at the macOS default path, set `CHROME_PATH`.
- [ ] `./serve.sh`, open http://localhost:8080 → the app loads in "This browser" mode with two example boards and no console errors.

## Phase 1: Google Cloud (15 min, **needs the human**)

The OAuth client and consent screen can only be created in the Cloud Console UI (there's no `gcloud` command for web OAuth clients). Walk the owner through **SETUP.md Parts 1–4**, or drive the browser if you have computer use. Decisions to make with the owner:

- **Internal or External?** If every user has an `@triotech.co.in` (same Workspace) account, choose **Internal**: no review and no test users. Otherwise **External**, starting in Testing.
- **Who owns the Cloud project?** Prefer a company account over a personal one, so the app outlives any one person.

Collect: Client ID, API key, project number.

You *can* script these parts if `gcloud` is installed and authenticated:
```sh
gcloud projects create branches-mind-mapper-XXXX --name="Branches Mind Mapper"
gcloud config set project branches-mind-mapper-XXXX
gcloud services enable drive.googleapis.com picker.googleapis.com
gcloud projects describe branches-mind-mapper-XXXX --format='value(projectNumber)'   # → googleAppId
gcloud services api-keys create --display-name="Mind Mapper Picker" \
  --api-target=service=picker.googleapis.com \
  --allowed-referrers="http://localhost:8080/*"            # add the live origin later
```

## Phase 2: Configure and verify locally (10 min, you + one human sign-in)

- [ ] Fill `config.js` with the three values.
- [ ] `./serve.sh` → http://localhost:8080 → **Continue with Google** (the human signs in once).
- [ ] Verify in the owner's Google Drive: a folder named **Branches Mind Mapper** appears after the first board is created, containing `*.mindmap.json` files.
- [ ] Edit a board, wait 2 s, reload → the edit persists. Open the same URL in a second browser profile, signed into the same account → the same boards appear, and an edit in one shows in the other within about 20 s.
- [ ] **Sharing test with a second real account:** Share → invite → the second account opens the emailed link → clicks *Choose the board in Google Drive* → the board opens and their edits reach the owner.
- [ ] If the Workspace admin blocks the app ("This app is blocked"), have the admin mark the Client ID as **Trusted** (SETUP.md troubleshooting table).

## Phase 3: Deploy (10 min)

It's a static site: deploy the folder as-is, with no build step. `.vercelignore` already excludes `tests/` and `legacy/`.

**Recommended: Vercel** (the CLI is already installed on the owner's original laptop):
```sh
vercel login                 # human, once
vercel deploy --prod         # from the project root; accept defaults; framework "Other", no build command
```
Note the URL, e.g. `https://branches-mind-mapper.vercel.app`. For a custom domain, add it in Vercel and use *that* as the origin below.

**Alternative: GitHub Pages:** push to a GitHub repo → Settings → Pages → deploy from branch `main`, folder `/` → origin `https://<user>.github.io`. If it's served from a sub-path like `/<repo>/`, the origin is still just `https://<user>.github.io`.

Then, in Google Cloud (human):
- [ ] OAuth client → **Authorized JavaScript origins** → add the live origin, e.g. `https://branches-mind-mapper.vercel.app`, with no trailing slash.
- [ ] API key → **Website restrictions** → add `https://branches-mind-mapper.vercel.app/*`.
- [ ] Wait about 5 minutes, then repeat the Phase 2 checks against the live URL.

## Phase 4: Go live

- [ ] **External apps only:** OAuth consent screen / Audience → **Publish app** (Testing → In production). With only `drive.file`, Google doesn't require scope verification. If it asks for brand verification (usually because a logo was uploaded), remove the logo or complete it. Until then, keep users listed as test users.
- [ ] Share the live link with the team, plus a 3-line how-to: sign in with Google → boards save to your Drive → first time opening a shared board, click *Choose the board*.
- [ ] Have the owner migrate old boards from the Claude version (README §2, "Migrating boards").
- [ ] Hand back to the owner: live URL, Cloud project ID, which account owns it, and where `config.js` values came from.

**Definition of done:** two real users on two machines can each sign in at the live URL, create boards that appear in their own Drive, share a board with each other, and see each other's edits, with no console errors. The test suite still passes.

---

## Feedback and backlog (after launch, in priority order)

These are known trade-offs, not bugs. Do them only if the owner asks.

1. **Hourly "Reconnect" click.** Browser-only Google sign-in can't refresh tokens silently. To remove it, add a tiny backend (e.g. a Vercel/Cloudflare function) that uses the OAuth *code* flow, stores a refresh token in an httpOnly cookie, and mints access tokens. That brings back a client secret, which then belongs only in the host's environment variables.
2. **Near-real-time sync.** Polling every 20 s is simple and cheap. Drive's `changes.watch` needs a public webhook (a backend again). A cheaper step is to lower `pollSeconds` to 10. Each poll is one list call per open tab, so check the Drive API **Quotas** page in Cloud Console before lowering it a lot for many users.
3. **Big images.** Images are inlined in the board JSON. If boards get heavy, move images to separate Drive files in the board's folder and share them alongside the board.
4. **True co-editing.** Simultaneous edits are last-save-wins (the loser stays in Drive version history). Real merging needs a CRDT (e.g. Yjs) with Drive as snapshot storage. That's a large project, and only worth it if teams edit the same board at the same time regularly.
5. **Token storage.** The access token sits in `localStorage` for up to an hour, so a reload doesn't need a click. That's acceptable because the page loads no third-party scripts except Google's. If you ever add analytics or other scripts, switch to `sessionStorage` or memory.

## Where things are in `index.html`

Search for these headings:

- `Saving: this browser (local) or the signed-in Google Drive`: debounce and dispatch
- `Google sign-in`: the `Auth` object (GIS token client, cached token)
- `Drive REST calls`: `gfetch` (auth header, retries with backoff, error mapping)
- `Google Drive as the database`: the `Drive` object (folder, list, fetchBody, write, permissions)
- `keeping boards in step with Drive`: `ingestMeta`, `Sync.poll`, conflict handling
- `safety net`: `stashPending` / `replayPending` (crash recovery)
- `Google Picker`: granting access to shared boards
- `sharing (Google Drive permissions)`: Share dialog, `openFromHash`, `askForAccess`
- `Boot`: `boot`, `startDrive`, `startLocal`, `showConnect`
