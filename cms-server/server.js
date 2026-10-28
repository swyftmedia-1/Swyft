'use strict';

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === 'production';

const DATA_DIR = path.resolve(
  process.env.DATA_DIR || path.join(__dirname, 'data')
);
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
const STORIES_FILE = path.join(DATA_DIR, 'stories.json');

const PUBLIC_API_URL = String(process.env.PUBLIC_API_URL || '')
  .trim()
  .replace(/\/+$/, '');

const allowedOrigins = new Set(
  String(process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
);

const sameSiteValue = String(
  process.env.COOKIE_SAME_SITE || 'lax'
).toLowerCase();

const cookieSameSite = ['lax', 'strict', 'none'].includes(sameSiteValue)
  ? sameSiteValue
  : 'lax';

const cookieSecure =
  String(
    process.env.COOKIE_SECURE || (isProduction ? 'true' : 'false')
  ).toLowerCase() === 'true';

const cookieDomain = String(process.env.COOKIE_DOMAIN || '').trim() || undefined;

const maxUploadBytes =
  Math.max(1, Number(process.env.MAX_UPLOAD_MB || 5)) * 1024 * 1024;

const COOKIE_NAME = 'swyft_cms_session';

/* -------------------------------------------------------
   ENVIRONMENT VALIDATION
------------------------------------------------------- */

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  throw new Error(
    'JWT_SECRET must be set to a random value of at least 32 characters.'
  );
}

if (!process.env.ADMIN_USERNAME || !process.env.ADMIN_PASSWORD_HASH) {
  throw new Error(
    'Set ADMIN_USERNAME and ADMIN_PASSWORD_HASH in the server environment.'
  );
}

if (allowedOrigins.size === 0) {
  throw new Error(
    'Set ALLOWED_ORIGINS to the exact website origin(s) allowed to use the CMS API.'
  );
}

if (isProduction && !PUBLIC_API_URL.startsWith('https://')) {
  throw new Error(
    'In production, PUBLIC_API_URL must be the HTTPS origin where this API is reachable.'
  );
}

/* -------------------------------------------------------
   SECURITY AND MIDDLEWARE
------------------------------------------------------- */

app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use(
  helmet({
    crossOriginResourcePolicy: {
      policy: 'cross-origin'
    },
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        connectSrc: ["'self'", ...Array.from(allowedOrigins)],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"]
      }
    }
  })
);

app.use(
  cors({
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type'],
    origin(origin, callback) {
      if (!origin) return callback(null, false);
      return callback(null, allowedOrigins.has(origin));
    }
  })
);

app.use(express.json({ limit: '1mb' }));

/* -------------------------------------------------------
   SESSION AND AUTHENTICATION HELPERS
------------------------------------------------------- */

function cookieOptions() {
  return {
    httpOnly: true,
    secure: cookieSecure,
    sameSite: cookieSameSite,
    domain: cookieDomain,
    path: '/',
    maxAge: 8 * 60 * 60 * 1000
  };
}

function requireTrustedOrigin(req, res, next) {
  const origin = req.get('origin');

  if (!origin || !allowedOrigins.has(origin)) {
    return res.status(403).json({
      error: 'This origin is not permitted to use the CMS API.'
    });
  }

  next();
}

function getSession(req) {
  const token =
    req.cookies?.[COOKIE_NAME] ||
    req.get('authorization')?.replace(/^Bearer\s+/i, '');

  if (!token) return null;

  try {
    return jwt.verify(token, process.env.JWT_SECRET, {
      issuer: 'swyft-media-cms',
      audience: 'swyft-media-admin'
    });
  } catch (_) {
    return null;
  }
}

/*
 * Read the CMS session cookie without exposing the JWT to frontend code.
 */
