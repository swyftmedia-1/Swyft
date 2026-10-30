import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SITE_DIR = path.join(ROOT, '_site');
const CONTENT_DIR = path.join(ROOT, 'content', 'blog');
const LEGACY_POSTS_FILE = path.join(ROOT, 'content', 'legacy-blog-posts.json');
const SITE_URL = 'https://swyftmedia.in';
const RESERVED_SLUGS = new Set(['admin', 'blog', 'about', 'services', 'projects', 'contact', 'people', 'swyft-pass', 'index', '404', 'content', 'media', 'scripts', 'sitemap', 'robots']);
const EXCLUDED_ROOT_ITEMS = new Set([
  '.git', '.github', 'node_modules', '_site', 'content', 'scripts',
  '.pages.yml', '.gitignore', 'package.json', 'package-lock.json', 'BLOG_SETUP.md', 'README.md', 'SITE_UPDATE_SUMMARY.md', 'cms-server'
]);

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
}

function decodeBasicEntities(value = '') {
  return String(value)
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

function safeUrl(value, image = false) {
  const raw = decodeBasicEntities(String(value || '').trim());
  if (!raw) return '';

  // Images may use HTTP(S) or relative/root-relative paths only.
  // Never allow mailto:, javascript:, data: or other URI schemes as an image source.
  if (image) {
    if (/^https?:\/\//i.test(raw)) return escapeHtml(raw);
    if (/^[a-z][a-z0-9+.-]*:/i.test(raw) || raw.startsWith('#')) return '';
    return escapeHtml(raw);
  }

  if (/^https?:\/\//i.test(raw) || /^mailto:/i.test(raw)) return escapeHtml(raw);
  if (raw.startsWith('/') || raw.startsWith('#')) return escapeHtml(raw);

  // Reject javascript:, data: and other unexpected URI schemes.
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw)) return '#';

  return escapeHtml(raw);
}

function parseScalar(raw = '') {
  const value = raw.trim();

  if (!value) return '';
  if (value === 'true') return true;
  if (value === 'false') return false;

  if (value.startsWith('"') && value.endsWith('"')) {
    try {
      return JSON.parse(value);
    } catch {
      return value.slice(1, -1);
    }
  }

  if (value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1).replace(/''/g, "'");
  }

  return value;
}

function parsePost(filePath) {
  const source = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
  const match = source.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)([\s\S]*)$/);

  if (!match) {
    throw new Error(`Missing YAML front matter in ${path.relative(ROOT, filePath)}`);
  }

  const meta = {};

  for (const line of match[1].split(/\r?\n/)) {
    if (!line.trim() || /^\s*#/.test(line)) continue;

    const field = line.match(/^([a-zA-Z_][\w-]*):\s*(.*)$/);
    if (!field) continue;

    meta[field[1]] = parseScalar(field[2]);
  }

  const slug = String(meta.slug || path.basename(filePath, '.md')).trim();

  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new Error(
      `Invalid slug "${slug}" in ${path.relative(ROOT, filePath)}. Use lowercase letters, numbers and hyphens.`
    );
  }

  const title = String(meta.title || '').trim();
  const description = String(meta.description || '').trim();
  const rawDate = String(meta.date || '').trim();
  const dateMatch = rawDate.match(/^(\d{4}-\d{2}-\d{2})/);
  const date = dateMatch ? dateMatch[1] : rawDate;
  const body = match[2].trim();

  if (meta.published === true && (!title || !description || !date || !body)) {
    throw new Error(`Published article ${slug} needs a title, date, description and body.`);
  }

  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error(`Date for ${slug} should use YYYY-MM-DD format.`);
  }

  return {
    slug,
    title: title || 'Untitled article',
    description,
    date,
    featuredImage: String(meta.featured_image || '').trim(),
    author: String(meta.author || 'Swyft Media Productions').trim(),
    category: String(meta.category || '').trim(),
    tags: String(meta.tags || '').split(',').map((tag) => tag.trim()).filter(Boolean),
    published: meta.published === true,
    body,
    sourceFile: path.relative(ROOT, filePath)
  };
}

