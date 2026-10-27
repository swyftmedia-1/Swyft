# Swyft Media Website — refined multi-page edition

This is the refined Swyft Media website package. It keeps the existing multi-page design and real HTML page routing. The changes in this package are limited to the corrected About Us milestones and the separate username/password Business Stories publishing panel.

## Main website pages

- `index.html` — Home
- `about.html` — About Us, including the six original Milestones & Successes entries moved from the old home page
- `services.html` — Services
- `projects.html` — Projects and client work
- `blog/` — Business Stories listing
- `blog/story.html?slug=article-slug` — CMS-published article page
- `swyft-pass.html` — Swyft Pass (its existing bespoke design is preserved)
- `people.html` — People
- `contact.html` — Contact
- `admin/` — private publishing sign-in page

The supplied brand theme, navigation, footer, homepage treatment, project imagery, SWYFT Pass layout and other page content are retained from the refined website package. Milestones and Successes now use the exact titles and descriptions from the old source homepage, styled to match the current navy, white and gold theme.

## Business Stories: separate username/password login

The CEO does **not** need a GitHub account or repository access. Open `https://swyftmedia.in/admin/`, sign in with a separately configured username and password, then create, edit, save as draft, publish or delete stories. The panel supports a cover image upload. Published stories are fetched by the live Business Stories page from the CMS API and open at shareable `blog/story.html?slug=...` URLs.

The website itself can remain on GitHub Pages. The Node.js CMS API must be deployed to a separate HTTPS Node.js host because GitHub Pages cannot run server-side login code or persist uploaded images. Setup is documented in `CMS_SETUP.md`.

**Important:** the CMS login is included in the source but is not live until the API is deployed and its base URL is configured in `cms-config.js`. Set environment variables only in the backend host's protected environment settings. Do not place the actual password, password hash or JWT secret in website files.

## Set up the website preview/build

Requires Node.js 22 or newer.

```sh
npm run build
```

The static website and any Markdown-based repository articles are built into `_site/`. To preview the result, use Live Server or another static HTTP server pointing to `_site/`. Do not copy the `_site` folder over the source files.

The custom username/password CMS is independent of the legacy `.pages.yml` Pages CMS configuration. The CEO should use the Swyft Publisher Access panel, not Pages CMS, for the requested no-GitHub publishing workflow.

## Deployment

1. Back up the current repository before replacing files.
2. Copy the website source files to the root of the correct Swyft website repository. Preserve the valid `CNAME` file and existing repository settings.
3. Deploy the static site with the existing GitHub Actions Pages workflow.
4. Deploy `cms-server/` as a separate Node.js service with a persistent writable disk for articles and uploaded images.
5. Configure `cms-config.js` with the public API URL, then redeploy the static website.
6. Test login, draft saving, publishing, editing, cover image upload and opening a published story.

The CMS stores article data in the backend's persistent `DATA_DIR`. The CMS API host must use persistent storage; ephemeral storage can lose stories and images when the service restarts or redeploys. The live API also needs HTTPS and the exact website origins configured for CORS.

## Existing blog content

The previous archive cards remain on Business Stories and open at their original publishing locations. The custom CMS lets the CEO publish new articles separately from GitHub. Articles saved through the separate CMS do not commit to GitHub or automatically run the static build. The current runtime article URLs are functional shareable links; the static sitemap is not automatically extended with CMS API stories.

## Contact form

The current static contact form opens the visitor's email application with an enquiry addressed to `info@swyftmedia.in`. It is not presented as a database-backed form.
