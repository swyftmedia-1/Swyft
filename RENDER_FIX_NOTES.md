# Render CMS deployment checklist

This version no longer creates `/var/data`, `stories.json`, or a local uploads folder. The CMS writes article files to GitHub as `content/blog/<slug>.md` and images to `content/blog/upload/<filename>` using the GitHub Contents API. A Render Persistent Disk is not needed for CMS content.

## Render service settings

- **Root Directory:** `cms-server`
- **Build Command:** `npm install` (or `npm ci`)
- **Start Command:** `npm start`
- **Runtime:** Node.js 20 or newer

## Environment variables

Configure these in Render Dashboard → your CMS service → Environment. Do not put real values in website files.

| Key | Value / guidance |
|---|---|
| `NODE_ENV` | `production` |
| `JWT_SECRET` | New random secret, at least 32 characters |
| `ADMIN_USERNAME` | Your CMS username |
| `ADMIN_PASSWORD_HASH` | Bcrypt hash of a new strong CMS password |
| `ALLOWED_ORIGINS` | `https://swyftmedia.in,https://www.swyftmedia.in` (remove any origin you do not use) |
| `PUBLIC_API_URL` | `https://swyftmedia.onrender.com` (must match `cms-config.js`) |
| `COOKIE_SAME_SITE` | `none` for the current `onrender.com` API + `swyftmedia.in` frontend |
| `COOKIE_SECURE` | `true` |
| `COOKIE_DOMAIN` | Leave blank |
| `MAX_UPLOAD_MB` | `5` |
| `GITHUB_OWNER` | GitHub owner/org of the website repository |
| `GITHUB_REPO` | Exact website repository name |
| `GITHUB_BRANCH` | `main` or the actual content branch |
| `GITHUB_TOKEN` | Newly generated fine-grained token with repository Contents read/write permission |

Remove the old `DATA_DIR` variable from Render. This code no longer uses it. If the frontend and API stay on different registrable domains, `SameSite=None; Secure` is needed for cross-site login cookies, but browsers that block third-party cookies may still require configuring a custom API domain such as `cms-api.swyftmedia.in`. If using that domain, update both `PUBLIC_API_URL` and `cms-config.js` to match it.

## Deploy and test

1. Commit the updated source to the website repository. Make sure `cms-server/.env` is deleted from the repository, not merely ignored.
2. Add a fresh token and fresh admin/JWT values in Render Environment. Redeploy the CMS service.
3. Check `https://swyftmedia.onrender.com/api/health`; it should return JSON with `"ok": true`.
4. Sign into `/admin/`, save a draft, publish a story, and upload a test image. Verify the Markdown file appears under `content/blog/`, and image appears under `content/blog/upload/`.
5. The GitHub Pages workflow should rebuild the static pages after article commits. Verify the published URL and image after the deployment completes.

## Important data/security notes

- The supplied ZIP had a `.env` containing a real-looking GitHub token and other production settings. Revoke the exposed token immediately; do not reuse it. Rotate the JWT secret and change the CMS admin password/hash.
- Stories already present as Markdown in `content/blog/` remain available. Drafts that existed only in a prior local `stories.json` are not automatically migrated by this change; restore/export them before removing any old storage, if you still need those drafts.
- The archive did not contain the image bytes referenced by older `https://swyftmedia.onrender.com/uploads/...` cover URLs. The server includes a compatibility endpoint that can serve such files if you place them in the GitHub upload folder with the same filenames. If those files are unavailable, re-upload the cover images in the CMS and save the articles again.
