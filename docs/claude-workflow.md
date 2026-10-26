# Applying client feedback with Claude

Client Feedback records exactly which element each comment is about, so Claude can find the right
markup and make the change. A round of feedback looks like this:

1. **Download** — open your report (`/feedback/report.php?key=YOUR-KEY`) and click
   **Download open comments for Claude (.zip)**. The zip contains:
   - `review-comments.html` — readable report; every comment and reply is also embedded as JSON
     in the `<script id="feedback-data">` element at the end of the file
   - `comments.json` — the same data as plain JSON
   - `shots/` — one screenshot per comment, clicked element outlined in orange
2. **Ask Claude** — attach the zip and your site's HTML files (or open the project folder in
   Claude / Claude Code) and paste the prompt below.
3. **Review and upload** the changed files.
4. **Close the loop** — reply on each pin ("Done, please check") so the client can close it, or
   close the IDs yourself in the report (**Close these**).

## Prompt

```text
Here is client feedback for this site (review-comments zip) and the site's HTML files.

Read review-comments.html from the zip. Each comment has: id, page, the CSS selector of the
element the client clicked, the element's HTML and text, the nearest heading, a screenshot in
shots/, and replies (read the whole thread: a later reply can change or clarify the request).

For every comment:
1. Find the exact element in the matching HTML file (use selector + element HTML + text).
2. Make the change the client asked for, keeping the existing styles and design system.
3. If a comment is unclear, is a question, or would change scope, do not guess. List it under
   "Needs our decision".

Then give me:
- the changed files,
- a table: ID, page, what you changed,
- the IDs that are done, comma separated, so I can close them in the report.
```

## Data format (per comment)

| Field | Meaning |
|---|---|
| `id` | `FB-0001`, never reused |
| `status` | `open`, `in-progress` or `resolved` (shown as Closed) |
| `page`, `url`, `title` | Where the comment was made (`/index.html` is stored as `/`) |
| `selector` | CSS selector of the clicked element |
| `element` | `tag`, `id`, `classes`, `text`, `html` (first 800 characters) of the clicked element |
| `heading`, `section` | Nearest heading text and nearest ancestor id, for context |
| `click` | Click position inside the element (`xPct`, `yPct`) and on the page |
| `viewport` | Screen size and scroll position of the commenter |
| `comment`, `author`, `type`, `created` | The comment itself |
| `replies` | `[{id, author, comment, created}]` |
| `closed_by`, `closed_at` | Who closed it and when |
| `screenshot` | Relative path in the zip (`shots/FB-0001.jpg`) or `null` |

## Frameworks (React, Next.js, Laravel, WordPress)

The widget works on any rendered page. For plain HTML sites the selector points straight at
the source. For component-based sites the rendered HTML is built from several files, so Claude
uses the element's text, classes and nearest heading to find the component — this works well in
practice, but ask Claude to confirm the file before editing when the match is ambiguous.