app.use((req, _res, next) => {
  const header = req.headers.cookie || '';

  const pair = header
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(COOKIE_NAME + '='));

  if (pair) {
    try {
      const value = decodeURIComponent(
        pair.slice(COOKIE_NAME.length + 1)
      );

      req.cookies = {
        ...(req.cookies || {}),
        [COOKIE_NAME]: value
      };
    } catch (_) {
      // Ignore malformed cookie values.
    }
  }

  next();
});

/* -------------------------------------------------------
   LOCAL CMS STORAGE
------------------------------------------------------- */

async function ensureStorage() {
  await fs.mkdir(DATA_DIR, { recursive: true });

  try {
    await fs.access(STORIES_FILE);
  } catch (_) {
    await fs
      .writeFile(STORIES_FILE, '[]\n', { flag: 'wx' })
      .catch((error) => {
        if (error.code !== 'EEXIST') throw error;
      });
  }
}

async function readStories() {
  const content = await fs.readFile(STORIES_FILE, 'utf8');
  const stories = JSON.parse(content);

  if (!Array.isArray(stories)) {
    throw new Error('The stories database must be a JSON array.');
  }

  return stories;
}

/*
 * Write to a temporary file first, then rename it into place.
 * This reduces the risk of leaving partially written JSON.
 */
async function writeStories(stories) {
  const tempFile = `${STORIES_FILE}.${process.pid}.${crypto.randomUUID()}.tmp`;

  try {
    await fs.writeFile(
      tempFile,
      JSON.stringify(stories, null, 2) + '\n',
      { mode: 0o600 }
    );

    await fs.rename(tempFile, STORIES_FILE);
  } catch (error) {
    await fs.unlink(tempFile).catch(() => {});
    throw error;
  }
}

/* -------------------------------------------------------
   GITHUB CONFIGURATION AND API HELPERS
------------------------------------------------------- */

function getGitHubConfig() {
  const owner = String(process.env.GITHUB_OWNER || '').trim();
  const repo = String(process.env.GITHUB_REPO || '').trim();
  const token = String(process.env.GITHUB_TOKEN || '').trim();
  const branch = String(process.env.GITHUB_BRANCH || 'main').trim();

  if (!owner || !repo || !token || !branch) {
    const error = new Error(
      'GitHub publishing is not configured on the CMS server.'
    );
    error.status = 503;
    throw error;
  }

  return { owner, repo, token, branch };
}

function githubFileUrl(config, filePath) {
  const safePath = filePath
    .split('/')
    .map(encodeURIComponent)
    .join('/');

  return `https://api.github.com/repos/${encodeURIComponent(
    config.owner
  )}/${encodeURIComponent(config.repo)}/contents/${safePath}`;
}

async function githubRequest(url, config, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${config.token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers
    }
  });

  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(
      `GitHub publishing failed (HTTP ${response.status}). Check the CMS server logs and GitHub permissions.`
    );
    error.status = 502;
    throw error;
  }

  return result;
}