function inlineMarkdown(rawText) {
  let text = escapeHtml(rawText);

  text = text.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g, (_m, alt, url, title) => {
    const safe = safeUrl(url, true);

    if (!safe) return alt;

    return `<img src="${safe}" alt="${alt}"${title ? ` title="${title}"` : ''} loading="lazy" decoding="async">`;
  });

  text = text.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g, (_m, label, url, title) => {
    const safe = safeUrl(url);
    const isExternal = /^https?:/i.test(decodeBasicEntities(url));

    return `<a href="${safe}"${title ? ` title="${title}"` : ''}${isExternal ? ' target="_blank" rel="noopener noreferrer"' : ''}>${label}</a>`;
  });

  text = text.replace(/`([^`]+)`/g, '<code>$1</code>');
  text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/__(.+?)__/g, '<strong>$1</strong>');
  text = text.replace(/~~(.+?)~~/g, '<del>$1</del>');
  text = text.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  text = text.replace(/(^|[^_])_([^_\n]+)_/g, '$1<em>$2</em>');

  return text;
}

function markdownToHtml(markdown) {
  const lines = String(markdown || '').replace(/\r/g, '').split('\n');
  const output = [];
  let paragraph = [];
  let listType = null;
  let listItems = [];
  let codeLines = null;

  const flushParagraph = () => {
    if (paragraph.length) {
      output.push(`<p>${inlineMarkdown(paragraph.join(' ').trim())}</p>`);
      paragraph = [];
    }
  };

  const flushList = () => {
    if (!listType) return;

    output.push(
      `<${listType}>${listItems.map((item) => `<li>${inlineMarkdown(item)}</li>`).join('')}</${listType}>`
    );

    listType = null;
    listItems = [];
  };

  for (const line of lines) {
    if (codeLines) {
      if (/^\s*```/.test(line)) {
        output.push(`<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
        codeLines = null;
      } else {
        codeLines.push(line);
      }

      continue;
    }

    if (/^\s*```/.test(line)) {
      flushParagraph();
      flushList();
      codeLines = [];
      continue;
    }

    if (!line.trim()) {
      flushParagraph();
      flushList();
      continue;
    }

    const heading = line.match(/^\s{0,3}(#{1,4})\s+(.+?)\s*#*\s*$/);

    if (heading) {
      flushParagraph();
      flushList();

      const level = heading[1].length;
      output.push(`<h${level + 1}>${inlineMarkdown(heading[2])}</h${level + 1}>`);
      continue;
    }

    if (/^\s{0,3}(---|___|\*\s*\*\s*\*)\s*$/.test(line)) {
      flushParagraph();
      flushList();
      output.push('<hr>');
      continue;
    }

    const quote = line.match(/^\s{0,3}>\s?(.*)$/);

    if (quote) {
      flushParagraph();
      flushList();
      output.push(`<blockquote><p>${inlineMarkdown(quote[1])}</p></blockquote>`);
      continue;
    }

    const unordered = line.match(/^\s*[-*+]\s+(.+)$/);
    const ordered = line.match(/^\s*\d+[.)]\s+(.+)$/);

    if (unordered || ordered) {
      flushParagraph();

      const nextType = unordered ? 'ul' : 'ol';

      if (listType && listType !== nextType) {
        flushList();
      }

      listType = nextType;
      listItems.push((unordered || ordered)[1]);
      continue;
    }

    flushList();
    paragraph.push(line.trim());
  }

  flushParagraph();
  flushList();

  if (codeLines) {
    output.push(`<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
  }

  return output.join('\n');
}

function formatDate(date) {
  if (!date) return '';

  const parsed = new Date(`${date}T12:00:00Z`);

  return Number.isNaN(parsed.getTime())
    ? date
    : new Intl.DateTimeFormat('en-IN', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        timeZone: 'UTC'
      }).format(parsed);
}

function absoluteImageUrl(image) {
  const raw = String(image || '').trim();

  if (!raw) return '';

  // Only allow safe HTTP(S) URLs or local site paths for images.
  if (/^https?:\/\//i.test(raw)) return safeUrl(raw, true);
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw) || raw.startsWith('#')) return '';

  const cleanPath = raw.replace(/^\/+/, '');

  return cleanPath ? `${SITE_URL}/${cleanPath}` : '';
}

function readTime(text) {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 220));
}

function layoutStyles() {
  return `
    :root{color-scheme:light;--ink:#101820;--muted:#64707b;--line:#e5eaee;--accent:#f4c84b;--navy:#082b46;--paper:#fff;--soft:#f6f8fa}
    *{box-sizing:border-box}html{scroll-behavior:smooth;scroll-padding-top:96px}body{margin:0;background:var(--paper);color:var(--ink);font-family:'DM Sans',Arial,sans-serif;line-height:1.65;-webkit-font-smoothing:antialiased}
    a{color:inherit;text-decoration:none}a:hover{color:#087db1}img{max-width:100%;height:auto}button,a{outline-offset:4px}
    .site-header{position:sticky;top:0;z-index:50;background:rgba(255,255,255,.975);backdrop-filter:blur(18px);border-bottom:1px solid rgba(11,34,56,.09)}
    .header-inner{max-width:1360px;min-height:78px;margin:auto;padding:10px clamp(18px,3vw,42px);display:flex;align-items:center;gap:clamp(12px,1.35vw,20px)}
    .brand{display:flex;align-items:center;flex:0 0 auto}.brand img{display:block;width:clamp(142px,12.4vw,166px);max-height:44px;height:auto;object-fit:contain;object-position:left center}
    .main-nav{display:flex;align-items:center;justify-content:center;gap:clamp(8px,1.05vw,15px);margin-left:auto}.main-nav a{font-family:Manrope,'DM Sans',Arial,sans-serif;font-size:10.5px;font-weight:750;letter-spacing:.035em;text-transform:uppercase;line-height:1;color:#314758;white-space:nowrap;position:relative;padding:12px 0;transition:color .18s}.main-nav a:after{position:absolute;left:0;bottom:4px;height:2px;width:100%;content:"";background:var(--accent);transform:scaleX(0);transform-origin:left;transition:transform .18s}.main-nav a:hover:after,.main-nav a[aria-current="page"]:after{transform:scaleX(1)}.main-nav a:hover,.main-nav a[aria-current="page"]{color:#0b2238}
    .social-links{display:flex;align-items:center;gap:6px;flex:0 0 auto}.social-links a{display:grid;place-items:center;width:29px;height:29px;border:1px solid #e1e7eb;border-radius:50%;color:#0b2238}.social-links a:hover{background:#0b2238;color:#fff;border-color:#0b2238}.social-links svg{width:15px;height:15px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}.social-links .fb{fill:currentColor;stroke:none}
    .menu-toggle{display:none;background:#fff;border:1px solid #e5eaee;border-radius:10px;padding:8px;color:#0b2238}.menu-toggle svg{width:21px;height:21px;display:block}
    .wrap{width:min(1120px,calc(100% - 40px));margin-inline:auto}.eyebrow{text-transform:uppercase;font-weight:800;letter-spacing:.16em;font-size:12px;color:#806700}.hero{padding:72px 0 44px;border-bottom:1px solid var(--line);background:linear-gradient(180deg,#fff 0%,#fbfcfd 100%)}.hero h1{font-size:clamp(36px,4.35vw,58px);line-height:1.1;letter-spacing:-.055em;margin:14px 0 18px;max-width:880px}.hero p{max-width:720px;color:var(--muted);font-size:18px;line-height:1.75;margin:0}.publisher-link{margin-top:18px!important}.publisher-link a{display:inline-flex;align-items:center;border:1px solid #dbe3e9;border-radius:999px;padding:10px 15px;color:#0b2238;font-size:12px;font-weight:800;background:#fff}.publisher-link a:hover{border-color:#f4c84b;background:#fff8dc;color:#0b2238}
    .posts{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:24px;padding:42px 0 76px}.cms-runtime{padding:30px 0 20px}.cms-runtime[hidden]{display:none!important}.cms-runtime h2{font-size:clamp(26px,3vw,36px);letter-spacing:-.035em;margin:10px 0 0}.cms-runtime .posts{padding:22px 0 34px}.card{border:1px solid var(--line);border-radius:18px;overflow:hidden;background:#fff;display:flex;flex-direction:column;min-width:0;transition:transform .18s ease,box-shadow .18s ease}.card:hover{transform:translateY(-3px);box-shadow:0 16px 34px #0000000b}.card-image{aspect-ratio:16/9;background:linear-gradient(135deg,#0c2235,#31546b);display:flex;align-items:center;justify-content:center;overflow:hidden}.card-image img{height:100%;width:100%;object-fit:cover}.card-placeholder{color:var(--accent);font-size:12px;font-weight:800;letter-spacing:.17em;text-transform:uppercase}.card-content{padding:24px;display:flex;flex:1;flex-direction:column}.meta{color:var(--muted);font-size:12px;letter-spacing:.04em}.category{font-weight:800;color:#7a6500;text-transform:uppercase;font-size:11px;letter-spacing:.1em}.card h2{font-size:23px;line-height:1.2;letter-spacing:-.025em;margin:10px 0 12px}.card p{color:var(--muted);margin:0 0 20px;font-size:15px;line-height:1.7}.read-link{margin-top:auto;font-size:13px;font-weight:800;border-bottom:2px solid var(--accent);align-self:flex-start;padding-bottom:3px}.empty{padding:42px;border:1px dashed #c9c9c9;border-radius:16px;color:var(--muted);grid-column:1/-1}
    .archive{padding:6px 0 74px;border-top:1px solid var(--line)}.archive h2{font-size:clamp(26px,3vw,36px);letter-spacing:-.035em}.archive-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px 32px}.archive-link{padding:14px 0;border-bottom:1px solid var(--line);display:flex;gap:12px;align-items:baseline}.archive-link span{color:var(--muted);font-size:12px;min-width:95px}.archive-link strong{font-size:15px;line-height:1.4}
    .article-shell{width:min(850px,calc(100% - 40px));margin:0 auto;padding:52px 0 84px}.breadcrumbs{font-size:13px;color:var(--muted);margin-bottom:30px}.breadcrumbs a{text-decoration:underline;text-decoration-color:var(--accent);text-underline-offset:4px}.article-head h1{font-size:clamp(34px,4.35vw,58px);line-height:1.1;letter-spacing:-.055em;margin:12px 0 20px}.article-description{font-size:20px;line-height:1.5;color:#555;max-width:760px}.article-meta{display:flex;flex-wrap:wrap;gap:8px 18px;color:#666;font-size:13px;margin:24px 0}.featured{width:100%;max-height:500px;object-fit:cover;border-radius:20px;margin:14px 0 36px;background:#f3f3f3}.article-body{font-size:18px;line-height:1.85;color:#252525;overflow-wrap:anywhere}.article-body h2{font-size:clamp(28px,4vw,38px);line-height:1.18;letter-spacing:-.035em;margin:48px 0 12px;color:#111}.article-body h3{font-size:25px;line-height:1.25;margin:34px 0 12px}.article-body h4{font-size:21px;margin:28px 0 10px}.article-body p{margin:0 0 22px}.article-body a{color:#075d88;text-decoration:underline;text-decoration-color:var(--accent);text-underline-offset:4px}.article-body ul,.article-body ol{padding-left:28px;margin:0 0 24px}.article-body li{padding-left:5px;margin:8px 0}.article-body blockquote{margin:30px 0;padding:5px 0 5px 22px;border-left:4px solid var(--accent);color:#555}.article-body pre{white-space:pre-wrap;overflow:auto;background:#111;color:#eee;padding:18px;border-radius:10px;font-size:14px}.article-body code{font-size:.9em;background:#f1f1f1;padding:2px 5px;border-radius:4px}.article-body pre code{background:none;padding:0}.article-body img{border-radius:12px;margin:18px 0}.article-foot{border-top:1px solid var(--line);padding-top:28px;margin-top:54px;display:flex;flex-wrap:wrap;justify-content:space-between;gap:18px}.button{display:inline-block;padding:12px 18px;border-radius:999px;background:#082b46;color:#fff;font-size:13px;font-weight:800}.button:hover{background:#087db1;color:#fff}.cta{background:#082b46;color:#fff;border-radius:20px;padding:34px;margin-top:46px}.cta p{color:#d0dbe3;margin:5px 0 18px}.cta .button{background:var(--accent);color:#111}

    /* Footer styles matching the homepage */
    .footer{margin-top:0;background:#081b2d;color:#fff;padding:60px 0 22px}
    .container{width:min(1180px,calc(100% - 44px));margin-inline:auto}
    .footer-grid{display:grid;grid-template-columns:1.15fr .8fr .8fr 1fr;gap:34px;padding-bottom:38px}
    .footer-logo{display:block;width:min(138px,100%);max-height:42px;height:auto;object-fit:contain;background:#fff;border-radius:7px;padding:5px}
    .footer-about p,.footer-col p{color:#b7c7d3;font-size:13px;line-height:1.8;margin:1em 0}
    .footer-social{display:flex;gap:8px;margin-top:18px}
    .footer-social a{width:34px;height:34px;border:1px solid #526879;border-radius:50%;display:grid;place-items:center;color:#fff}
    .footer-social a:hover{background:var(--accent);border-color:var(--accent);color:var(--navy)}
    .footer-social svg{width:15px;height:15px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
    .footer-social .fb{fill:currentColor;stroke:none}
    .footer-col{display:flex;flex-direction:column;align-items:flex-start;gap:0}
    .footer-col h3{font-size:12px;text-transform:uppercase;letter-spacing:.14em;margin:4px 0 17px}
    .footer-col a{display:block;font-size:13px;color:#b7c7d3;margin:10px 0;line-height:1.6}
    .footer-col a:hover{color:#fff;text-decoration:underline;text-decoration-color:var(--accent);text-underline-offset:4px}
    /* Keep contact links inline inside footer address blocks, matching the homepage. */
    .footer-col p a{display:inline;margin:0;color:inherit;font-size:inherit;line-height:inherit}
    .footer-col p a:hover{color:#fff}
    .footer-bottom{border-top:1px solid #ffffff20;padding-top:18px;display:flex;justify-content:space-between;gap:20px;color:#91a5b5;font-size:11px}
    .footer-bottom p{margin:0}

    @media(max-width:1200px){.header-inner{gap:12px}.brand img{width:146px}.main-nav{gap:9px}.main-nav a{font-size:9.5px}.social-links a{width:27px;height:27px}}
    @media(max-width:980px){.header-inner{flex-wrap:wrap;gap:8px 14px;min-height:74px}.brand img{width:148px}.menu-toggle{display:block;margin-left:auto}.main-nav{display:none;order:4;flex:1 1 100%;margin:0;padding:8px 0 12px;align-items:stretch;flex-direction:column;gap:0}.main-nav.is-open{display:flex}.main-nav a{font-size:12px;padding:12px 5px;border-bottom:1px solid var(--line);line-height:1.3}.main-nav a:after{display:none}.social-links{margin-left:0}.posts{grid-template-columns:repeat(2,minmax(0,1fr))}}
    @media(max-width:600px){.header-inner{padding:9px 16px;gap:8px}.brand img{width:140px;max-height:40px}.social-links{gap:4px}.social-links a{width:26px;height:26px}.wrap{width:calc(100% - 32px)}.hero{padding:50px 0 30px}.hero h1{font-size:clamp(36px,8.8vw,50px)}.hero p{font-size:16px}.posts{grid-template-columns:1fr;padding:28px 0 52px;gap:18px}.card-content{padding:20px}.archive-grid{grid-template-columns:1fr}.article-shell{width:calc(100% - 32px);padding:34px 0 60px}.article-head h1{font-size:clamp(34px,8.8vw,48px)}.article-description{font-size:18px}.article-body{font-size:17px}.article-body h2{margin-top:38px}.archive-link{gap:10px}.archive-link span{min-width:82px}.footer-bottom{flex-direction:column;gap:5px}}
    @media(max-width:1120px){.footer-grid{grid-template-columns:1.2fr .8fr .8fr;gap:28px}.footer-col:last-child{grid-column:2/4}}
    @media(max-width:600px){.container{width:calc(100% - 34px)}.footer-grid{grid-template-columns:1fr;gap:24px;padding-bottom:28px}.footer-col:last-child{grid-column:auto}.footer-bottom{flex-direction:column;gap:5px}}
    @media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}.card{transition:none}.card:hover{transform:none}}
  `;
}

function head({ title, description, canonical, image = '', type = 'website', date = '' }) {
  const safeTitle = escapeHtml(title);
  const safeDesc = escapeHtml(description);
  const safeCanonical = escapeHtml(canonical);
  const safeImage = escapeHtml(image);

  const articleTags = type === 'article' ? `
    <meta property="article:published_time" content="${escapeHtml(date)}">
    <meta property="article:author" content="Swyft Media Productions">` : '';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${safeTitle}</title>
<meta name="description" content="${safeDesc}">
<meta name="author" content="Swyft Media Productions">
<meta name="robots" content="index,follow,max-image-preview:large">
<link rel="canonical" href="${safeCanonical}">
<link rel="sitemap" type="application/xml" title="Sitemap" href="../sitemap.xml">
<meta property="og:site_name" content="Swyft Media Productions">
<meta property="og:locale" content="en_IN">
<meta property="og:type" content="${type}">
<meta property="og:title" content="${safeTitle}">
<meta property="og:description" content="${safeDesc}">
<meta property="og:url" content="${safeCanonical}">
<meta property="og:image" content="${safeImage || `${SITE_URL}/swyft-media-logo-horizontal.png`}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${safeTitle}">
<meta name="twitter:description" content="${safeDesc}">
<meta name="twitter:image" content="${safeImage || `${SITE_URL}/swyft-media-logo-horizontal.png`}">
${articleTags}
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Manrope:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>${layoutStyles()}

    /* Mobile menu visibility is controlled by .is-open, never by default flex display. */
    .header-inner .main-nav{display:flex!important;gap:clamp(10px,.9vw,14px)!important;flex:1 1 auto;min-width:0}
    .header-inner .main-nav>a{font-size:12px!important;letter-spacing:0!important;white-space:nowrap!important}
    .header-inner .menu-toggle{display:none!important;align-items:center;justify-content:center;min-width:44px;min-height:44px;margin-left:auto;border:1px solid #dbe5eb;border-radius:11px;background:#fff;color:#0b2238;cursor:pointer}
    @media(max-width:980px){
      .site-header{backdrop-filter:none!important;-webkit-backdrop-filter:none!important}
      .header-inner{flex-wrap:wrap!important;justify-content:space-between!important;gap:8px!important;padding:9px 12px!important}
      .header-inner .brand{order:1;max-width:calc(100% - 158px)}
      .header-inner .brand img{width:clamp(128px,36vw,160px)!important;max-height:42px!important}
      .header-inner .menu-toggle{display:inline-flex!important;order:2}
      .header-inner .social-links{order:3;margin-left:0!important;gap:4px!important}
      .header-inner .social-links a{width:28px!important;height:28px!important}
      .header-inner .main-nav{display:none!important;order:4;flex:1 0 100%!important;width:100%!important;min-width:100%!important;margin:0!important;padding:8px 0 12px!important;align-items:stretch!important;justify-content:flex-start!important;flex-direction:column!important;gap:0!important;border-top:1px solid #e4eaf0}
      .header-inner .main-nav.is-open{display:flex!important}
      .header-inner .main-nav>a{display:flex!important;min-height:44px!important;padding:12px 7px!important;border-bottom:1px solid #e4eaf0!important;font-size:14px!important;line-height:1.35!important;text-transform:none!important;white-space:normal!important}
      .header-inner .main-nav>a:after{display:none!important}
    }
    @media(max-width:360px){.header-inner .brand img{width:124px!important}.header-inner .social-links a{width:26px!important;height:26px!important}}
    @media(prefers-reduced-motion:reduce){html{scroll-behavior:auto!important}*,*::before,*::after{animation-duration:.01ms!important;transition-duration:.01ms!important;scroll-behavior:auto!important}}
</style>
<link rel="stylesheet" href="../assets/sitewide-nav.css">
</head>`;
}

function header(active = false) {
  const social = `<div class="social-links" aria-label="Swyft Media social media links">
    <a href="https://www.instagram.com/swyftmediapr/" target="_blank" rel="noopener noreferrer" aria-label="Instagram" title="Instagram"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1"/></svg></a>
    <a href="https://www.linkedin.com/company/swyft-media-productions" target="_blank" rel="noopener noreferrer" aria-label="LinkedIn" title="LinkedIn"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 9v10M5 5.5v.1M10 19v-6a4 4 0 0 1 8 0v6M10 9v10"/><circle cx="5" cy="5.5" r="1"/></svg></a>
    <a href="https://www.facebook.com/p/SwYft-Media-ProductionS-61560788151421/" target="_blank" rel="noopener noreferrer" aria-label="Facebook" title="Facebook"><svg viewBox="0 0 24 24" aria-hidden="true"><path class="fb" d="M14.2 21v-8h2.7l.4-3.2h-3.1V7.7c0-.9.3-1.5 1.6-1.5h1.7V3.3c-.3 0-1.4-.1-2.7-.1-2.7 0-4.5 1.6-4.5 4.6v2H7.5V13h2.8v8z"/></svg></a>
  </div>`;

  const navLinks = [
    ['Home','../index.html'],
    ['About Us','../about.html'],
    ['Services','../services.html'],
    ['Projects','../projects.html'],
    ['Business Stories','../blog/'],
    ['Swyft Pass','../swyft-pass.html'],
    ['Contact','../contact.html']
  ];

  return `<header class="site-header">
    <div class="header-inner">
      <a class="brand" href="../index.html" aria-label="Swyft Media home"><img src="../swyft-media-logo-horizontal.webp" alt="Swyft Media Productions" width="460" height="100" decoding="async"></a>
      <button class="menu-toggle" type="button" aria-controls="swyft-main-nav" aria-expanded="false" aria-label="Open menu"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 7h16M4 12h16M4 17h16"/></svg></button>
      <nav class="main-nav" id="swyft-main-nav" aria-label="Main navigation">${navLinks.map(([label, href]) => `<a${(active && label === 'Business Stories') ? ' aria-current="page"' : ''} href="${href}">${label}</a>`).join('')}</nav>
      ${social}
    </div>
  </header>`;
}

function footer() {
  return `<footer class="footer"><div class="container"><div class="footer-grid"><div class="footer-about"><a aria-label="Swyft Media home" href="../index.html"><img alt="Swyft Media Productions" class="footer-logo" decoding="async" height="100" loading="lazy" src="../swyft-media-logo-horizontal.webp" width="460"/></a><p>From PR to pixels, we help brands build a clear voice, a stronger presence and measurable momentum.</p><div aria-label="Swyft Media social links" class="footer-social"><a aria-label="Instagram" href="https://www.instagram.com/swyftmediapr/" rel="noopener noreferrer" target="_blank" title="Instagram"><svg aria-hidden="true" viewBox="0 0 24 24"><rect height="18" rx="5" width="18" x="3" y="3"></rect><circle cx="12" cy="12" r="4"></circle><circle cx="17.5" cy="6.5" r=".8"></circle></svg></a><a aria-label="Linkedin" href="https://www.linkedin.com/company/swyft-media-productions" rel="noopener noreferrer" target="_blank" title="Linkedin"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M5 9v10M5 5.5v.1M10 19v-6a4 4 0 0 1 8 0v6M10 9v10"></path><circle cx="5" cy="5.5" r="1"></circle></svg></a><a aria-label="Facebook" href="https://www.facebook.com/p/SwYft-Media-ProductionS-61560788151421/" rel="noopener noreferrer" target="_blank" title="Facebook"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M14.2 21v-8h2.7l.4-3.2h-3.1V7.7c0-.9.3-1.5 1.6-1.5h1.7V3.3c-.3 0-1.4-.1-2.7-.1-2.7 0-4.5 1.6-4.5 4.6v2H7.5V13h2.8v8z" fill="currentColor" stroke="none"></path></svg></a></div></div><div class="footer-col"><h3>What we do</h3><a href="../services.html">Brand strategy</a><a href="../services.html">Digital marketing</a><a href="../services.html">Public relations</a><a href="../services.html">Web development</a><a href="../services.html">SEO &amp; performance</a></div><div class="footer-col"><h3>Explore</h3><a href="../about.html">About us</a><a href="../projects.html">Projects</a><a href="../people.html">Our people</a><a href="../blog/index.html">Business Stories</a><a href="../admin/">Publisher access</a><a href="../swyft-pass.html">Swyft Pass</a><a href="../contact.html">Contact</a></div><div class="footer-col"><h3>Talk to our team</h3><p><strong>Ahmedabad</strong><br/>707, Iscon Elegance, Near Shapath-V, S.G. Highway, Ahmedabad 380015<br/><a href="tel:+917096427107">+91 70964 27107</a><br/><a href="tel:+919978994010">+91 99789 94010</a><br/><a href="mailto:info@swyftmedia.in">info@swyftmedia.in</a></p><p><strong>Gandhidham</strong><br/>Plot No. 108, Sector 1A, Gandhidham-Kutch, Gujarat 370201<br/><a href="tel:+919512470015">+91 95124 70015</a><br/><a href="mailto:info@swyftmedia.in">info@swyftmedia.in</a></p></div></div><div class="footer-bottom"><span>© <span data-current-year="">${new Date().getUTCFullYear()}</span> Swyft Media Productions. All rights reserved.</span><span>Branding · Digital · PR · Creative</span></div></div></footer>`;
}

function jsonLd(obj) {
  return `<script type="application/ld+json">${JSON.stringify(obj).replace(/</g, '\\u003c')}</script>`;
}

function listingPage(posts, legacyPosts) {
  const cards = posts.map((post) => {
    const image = absoluteImageUrl(post.featuredImage);

    return `<article class="card" data-story-slug="${escapeHtml(post.slug)}">
      <a class="card-image" href="/${escapeHtml(post.slug)}/" aria-label="Read ${escapeHtml(post.title)}">${image ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(post.title)}" loading="lazy" decoding="async">` : `<span class="card-placeholder">Swyft Media Insights</span>`}</a>
      <div class="card-content">
        <div class="meta">${escapeHtml(formatDate(post.date))}${post.category ? ` &nbsp;·&nbsp; <span class="category">${escapeHtml(post.category)}</span>` : ''}</div>
        <h2><a href="/${escapeHtml(post.slug)}/">${escapeHtml(post.title)}</a></h2>
        <p>${escapeHtml(post.description)}</p>
        <a class="read-link" href="/${escapeHtml(post.slug)}/">Read article →</a>
      </div>
    </article>`;
  }).join('\n');

  const publishedSlugs = new Set(posts.map((post) => post.slug.toLowerCase()));
  const publishedTitles = new Set(posts.map((post) => post.title.trim().toLowerCase()));
  const seenLegacyKeys = new Set();

  const uniqueLegacyPosts = legacyPosts.filter((post) => {
    const titleKey = post.title.trim().toLowerCase();
    let slugKey = '';

    try {
      slugKey = new URL(post.link).pathname.replace(/\/+$/, '').split('/').filter(Boolean).pop() || '';
    } catch {
      /* loadLegacyPosts already validates the link */
    }

    const normalizedSlug = slugKey.toLowerCase();
    const key = normalizedSlug || titleKey;

    if (
      publishedTitles.has(titleKey) ||
      (normalizedSlug && publishedSlugs.has(normalizedSlug)) ||
      seenLegacyKeys.has(key)
    ) {
      return false;
    }

    seenLegacyKeys.add(key);
    return true;
  });

  const archive = uniqueLegacyPosts.length ? `<section class="archive" aria-labelledby="archive-title">
    <div class="wrap"><h2 id="archive-title">From the existing Swyft Media blog archive</h2>
    <p style="color:#666;max-width:760px">Explore earlier Swyft Media perspectives on branding, content, marketing and business growth. These archived stories open at their original publishing location.</p>
    <div class="posts">${uniqueLegacyPosts.map((post) => {
      const archiveImage = post.image
        ? `<img src="${escapeHtml(post.image)}" alt="${escapeHtml(post.title)}" loading="lazy" decoding="async">`
        : `<span class="card-placeholder">Swyft Media Stories</span>`;

      return `<article class="card"><a class="card-image" href="${escapeHtml(post.link)}" target="_blank" rel="noopener noreferrer" aria-label="Read ${escapeHtml(post.title)}">${archiveImage}</a><div class="card-content"><div class="meta">${escapeHtml(post.date)} &nbsp;·&nbsp; <span class="category">Archive</span></div><h2><a href="${escapeHtml(post.link)}" target="_blank" rel="noopener noreferrer">${escapeHtml(post.title)}</a></h2><p>${escapeHtml(post.description)}</p><a class="read-link" href="${escapeHtml(post.link)}" target="_blank" rel="noopener noreferrer">Read original story →</a></div></article>`;
    }).join('')}</div></div>
  </section>` : '';

  const itemList = posts.map((post, index) => ({
    '@type': 'ListItem',
    position: index + 1,
    item: {
      '@type': 'BlogPosting',
      headline: post.title,
      url: `${SITE_URL}/${post.slug}/`,
      datePublished: post.date,
      description: post.description,
      ...(post.featuredImage ? { image: absoluteImageUrl(post.featuredImage) } : {})
    }
  }));

  const schema = {
    '@context': 'https://schema.org',
    '@type': 'Blog',
    name: 'Business Stories',
    url: `${SITE_URL}/blog/`,
    publisher: {
      '@type': 'Organization',
      name: 'Swyft Media Productions',
      url: SITE_URL
    },
    blogPost: itemList.map((entry) => entry.item)
  };

  const latestSection = posts.length
    ? `<section class="wrap" aria-label="Latest articles"><div class="posts">${cards}</div></section>`
    : '';

  return `${head({
    title: 'Business Stories | Branding, Marketing & Creative Insights',
    description: 'Explore Swyft Media Business Stories covering brand strategy, digital marketing, public relations, creative thinking and business growth.',
    canonical: `${SITE_URL}/blog/`,
    image: `${SITE_URL}/swyft-media-logo-horizontal.png`
  })}
<body>${jsonLd(schema)}${header(true)}
<main>
  <section class="hero"><div class="wrap"><div class="eyebrow">Swyft Media · Ideas that move brands forward</div><h1>Business Stories</h1><p>Business wins, brand-building insights and practical perspectives on marketing, creative strategy and communication from the Swyft Media team.</p><p class="publisher-link"><a href="../admin/">Publish a new Business Story ↗</a></p></div></section>
  <section class="wrap cms-runtime" id="cmsRuntimeStories" aria-labelledby="cmsRuntimeTitle" hidden>
    <div class="eyebrow">Recently published</div><h2 id="cmsRuntimeTitle">Latest Business Stories</h2>
    <div class="posts" id="cmsStoriesGrid"></div>
  </section>
  ${latestSection}
  ${archive}
</main>${footer()}<script src="../cms-config.js"></script><script>
(function(){
  'use strict';

  var api = String(window.SWYFT_CMS_API_URL || '').trim().replace(/\\/+$/, '');
  var panel = document.getElementById('cmsRuntimeStories');
  var grid = document.getElementById('cmsStoriesGrid');

  if (!api || !panel || !grid) return;

  function make(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = String(text);
    return node;
  }

  function render(stories) {
    if (!Array.isArray(stories) || !stories.length) return;

    var staticCards = document.querySelectorAll('[data-story-slug]');
    var existingSlugs = new Set();
    var existingTitles = new Set();

    staticCards.forEach(function(card) {
      var slug = String(card.getAttribute('data-story-slug') || '').toLowerCase();
      var titleNode = card.querySelector('.card-content h2');
      var title = String(titleNode ? titleNode.textContent : '').trim().toLowerCase();

      if (slug) existingSlugs.add(slug);
      if (title) existingTitles.add(title);
    });

    var seenApiSlugs = new Set();

    stories = stories.filter(function(story) {
      if (
        !story ||
        !story.title ||
        !story.slug ||
        !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(story.slug)
      ) {
        return false;
      }

      var slug = String(story.slug).toLowerCase();
      var title = String(story.title).trim().toLowerCase();

      if (
        existingSlugs.has(slug) ||
        existingTitles.has(title) ||
        seenApiSlugs.has(slug)
      ) {
        return false;
      }

      seenApiSlugs.add(slug);
      return true;
    });

    if (!stories.length) return;

    stories.forEach(function(story) {
      var href = 'story.html?slug=' + encodeURIComponent(story.slug);
      var card = make('article', 'card');
      var imageLink = make('a', 'card-image');

      imageLink.href = href;
      imageLink.setAttribute('aria-label', 'Read ' + story.title);

      var cover = String(story.coverImage || '');

      if (/^https:\/\//i.test(cover)) {
        var img = make('img');
        img.src = cover;
        img.alt = story.title;
        img.loading = 'lazy';
        img.decoding = 'async';
        imageLink.appendChild(img);
      } else {
        imageLink.appendChild(make('span', 'card-placeholder', 'Swyft Media Insights'));
      }

      var content = make('div', 'card-content');
      var d = new Date(String(story.date || '') + 'T00:00:00Z');

      var dateText = Number.isNaN(d.getTime())
        ? ''
        : d.toLocaleDateString('en-IN', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
            timeZone: 'UTC'
          });

      content.appendChild(make('div', 'meta', dateText + ' · Published'));

      var h = make('h2');
      var titleLink = make('a', '', story.title);
      titleLink.href = href;
      h.appendChild(titleLink);
      content.appendChild(h);

      content.appendChild(make('p', '', story.description || ''));

      var read = make('a', 'read-link', 'Read article →');
      read.href = href;
      content.appendChild(read);

      card.appendChild(imageLink);
      card.appendChild(content);
      grid.appendChild(card);
    });

    if (grid.children.length) panel.hidden = false;
  }

  fetch(api + '/api/stories', {
    headers: { 'Accept': 'application/json' }
  })
    .then(function(response) {
      if (!response.ok) throw new Error('Stories unavailable');
      return response.json();
    })
    .then(render)
    .catch(function() {
      // Keep static and archived stories available if the API is offline.
    });
})();
</script><script src="../assets/site.js" defer></script></body></html>`;
}

function articlePage(post) {
  const url = `${SITE_URL}/${post.slug}/`;
  const canonicalImage = absoluteImageUrl(post.featuredImage);

  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    '@id': `${url}#article`,
    headline: post.title,
    description: post.description,
    datePublished: post.date,
    dateModified: post.date,
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': url
    },
    author: {
      '@type': 'Organization',
      name: post.author || 'Swyft Media Productions',
      url: SITE_URL
    },
    publisher: {
      '@type': 'Organization',
      name: 'Swyft Media Productions',
      url: SITE_URL,
      logo: {
        '@type': 'ImageObject',
        url: `${SITE_URL}/swyft-media-logo-horizontal.png`
      }
    },
    ...(canonicalImage ? { image: [canonicalImage] } : {}),
    ...(post.category ? { articleSection: post.category } : {}),
    ...(post.tags.length ? { keywords: post.tags.join(', ') } : {})
  };

  const featuredImageUrl = absoluteImageUrl(post.featuredImage);

  const featured = featuredImageUrl
    ? `<img class="featured" src="${escapeHtml(featuredImageUrl)}" alt="${escapeHtml(post.title)}" fetchpriority="high" decoding="async">`
    : '';

  return `${head({
    title: `${post.title} | Swyft Media Productions`,
    description: post.description,
    canonical: url,
    image: canonicalImage,
    type: 'article',
    date: post.date
  })}
<body>${jsonLd(structuredData)}${header(true)}
<main class="article-shell">
  <nav class="breadcrumbs" aria-label="Breadcrumb"><a href="/">Home</a> &nbsp;›&nbsp; <a href="../blog/">Business Stories</a> &nbsp;›&nbsp; <span>${escapeHtml(post.title)}</span></nav>
  <article>
    <header class="article-head">
      ${post.category ? `<div class="eyebrow">${escapeHtml(post.category)}</div>` : ''}
      <h1>${escapeHtml(post.title)}</h1>
      <p class="article-description">${escapeHtml(post.description)}</p>
      <div class="article-meta"><span>By ${escapeHtml(post.author)}</span><time datetime="${escapeHtml(post.date)}">${escapeHtml(formatDate(post.date))}</time><span>${readTime(post.body)} min read</span></div>
    </header>
    ${featured}
    <div class="article-body">${markdownToHtml(post.body)}</div>
    ${post.tags.length ? `<p class="meta" style="margin-top:32px">Topics: ${post.tags.map(escapeHtml).join(' · ')}</p>` : ''}
  </article>
  <div class="article-foot"><a class="button" href="../blog/">← All articles</a><a class="button" href="mailto:info@swyftmedia.in">Talk to Swyft Media</a></div>
  <aside class="cta"><h2 style="margin:0;font-size:26px">Ready to move your brand forward?</h2><p>Talk to Swyft Media about branding, digital marketing and creative communication.</p><a class="button" href="mailto:info@swyftmedia.in">Contact our team</a></aside>
</main>${footer()}<script src="../assets/site.js" defer></script></body></html>`;
}

function loadLegacyPosts() {
  if (!fs.existsSync(LEGACY_POSTS_FILE)) return [];

  const parsed = JSON.parse(fs.readFileSync(LEGACY_POSTS_FILE, 'utf8'));

  if (!Array.isArray(parsed)) {
    throw new Error('content/legacy-blog-posts.json must contain an array.');
  }

  return parsed.map((post) => ({
    date: String(post.date || '').trim(),
    title: String(post.title || '').trim(),
    description: String(post.description || post.desc || '').trim(),
    link: String(post.link || '').trim(),
    image: String(post.image || '').trim()
  })).filter((post) => post.title && /^https:\/\//i.test(post.link));
}

function copyPublicRoot() {
  fs.rmSync(SITE_DIR, { recursive: true, force: true });
  fs.mkdirSync(SITE_DIR, { recursive: true });

  for (const name of fs.readdirSync(ROOT)) {
    if (EXCLUDED_ROOT_ITEMS.has(name)) continue;

    const sourcePath = path.join(ROOT, name);
    const targetPath = path.join(SITE_DIR, name);
    const stat = fs.lstatSync(sourcePath);

    if (stat.isSymbolicLink()) continue;

    if (stat.isDirectory()) {
      fs.cpSync(sourcePath, targetPath, { recursive: true });
    } else if (stat.isFile()) {
      fs.copyFileSync(sourcePath, targetPath);
    }
  }

  fs.writeFileSync(path.join(SITE_DIR, '.nojekyll'), '');
}

function writeSitemap(posts) {
  // Rebuild from authoritative public routes on every build.
  // Do not carry URLs for deleted or unpublished articles forward.
  const urls = new Map();

  for (const route of [
    '/',
    '/about.html',
    '/services.html',
    '/projects.html',
    '/people.html',
    '/swyft-pass.html',
    '/contact.html',
    '/blog/'
  ]) {
    urls.set(`${SITE_URL}${route}`, '');
  }

  for (const post of posts) {
    urls.set(`${SITE_URL}/${post.slug}/`, post.date);
  }

  const xmlEscape = (value) => value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${[...urls.entries()].map(([url, lastmod]) => `  <url>
    <loc>${xmlEscape(url)}</loc>${lastmod ? `
    <lastmod>${lastmod}</lastmod>` : ''}
  </url>`).join('\n')}
</urlset>
`;

  // Keep the source sitemap useful for local/static preview and deployment.
  fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), xml);
  fs.writeFileSync(path.join(SITE_DIR, 'sitemap.xml'), xml);
}

function main() {
  if (!fs.existsSync(CONTENT_DIR)) {
    fs.mkdirSync(CONTENT_DIR, { recursive: true });
  }

  const files = fs.readdirSync(CONTENT_DIR)
    .filter((name) => name.endsWith('.md') && name.toLowerCase() !== 'readme.md')
    .sort();

  const posts = files
    .map((name) => parsePost(path.join(CONTENT_DIR, name)))
    .filter((post) => post.published);

  const seen = new Set();

  for (const post of posts) {
    if (seen.has(post.slug)) {
      throw new Error(`Duplicate published slug: ${post.slug}`);
    }

    if (
      RESERVED_SLUGS.has(post.slug) ||
      fs.existsSync(path.join(ROOT, post.slug))
    ) {
      throw new Error(
        `The slug "${post.slug}" conflicts with a reserved route or existing root-level path. Choose a different slug.`
      );
    }

    seen.add(post.slug);
  }

  posts.sort((a, b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title));

  copyPublicRoot();

  const blogDir = path.join(SITE_DIR, 'blog');
  fs.mkdirSync(blogDir, { recursive: true });

  const legacyPosts = loadLegacyPosts();
  const generatedListing = listingPage(posts, legacyPosts);

  fs.writeFileSync(path.join(blogDir, 'index.html'), generatedListing);

  for (const post of posts) {
    const postDir = path.join(SITE_DIR, post.slug);
    fs.mkdirSync(postDir, { recursive: true });
    fs.writeFileSync(path.join(postDir, 'index.html'), articlePage(post));
  }

  // Also create a source-tree listing for VS Code / Live Server previews.
  // Production deploys only _site, where article links stay root-relative.
  const sourceBlogDir = path.join(ROOT, 'blog');
  fs.mkdirSync(sourceBlogDir, { recursive: true });

  const sourcePreviewListing = generatedListing.replace(
    /href=\"\/([a-z0-9]+(?:-[a-z0-9]+)*)\/\"/g,
    (match, slug) => seen.has(slug)
      ? `href=\"../_site/${slug}/\"`
      : match
  );

  fs.writeFileSync(path.join(sourceBlogDir, 'index.html'), sourcePreviewListing);

  writeSitemap(posts);

  // Ensure the correct plural filename for crawler rules in the deployed output.
  fs.writeFileSync(
    path.join(SITE_DIR, 'robots.txt'),
    'User-agent: *\nAllow: /\nDisallow: /admin/\n\nSitemap: https://swyftmedia.in/sitemap.xml\n'
  );

  console.log(
    `Built blog listing with ${posts.length} published article(s) and ${legacyPosts.length} legacy archive link(s).`
  );

  console.log(`Output directory: ${path.relative(ROOT, SITE_DIR)}`);
}

try {
  main();
} catch (error) {
  console.error(`Blog build failed: ${error.message}`);
  process.exitCode = 1;
}
