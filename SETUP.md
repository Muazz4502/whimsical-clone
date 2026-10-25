# One-time setup: connect the app to Google Drive

You do this **once per deployment**, not once per laptop. The result is three values in `config.js`.
After that, any laptop that has this folder (with that same `config.js`) just runs it and signs in.

Time needed: about 15 minutes. Everything is in the browser at <https://console.cloud.google.com>.

> **If you use a Google Workspace account (for example `@triotech.co.in`), create the project inside that organisation.** You can then mark the app **Internal**: only people in your company can sign in, and Google never reviews the app.

---

## Part 1: Google Cloud project

1. Open <https://console.cloud.google.com>, sign in with the account that should "own" the app, and click the project picker → **New project**. Name it `Branches Mind Mapper`. Choose your organisation if one is offered.
2. Write down the **Project number** (digits) from the project's **Dashboard / Welcome** page. That's `googleAppId`.
3. **APIs & Services → Library.** Enable both of these:
   - **Google Drive API**
   - **Google Picker API**

## Part 2: OAuth consent screen (shown as "Google Auth Platform" in newer consoles)

4. **APIs & Services → OAuth consent screen** (or **Google Auth Platform → Branding**).
   - App name: `Branches Mind Mapper`. Support email and developer contact: your email.
   - Leave the logo empty. A logo makes Google ask for brand verification.
5. **Audience / User type:**
   - **Internal** if you're on Workspace and only colleagues will use it. Recommended: no review and no test-user list.
   - **External** if personal Gmail accounts must sign in. Start in **Testing** and add every user's email under **Test users** (up to 100). When you go live, click **Publish app** (see AGENT_BRIEF.md, Phase 4).
6. **Data access / Scopes:** add `https://www.googleapis.com/auth/drive.file` ("See, edit, create and delete only the specific Google Drive files you use with this app"). It is a **non-sensitive** scope, so publishing needs no Google security review.

## Part 3: OAuth Client ID (the sign-in key)

7. **APIs & Services → Credentials → Create credentials → OAuth client ID** (or **Google Auth Platform → Clients → Create client**).
   - Application type: **Web application**. Name: `Mind Mapper web`.
   - **Authorized JavaScript origins:** add each address the app will be opened from. Use exactly this form, with no path and no trailing slash:
     - `http://localhost:8080` (laptop use, every laptop)
     - `https://YOUR-LIVE-ADDRESS` (add when you deploy, e.g. `https://mindmap-yourname.vercel.app`)
   - **Authorized redirect URIs:** leave empty. The app uses a popup, not redirects.
8. Copy the **Client ID** (`…apps.googleusercontent.com`). That's `googleClientId`. There's a client *secret* too. **Ignore it.** The app doesn't use it, and it must never go into this folder.

## Part 4: API key (only needed for opening boards shared with you)

9. **Credentials → Create credentials → API key.** Then **Edit** the key:
   - **Application restrictions → Websites:** add `http://localhost:8080/*` and `https://YOUR-LIVE-ADDRESS/*`.
   - **API restrictions → Restrict key → Google Picker API** only.
   - That value is `googleApiKey`.

## Part 5: Fill in `config.js`

```js
window.MINDMAP_CONFIG = {
  googleClientId: '1234567890-abc123.apps.googleusercontent.com',
  googleApiKey: 'AIza…',
  googleAppId: '1234567890',
  scope: 'https://www.googleapis.com/auth/drive.file',
  folderName: 'Branches Mind Mapper',
  pollSeconds: 20
};
```

These values are **not secrets.** Google expects them to sit in web pages, and they only work from the origins you allowed above. It's fine to commit and deploy `config.js`.

## Part 6: Check it works

```sh
./serve.sh                 # then open http://localhost:8080
```

Click **Continue with Google**, allow access, and create a board. A folder called **Branches Mind Mapper** appears in your Google Drive containing `<board name>.mindmap.json`.

---

## If something goes wrong

| What you see | Cause | Fix |
|---|---|---|
| `Error 400: origin_mismatch` or `redirect_uri_mismatch` in the popup | The address in the browser bar isn't in **Authorized JavaScript origins** | Add it exactly (scheme + host + port). Changes can take a few minutes to apply. |
| "Access blocked: … has not completed the Google verification process" | External app in Testing, and this account isn't a test user | Add the email under **Test users**, or publish the app |
| "This app is blocked" / "Your administrator has restricted access" | Your Workspace admin blocks unconfigured third-party apps | Admin console → **Security → API controls → Manage third-party app access** → add the Client ID as **Trusted** |
| "Could not reach Google Drive: Google Drive API has not been used in project …" | Drive API not enabled | Part 1, step 3, then wait 2 minutes |
| Picker shows "The API developer key is invalid" | API key restrictions don't include this address, or Picker API isn't allowed | Part 4 |
| Popup never appears | Browser blocked it | Allow pop-ups for the site |
| App opens but says Drive only works from a web address | You double-clicked `index.html` (a `file://` address) | Run `./serve.sh` and use `http://localhost:8080` |