async function getGitHubFileSha(config, filePath) {
  const response = await fetch(githubFileUrl(config, filePath), {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${config.token}`,
      'X-GitHub-Api-Version': '2022-11-28'
    }
  });

  if (response.status === 404) return null;

  if (!response.ok) {
    const error = new Error(
      `Could not check the existing GitHub file (HTTP ${response.status}).`
    );
    error.status = 502;
    throw error;
  }

  const data = await response.json();
  return data.sha;
}

/* -------------------------------------------------------
   PUBLIC MARKDOWN STORY FALLBACK
------------------------------------------------------- */

const MARKDOWN_STORY_CACHE_MS = 60 * 1000;
const markdownStoryCache = {
  expiresAt: 0,
  stories: [],
  pending: null
};

function parseMarkdownScalar(raw) {
  const value = String(raw || '').trim();

  if (value === 'true') return true;
  if (value === 'false') return false;

  if (value.startsWith('"') && value.endsWith('"')) {
    try {
      return JSON.parse(value);
    } catch (_) {
      return value.slice(1, -1);
    }
  }

  if (value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1).replace(/''/g, "'");
  }

  return value;
}

function parsePublishedMarkdownStory(source, filename) {
  const match = String(source || '')
    .replace(/^\uFEFF/, '')
    .match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)([\s\S]*)$/);

  if (!match) return null;

  const metadata = {};
  for (const line of match[1].split(/\r?\n/)) {
    if (!line.trim() || /^\s*#/.test(line)) continue;
    const field = line.match(/^([a-zA-Z_][\w-]*):\s*(.*?)\s*$/);
    if (field) metadata[field[1]] = parseMarkdownScalar(field[2]);
  }

  const slug = String(
    metadata.slug || String(filename || '').replace(/\.md$/i, '')
  ).trim();
  const title = String(metadata.title || '').trim();
  const date = String(metadata.date || '').trim().slice(0, 10);
  const description = String(metadata.description || '').trim();
  const body = match[2].trim();
  const published = metadata.published === true;

  if (
    !published ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) ||
    !title ||
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !description ||
    !body
  ) {
    return null;
  }

  return {
    title,
    slug,
    date,
    description,
    coverImage: String(
      metadata.coverImage || metadata.cover_image || metadata.featured_image || ''
    ).trim(),
    body,
    published: true
  };
}

async function fetchPublishedMarkdownStoriesFromGitHub() {
  const config = getGitHubConfig();
  const directoryUrl =
    `${githubFileUrl(config, 'content/blog')}?ref=${encodeURIComponent(config.branch)}`;
  const listing = await githubRequest(directoryUrl, config);

  if (!Array.isArray(listing)) return [];

  const markdownFiles = listing.filter(
    (item) =>
      item &&
      item.type === 'file' &&
      typeof item.name === 'string' &&
      item.name.toLowerCase().endsWith('.md')
  );

  const results = await Promise.allSettled(
    markdownFiles.map(async (file) => {
      const fileUrl =
        `${githubFileUrl(config, file.path)}?ref=${encodeURIComponent(config.branch)}`;
      const data = await githubRequest(fileUrl, config);
      if (!data || typeof data.content !== 'string') return null;

      const source = Buffer.from(
        data.content.replace(/\s/g, ''),
        'base64'
      ).toString('utf8');

      return parsePublishedMarkdownStory(source, file.name);
    })
  );

  return results
    .filter((result) => result.status === 'fulfilled' && result.value)
    .map((result) => result.value);
}

async function readPublishedMarkdownStories() {
  const now = Date.now();
  if (markdownStoryCache.expiresAt > now) {
    return markdownStoryCache.stories;
  }
  if (markdownStoryCache.pending) return markdownStoryCache.pending;

  markdownStoryCache.pending = (async () => {
    try {
      const stories = await fetchPublishedMarkdownStoriesFromGitHub();
      markdownStoryCache.stories = stories;
    } catch (error) {
      // Keep CMS/database stories available even if GitHub cannot be reached.
      console.error(
        'Could not load published Markdown stories from GitHub:',
        error.message
      );
      markdownStoryCache.stories = [];
    }

    markdownStoryCache.expiresAt = Date.now() + MARKDOWN_STORY_CACHE_MS;
    return markdownStoryCache.stories;
  })();

  try {
    return await markdownStoryCache.pending;
  } finally {
    markdownStoryCache.pending = null;
  }
}

async function readPublicStories() {
  const [cmsStories, markdownStories] = await Promise.all([
    readStories(),
    readPublishedMarkdownStories()
  ]);

  // Prefer CMS records on duplicate slugs; Markdown fills missing CMS records.
  const bySlug = new Map();
  for (const story of markdownStories) {
    if (story && story.published && story.slug) bySlug.set(story.slug, story);
  }
  for (const story of cmsStories) {
    if (story && story.published && story.slug) bySlug.set(story.slug, story);
  }

  return Array.from(bySlug.values()).sort((a, b) =>
    String(b.date || '').localeCompare(String(a.date || ''))
  );
}

/* -------------------------------------------------------
   MARKDOWN GENERATION AND GITHUB SYNCHRONISATION
------------------------------------------------------- */

async function deleteGitHubMarkdown(config, slug) {
  if (!slug) return;

  const filePath = `content/blog/${slug}.md`;
  const sha = await getGitHubFileSha(config, filePath);

  // Already absent: deletion is effectively complete.
  if (!sha) return;

  await githubRequest(githubFileUrl(config, filePath), config, {
    method: 'DELETE',
    body: JSON.stringify({
      message: `Remove unpublished blog: ${slug}`,
      sha,
      branch: config.branch
    })
  });
}

/*
 * Synchronisation rules:
 *
 * 1. Publishing creates or updates the Markdown file.
 * 2. Renaming publishes the new slug before removing the previous slug.
 * 3. Unpublishing removes the old published Markdown file.
 * 4. Deleting an unpublished draft does not call GitHub.
 *
 * GitHub and the local JSON database are separate systems. The routes below
 * attempt rollback if the local save fails, but no cross-system transaction
 * can guarantee rollback when GitHub itself is unavailable.
 */
async function syncGitHubStory(story, previousSlug = '') {
  const shouldPublish = Boolean(story && story.published);

  if (!shouldPublish && !previousSlug) return;

  const config = getGitHubConfig();

  if (shouldPublish) {
    const filePath = `content/blog/${story.slug}.md`;
    const sha = await getGitHubFileSha(config, filePath);

    const yaml = (value) => JSON.stringify(String(value || ''));

    const date = /^\d{4}-\d{2}-\d{2}$/.test(story.date)
      ? story.date
      : new Date().toISOString().slice(0, 10);

    const markdown = [
      '---',
      `title: ${yaml(story.title)}`,
      `slug: ${yaml(story.slug)}`,
      `date: ${date}`,
      `description: ${yaml(story.description)}`,
      `featured_image: ${yaml(story.coverImage)}`,
      `author: ${yaml('Swyft Media Productions')}`,
      'published: true',
      '---',
      '',
      story.body.trim(),
      ''
    ].join('\n');

    const payload = {
      message: `${sha ? 'Update' : 'Publish'} blog: ${story.title}`,
      content: Buffer.from(markdown, 'utf8').toString('base64'),
      branch: config.branch
    };

    if (sha) payload.sha = sha;

    await githubRequest(
      githubFileUrl(config, filePath),
      config,
      {
        method: 'PUT',
        body: JSON.stringify(payload)
      }
    );
  }

  /*
   * Delete the previous file only after a replacement has been published.
   * For an unpublish operation, story is absent or unpublished and the
   * previous published file is removed.
   */
  if (
    previousSlug &&
    (!shouldPublish || previousSlug !== story.slug)
  ) {
    await deleteGitHubMarkdown(config, previousSlug);
  }
}

/* -------------------------------------------------------
   SLUG AND ARTICLE VALIDATION
------------------------------------------------------- */

function slugify(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 180);
}

function validateStory(input, stories, excludeSlug = '') {
  const title = String(input.title || '').trim();
  const slug = slugify(input.slug || title);
  const date = String(input.date || '').trim();
  const description = String(input.description || '').trim();
  const body = String(input.body || '').trim();
  const coverImage = String(input.coverImage || '').trim();
  const published = Boolean(input.published);

  if (!title || title.length > 180) {
    throw new Error(
      'Article title is required and must be 180 characters or fewer.'
    );
  }

  if (!slug || slug.length > 180) {
    throw new Error('Please enter a valid URL slug.');
  }

  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    Number.isNaN(Date.parse(`${date}T00:00:00Z`))
  ) {
    throw new Error('Please provide a valid publication date.');
  }

  if (description.length > 320) {
    throw new Error(
      'The description must be 320 characters or fewer.'
    );
  }

  if (body.length < 20 || body.length > 200000) {
    throw new Error(
      'Article content must be between 20 and 200,000 characters.'
    );
  }

  if (
    coverImage &&
    !(
      /^https:\/\//i.test(coverImage) ||
      /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//i.test(coverImage)
    )
  ) {
    throw new Error(
      'Cover image must be an HTTPS URL returned by the CMS upload service (localhost HTTP is allowed for development).'
    );
  }

  if (
    stories.some(
      (story) => story.slug === slug && story.slug !== excludeSlug
    )
  ) {
    throw new Error('That URL slug is already in use.');
  }

  return {
    title,
    slug,
    date,
    description,
    body,
    coverImage,
    published
  };
}

function requireAdmin(req, res, next) {
  const session = getSession(req);

  if (!session || session.role !== 'admin') {
    return res.status(401).json({
      error: 'Please sign in to continue.'
    });
  }

  req.cmsAdmin = session;
  next();
}

/* -------------------------------------------------------
   LOGIN RATE LIMITING
------------------------------------------------------- */

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 8,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: {
    error: 'Too many sign-in attempts. Try again in 15 minutes.'
  }
});

/* -------------------------------------------------------
   IMAGE UPLOAD CONFIGURATION
------------------------------------------------------- */

const allowedMimeTypes = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif'
]);

// Keep uploaded image data in memory before saving to GitHub.
const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: {
    fileSize: maxUploadBytes,
    files: 1
  },

  fileFilter: (_req, file, callback) => {
    if (!allowedMimeTypes.has(file.mimetype)) {
      return callback(
        new Error('Only JPG, PNG, WebP and GIF images are allowed.')
      );
    }

    callback(null, true);
  }
});

/* -------------------------------------------------------
   HEALTH CHECK
------------------------------------------------------- */

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'swyft-media-cms'
  });
});

/* -------------------------------------------------------
   AUTHENTICATION ROUTES
------------------------------------------------------- */

app.post(
  '/api/auth/login',
  requireTrustedOrigin,
  loginLimiter,
  async (req, res, next) => {
    try {
      const username = String(req.body?.username || '');
      const password = String(req.body?.password || '');

      const usernameBuffer = Buffer.from(username);
      const expectedUsernameBuffer = Buffer.from(
        process.env.ADMIN_USERNAME
      );

      const usernameMatches =
        usernameBuffer.length === expectedUsernameBuffer.length &&
        crypto.timingSafeEqual(
          usernameBuffer,
          expectedUsernameBuffer
        );

      const passwordMatches = await bcrypt.compare(
        password,
        process.env.ADMIN_PASSWORD_HASH
      );

      if (!usernameMatches || !passwordMatches) {
        return res.status(401).json({
          error: 'Incorrect username or password.'
        });
      }

      const token = jwt.sign(
        {
          sub: process.env.ADMIN_USERNAME,
          role: 'admin'
        },
        process.env.JWT_SECRET,
        {
          issuer: 'swyft-media-cms',
          audience: 'swyft-media-admin',
          expiresIn: '8h'
        }
      );

      res.cookie(COOKIE_NAME, token, cookieOptions());

      res.json({
        ok: true,
        user: {
          username: process.env.ADMIN_USERNAME
        }
      });
    } catch (error) {
      next(error);
    }
  }
);

app.get('/api/auth/me', (req, res) => {
  const session = getSession(req);

  if (!session || session.role !== 'admin') {
    return res.status(401).json({
      error: 'Not signed in.'
    });
  }

  res.json({
    ok: true,
    user: {
      username: session.sub
    }
  });
});

app.post(
  '/api/auth/logout',
  requireTrustedOrigin,
  (_req, res) => {
    res.clearCookie(COOKIE_NAME, {
      ...cookieOptions(),
      maxAge: undefined
    });

    res.json({ ok: true });
  }
);

/* -------------------------------------------------------
   PUBLIC BLOG API
------------------------------------------------------- */

app.get('/api/stories', async (_req, res, next) => {
  try {
    const stories = await readPublicStories();

    res.set(
      'Cache-Control',
      'public, max-age=60, stale-while-revalidate=300'
    );

    res.json(
      stories.map(
        ({ title, slug, date, description, coverImage, body }) => ({
          title,
          slug,
          date,
          description,
          coverImage,
          body
        })
      )
    );
  } catch (error) {
    next(error);
  }
});

app.get('/api/stories/:slug', async (req, res, next) => {
  try {
    const stories = await readPublicStories();
    const story = stories.find((item) => item.slug === req.params.slug);

    if (!story) {
      return res.status(404).json({
        error: 'Story not found.'
      });
    }

    res.set(
      'Cache-Control',
      'public, max-age=60, stale-while-revalidate=300'
    );

    const { title, slug, date, description, coverImage, body } = story;
    res.json({ title, slug, date, description, coverImage, body });
  } catch (error) {
    next(error);
  }
});

/* -------------------------------------------------------
   ADMIN: LIST ARTICLES
------------------------------------------------------- */

app.get(
  '/api/admin/stories',
  requireAdmin,
  async (_req, res, next) => {
    try {
      const stories = await readStories();

      res.json(
        stories.sort((a, b) => b.date.localeCompare(a.date))
      );
    } catch (error) {
      next(error);
    }
  }
);

/* -------------------------------------------------------
   ADMIN: CREATE ARTICLE
------------------------------------------------------- */

app.post(
  '/api/admin/stories',
  requireTrustedOrigin,
  requireAdmin,
  async (req, res, next) => {
    try {
      const stories = await readStories();

      const data = validateStory(
        req.body || {},
        stories
      );

      const now = new Date().toISOString();

      const story = {
        id: crypto.randomUUID(),
        ...data,
        createdAt: now,
        updatedAt: now
      };

      /*
       * Publish to GitHub first. If saving the local CMS database fails,
       * attempt to remove the newly published Markdown file.
       */
      await syncGitHubStory(story);

      stories.push(story);

      try {
        await writeStories(stories);
      } catch (saveError) {
        if (story.published) {
          try {
            await syncGitHubStory(null, story.slug);
          } catch (rollbackError) {
            console.error(
              'GitHub rollback failed after CMS create error:',
              rollbackError.message
            );
          }
        }

        throw saveError;
      }

      res.status(201).json(story);
    } catch (error) {
      if (error.status) {
        return res.status(error.status).json({
          error: error.message
        });
      }

      if (error instanceof SyntaxError) {
        return res.status(400).json({
          error: 'Invalid request data.'
        });
      }

      if (error.message) {
        return res.status(400).json({
          error: error.message
        });
      }

      next(error);
    }
  }
);

/* -------------------------------------------------------
   ADMIN: UPDATE, PUBLISH, UNPUBLISH OR RENAME ARTICLE
------------------------------------------------------- */

app.put(
  '/api/admin/stories/:slug',
  requireTrustedOrigin,
  requireAdmin,
  async (req, res, next) => {
    try {
      const stories = await readStories();

      const index = stories.findIndex(
        (story) => story.slug === req.params.slug
      );

      if (index === -1) {
        return res.status(404).json({
          error: 'Story not found.'
        });
      }

      const previous = stories[index];

      const data = validateStory(
        req.body || {},
        stories,
        req.params.slug
      );

      const updated = {
        ...previous,
        ...data,
        updatedAt: new Date().toISOString()
      };

      /*
       * The synchronisation helper writes the new published Markdown first.
       * It then removes the previous published slug when necessary.
       */
      await syncGitHubStory(
        updated,
        previous.published ? previous.slug : ''
      );

      stories[index] = updated;

      try {
        await writeStories(stories);
      } catch (saveError) {
        /*
         * Attempt to restore GitHub to the previous CMS state if the local
         * database write fails.
         */
        try {
          if (previous.published) {
            await syncGitHubStory(
              previous,
              updated.published ? updated.slug : ''
            );
          } else if (updated.published) {
            await syncGitHubStory(null, updated.slug);
          }
        } catch (rollbackError) {
          console.error(
            'GitHub rollback failed after CMS update error:',
            rollbackError.message
          );
        }

        throw saveError;
      }

      res.json(updated);
    } catch (error) {
      if (error.status) {
        return res.status(error.status).json({
          error: error.message
        });
      }

      if (error instanceof SyntaxError) {
        return res.status(400).json({
          error: 'Invalid request data.'
        });
      }

      if (error.message) {
        return res.status(400).json({
          error: error.message
        });
      }

      next(error);
    }
  }
);

/* -------------------------------------------------------
   ADMIN: DELETE ARTICLE
------------------------------------------------------- */

app.delete(
  '/api/admin/stories/:slug',
  requireTrustedOrigin,
  requireAdmin,
  async (req, res, next) => {
    try {
      const stories = await readStories();

      const existing = stories.find(
        (story) => story.slug === req.params.slug
      );

      if (!existing) {
        return res.status(404).json({
          error: 'Story not found.'
        });
      }

      /*
       * Remove the published Markdown first. If GitHub deletion fails,
       * the local CMS record remains unchanged.
       */
      if (existing.published) {
        await syncGitHubStory(null, existing.slug);
      }

      const remaining = stories.filter(
        (story) => story.slug !== req.params.slug
      );

      try {
        await writeStories(remaining);
      } catch (saveError) {
        /*
         * If the local deletion fails, attempt to restore the published
         * Markdown file.
         */
        if (existing.published) {
          try {
            await syncGitHubStory(existing);
          } catch (rollbackError) {
            console.error(
              'GitHub rollback failed after CMS delete error:',
              rollbackError.message
            );
          }
        }

        throw saveError;
      }

      res.json({ ok: true });
    } catch (error) {
      if (error.status) {
        return res.status(error.status).json({
          error: error.message
        });
      }

      if (error instanceof SyntaxError) {
        return res.status(400).json({
          error: 'Invalid request data.'
        });
      }

      if (error.message) {
        return res.status(400).json({
          error: error.message
        });
      }

      next(error);
    }
  }
);

/* -------------------------------------------------------
   IMAGE SIGNATURE VALIDATION
------------------------------------------------------- */

async function hasValidImageSignature(file) {
  const bytes = Buffer.isBuffer(file?.buffer)
    ? file.buffer.subarray(0, 16)
    : Buffer.alloc(0);

  const isJpeg =
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff;

  const isPng =
    bytes.length >= 8 &&
    bytes.subarray(0, 8).equals(
      Buffer.from([
        0x89, 0x50, 0x4e, 0x47,
        0x0d, 0x0a, 0x1a, 0x0a
      ])
    );

  const isGif =
    bytes.length >= 6 &&
    (
      bytes.subarray(0, 6).toString('ascii') === 'GIF87a' ||
      bytes.subarray(0, 6).toString('ascii') === 'GIF89a'
    );

  const isWebp =
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString('ascii') === 'RIFF' &&
    bytes.subarray(8, 12).toString('ascii') === 'WEBP';

  const actualMime = isJpeg
    ? 'image/jpeg'
    : isPng
      ? 'image/png'
      : isGif
        ? 'image/gif'
        : isWebp
          ? 'image/webp'
          : '';

  return Boolean(actualMime && actualMime === file.mimetype);
}

/* -------------------------------------------------------
   ADMIN: IMAGE UPLOAD TO GITHUB
------------------------------------------------------- */

app.post(
  '/api/admin/upload',
  requireTrustedOrigin,
  requireAdmin,
  (req, res) => {
    upload.single('image')(req, res, async (error) => {
      // Handle upload errors.
      if (error) {
        if (
          error instanceof multer.MulterError &&
          error.code === 'LIMIT_FILE_SIZE'
        ) {
          return res.status(413).json({
            error: `Image is too large. Maximum size is ${Math.round(
              maxUploadBytes / 1024 / 1024
            )} MB.`
          });
        }

        return res.status(400).json({
          error: error.message || 'Could not upload image.'
        });
      }

      // Ensure a file was uploaded.
      if (!req.file) {
        return res.status(400).json({
          error: 'Choose an image to upload.'
        });
      }

      try {
        // Validate the actual image file signature.
        const validImage = await hasValidImageSignature(req.file);

        if (!validImage) {
          return res.status(400).json({
            error:
              'Invalid image file. Upload a valid JPEG, PNG, WebP, or GIF image.'
          });
        }

        // Read GitHub configuration from environment variables.
        const config = getGitHubConfig();

        // Supported image formats and their extensions.
        const extensionByMime = {
          'image/jpeg': '.jpg',
          'image/png': '.png',
          'image/webp': '.webp',
          'image/gif': '.gif'
        };

        const extension = extensionByMime[req.file.mimetype];

        if (!extension) {
          return res.status(400).json({
            error: 'Unsupported image format.'
          });
        }

        // Generate a unique filename to avoid overwriting other images.
        const filename =
          `${Date.now()}-${crypto.randomBytes(8).toString('hex')}` +
          extension;

        // Save images inside the GitHub repository.
        const repoPath = `content/blog/images/${filename}`;

        // Prepare the GitHub Contents API request.
        const payload = {
          message: `Upload CMS image: ${filename}`,
          content: req.file.buffer.toString('base64'),
          branch: config.branch
        };

        // Upload the image to GitHub.
        await githubRequest(
          githubFileUrl(config, repoPath),
          config,
          {
            method: 'PUT',
            body: JSON.stringify(payload)
          }
        );

        // Build the public raw image URL.
        const encodedPath = repoPath
          .split('/')
          .map(encodeURIComponent)
          .join('/');

        const encodedBranch = config.branch
          .split('/')
          .map(encodeURIComponent)
          .join('/');

        const url =
          `https://raw.githubusercontent.com/` +
          `${encodeURIComponent(config.owner)}/` +
          `${encodeURIComponent(config.repo)}/` +
          `${encodedBranch}/${encodedPath}`;

        // Return the URL for the CMS editor to use in the article.
        return res.status(201).json({
          success: true,
          message: 'Image uploaded successfully.',
          url,
          filename,
          path: repoPath
        });
      } catch (uploadError) {
        console.error(
          'GitHub image upload failed:',
          uploadError.message
        );

        return res.status(uploadError.status || 502).json({
          error:
            'Could not save the image to GitHub. Check the GitHub token permissions, repository settings, branch, and server logs.'
        });
      }
    });
  }
);

/* -------------------------------------------------------
   SERVE UPLOADED IMAGES
------------------------------------------------------- */

app.use(
  '/uploads',
  express.static(UPLOADS_DIR, {
    fallthrough: false,
    maxAge: isProduction ? '7d' : 0,

    setHeaders(res) {
      res.setHeader('X-Content-Type-Options', 'nosniff');
    }
  })
);

/* -------------------------------------------------------
   CENTRAL ERROR HANDLER
------------------------------------------------------- */

app.use((error, _req, res, _next) => {
  // Do not return internal stack traces or credentials to the browser.
  if (error.status === 404) {
    return res.status(404).json({
      error: 'File not found.'
    });
  }

  if (!res.headersSent) {
    res.status(500).json({
      error: 'The CMS server encountered an error. Check server logs for details.'
    });
  }

  if (!isProduction) {
    console.error(error);
  }
});

/* -------------------------------------------------------
   START SERVER
------------------------------------------------------- */

ensureStorage()
  .then(() => {
    app.listen(PORT, () => {
      console.log(
        `Swyft Media CMS API listening on port ${PORT}`
      );
    });
  })
  .catch((error) => {
    console.error(
      'Could not initialise CMS storage:',
      error.message
    );

    process.exit(1);
  });
