# Swyft Media website refinement summary

## Navigation and visual system
- Standardized the navigation font, uppercase treatment, weight, spacing, and active-page underline across the main pages, SWYFT Pass, Business Stories listing, and generated article pages. The active link changes color/underline only, so the navigation no longer shifts when Business Stories is opened.
- Reduced the main navigation logo to a restrained responsive size and set the footer logo to a consistent 138px maximum width / 42px maximum height.
- Reduced page-title typography across About Us, Services, the Business Stories listing, and generated article pages. Kept the existing People page content and structure unchanged.
- Refined the homepage hero around the supplied office photo, dark navy overlay, controlled gold accents, and clear call-to-action styling. Homepage client imagery is removed; the client section is names-only and includes ARROW. The Services feature visual also uses the brand system instead of a client project image.
- Added a coordinated Milestones & Success section to About Us, using non-invented agency statements and the supplied iWare Supplychain Services / AWL Agri Business Q4 FY 2025–26 milestone. Client names remain text-only outside Projects.
- Kept the original SWYFT Pass / intro-page concept while correcting the oversized intro logo and aligning the SWYFT Pass navigation with the shared site header styling.
- Contact page includes the Ahmedabad map and address context.

## Business Stories publishing
- The `/blog/` page is labeled Business Stories and includes a link to Publisher Access. The site footer also links to `/admin/`.
- Pages CMS edits content under `content/blog`. An authorized GitHub account signs in at Pages CMS, creates a story, marks it Published, and saves the change to the connected repository. GitHub Actions then builds the listing, article page, and sitemap.
- Existing legacy stories remain external archive links where full article body source was not available.

## Verification performed
- `node --check scripts/build-blogs.mjs` passed.
- `npm run build` completed successfully with the production configuration and existing content.
- A temporary published article was used to confirm that the build adds it to Business Stories, creates its article page and URL, adds it to the sitemap, and includes the publisher entry point. The temporary article was removed and the clean build was rerun.
- The People page main content was compared against the supplied original project and is unchanged.

## Hosting note
GitHub Pages is static hosting. Pages CMS provides Git-backed publishing, not a runtime database/server. Publishing requires the site owner to connect the correct GitHub repository and grant each editor appropriate repository access. A successful local build does not mean the changes have been deployed to the live domain.


## Correction in this package
- The About Us Milestones & Successes section now uses the six original titles and descriptions from the previously supplied old homepage; content is preserved while the cards follow the refined site theme.
- The CEO publishing route is now a separate username/password panel at `/admin/`, with a Node.js API and runtime Business Stories listing/article pages. It does not require CEO GitHub access. The API must be deployed separately and connected using `cms-config.js`; it is not live merely by uploading the static website. See `CMS_SETUP.md`.
