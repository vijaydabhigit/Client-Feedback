# Changelog

## 1.1.0 — 2026-10-26

First public release.

- Click-to-comment widget ("Review Comments" button) for any HTML page: comment on the exact element, with type, name and an optional screenshot (clicked element outlined).
- Numbered pins on the page: orange = open, blue = in progress, green ✓ = closed.
- Comment threads: anyone can reply; replies go into the report and the export for Claude.
- Close a comment with the client password; close or permanently delete with the team password. Passwords live only in `config.php` on the server. Wrong passwords are rate-limited.
- Private report page (secret key): filter by status, close/reopen/delete, download open comments as a zip (HTML report with embedded JSON, `comments.json`, screenshots).
- Comment IDs are never reused, even after a delete.
- Flat-file storage (no database), spam honeypot and rate limits, `.htaccess` protection of stored data.
- `feedback.js` is a fixed loader that always fetches `widget.js` fresh, so updates show even on hosts that cache JavaScript (e.g. SiteGround).
- Button moves clear of the site's own fixed corner buttons (back-to-top, chat bubbles).
- Install tools add/remove the script line on every page with correct relative paths.
