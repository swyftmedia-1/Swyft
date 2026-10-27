# Local CMS credentials file

The actual local `.env` is deliberately not bundled in the website ZIP so private environment values do not get committed accidentally. Download `SwyftMedia-CMS-Local.env` separately, copy it into `cms-server/`, and rename it to `.env` for local testing only. Its temporary credentials are shared with the handoff instructions in this conversation; replace them before any production use. `.gitignore` should keep `cms-server/.env` out of Git.
