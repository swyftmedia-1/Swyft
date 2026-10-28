# Swyft Media Business Stories CMS setup

This project contains a static multipage website and a separate Node.js CMS API. The public website can be hosted on GitHub Pages, while the API runs separately on Render or another Node.js host with HTTPS. Article Markdown and images are stored in GitHub, so the API does not need a persistent disk.

## A. Local CMS test in Windows / VS Code

1. Open the extracted `SwyftMedia-Website-main` folder in VS Code.
2. Open Terminal and run:

   ```powershell
   cd cms-server
   npm.cmd install
   ```

3. Copy `cms-server/.env.example` to `cms-server/.env` and replace every placeholder with your own local values. Never commit `.env` to GitHub.
4. Start the API and leave its terminal running:

   ```powershell
   npm.cmd run dev
   ```

   The terminal should say `Swyft Media CMS API listening on port 3000`.

5. In VS Code, right-click `admin/index.html` and choose **Open with Live Server**. Use the exact local address Live Server opens. The supplied `cms-config.js` automatically chooses the matching local API hostname (`localhost` or `127.0.0.1`) on port 3000. Use the same hostname for the page and API; do not mix `localhost` and `127.0.0.1` during a login session.
6. Sign in with the `ADMIN_USERNAME` and password that correspond to your local `ADMIN_PASSWORD_HASH`. Publish a clearly marked test article, then check the public `/blog/` listing and article page.

If Live Server uses a port other than 5500, edit `ALLOWED_ORIGINS` in `.env` to include the exact origin shown in the address bar, for example `http://localhost:5501` or `http://127.0.0.1:5501`, then restart the API. The local `.env` should use `NODE_ENV=development`, `COOKIE_SECURE=false`, and `COOKIE_SAME_SITE=lax`; those settings are not for production.

Check that the API is running by opening `http://localhost:3000/api/health` (or `http://127.0.0.1:3000/api/health` when using that local hostname). Expected response includes `"ok":true`.

## B. Generate a different CMS password (optional)

From `cms-server`:

```powershell
npm.cmd run hash-password
```

The included helper displays password characters as you type to avoid hidden-input confusion in PowerShell. Do not run it while screen-sharing or on a shared terminal. Use at least 12 characters, confirm it, and copy the generated bcrypt hash into the private server `.env` as `ADMIN_PASSWORD_HASH`. Never place a password or hash in `cms-config.js` or frontend HTML/JavaScript.

## C. Production deployment

The supplied `cms-config.js` uses `https://swyftmedia.onrender.com` on non-local hostnames. Keep `PUBLIC_API_URL` aligned with that exact HTTPS URL unless you deliberately configure a custom API domain and update `cms-config.js` too. Deploy `cms-server/` as a separate Node.js service. Articles are stored as Markdown files in `content/blog/`; uploads are stored in `content/blog/upload/` by the GitHub Contents API. No `DATA_DIR`, `stories.json`, or Render disk is used.

Set these variables in the hosting provider's protected environment-variable settings (not in GitHub files):

| Variable | Production value |
|---|---|
| `NODE_ENV` | `production` |
| `PORT` | The port assigned by the host, if required |
| `JWT_SECRET` | A unique random secret at least 32 characters long |
| `ADMIN_USERNAME` | Your chosen private CMS username |
| `ADMIN_PASSWORD_HASH` | A bcrypt hash generated with `npm.cmd run hash-password` |
| `ALLOWED_ORIGINS` | `https://swyftmedia.in,https://www.swyftmedia.in` (only the actual live website origins) |
| `PUBLIC_API_URL` | `https://swyftmedia.onrender.com` (must match `cms-config.js`) |
| `COOKIE_SAME_SITE` | `none` when the frontend uses `swyftmedia.in` and the API uses `onrender.com` |
| `COOKIE_SECURE` | `true` |
| `COOKIE_DOMAIN` | Leave blank unless your hosting setup requires it |
| `MAX_UPLOAD_MB` | `5` |
| `GITHUB_OWNER` | Your GitHub username or organization |
| `GITHUB_REPO` | The repository that contains this website |
| `GITHUB_BRANCH` | `main` (or your actual default branch) |
| `GITHUB_TOKEN` | Fine-grained token with Contents read/write for this repository |

After setting production variables, deploy/restart the backend and test `https://swyftmedia.onrender.com/api/health`. Then publish the website changes to the correct repository. A local `.env` file does not configure the live host. Remove any previously committed `cms-server/.env`; changing `.gitignore` alone does not remove a file already tracked by Git.

## D. Publishing test

1. Open `/admin/` and sign in.
2. Click **New story** and fill the title, lowercase hyphenated slug, publication date, short description, and body (at least 20 characters).
3. Leave **Publish this story** unchecked for a draft, or tick it to publish.
4. Save. Published stories are available through the API and should appear in the `/blog/` runtime listing and individual article page when the production API is online.
5. Test a valid JPG, PNG, WebP or GIF image under 5 MB only after basic story publishing works.

## Security and operational notes

- The admin interface uses an HttpOnly session cookie, an eight-hour JWT, login rate limiting, origin checks, and upload signature validation. Because the current website and API are on different registrable domains, use `COOKIE_SAME_SITE=none` with `COOKIE_SECURE=true`; browsers that block third-party cookies may still require a custom API domain such as `cms-api.swyftmedia.in`. Do not disable authentication to work around `401` responses.
- `.env` and CMS data are ignored by Git. Do not include secrets in the website ZIP or client-side scripts.
- The API stores each story in `content/blog/<slug>.md` and uploaded images in `content/blog/upload/`; a Render disk and `DATA_DIR` are not required.
- The website's public Business Stories listing uses the API when it is available and retains its static/archive content if the API is offline. The API needs to be deployed for live publishing.
- Runtime articles do not automatically get added to the static sitemap in this edition. A sitemap/SEO generation workflow would need a further server-side or deployment integration.
