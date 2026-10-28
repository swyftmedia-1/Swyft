# Local CMS testing

1. Copy `cms-server/.env.example` to `cms-server/.env`.
2. Replace all placeholders, including the GitHub owner/repository, a fine-grained GitHub token with Contents read/write permission, JWT secret, admin username and bcrypt password hash. Do not commit `.env`.
3. In a terminal, run `cd cms-server` and then `npm install`.
4. Run `npm run dev`. The API should report that it is listening on port 3000 and that CMS content and image storage use GitHub.
5. Open `admin/index.html` through Live Server. Ensure `ALLOWED_ORIGINS` exactly matches the Live Server origin. Use `COOKIE_SECURE=false` and `COOKIE_SAME_SITE=lax` locally.
6. Test draft save, publish, edit, delete and image upload. Check that article Markdown appears in `content/blog/` and uploaded images appear in `content/blog/upload/`.

Never use a production token in local development. Revoke any token that has ever been committed or shared in a ZIP.
