#!/usr/bin/env python3
"""Client Feedback: add or remove the widget line on every HTML page of a site.

Run it from the site folder that contains the feedback/ folder:

    python tools/add_feedback.py            # add the line to every page
    python tools/add_feedback.py --remove   # remove it again (before go-live)
    python tools/add_feedback.py path/to/site [--remove]

The line uses a path relative to each page (feedback/feedback.js, ../feedback/feedback.js, ...),
so the site works in any folder or domain. Pages that already have the line are skipped.
"""
import os
import re
import sys

args = [a for a in sys.argv[1:] if not a.startswith('--')]
REMOVE = '--remove' in sys.argv
ROOT = args[0] if args else '.'
TAG_RE = re.compile(r'[ \t]*<script src="[^"]*feedback/feedback\.js"[^>]*></script>\r?\n?')

if not REMOVE and not os.path.isfile(os.path.join(ROOT, 'feedback', 'feedback.js')):
    sys.exit('No feedback/feedback.js found in %s. Copy the feedback folder into the site first.' % os.path.abspath(ROOT))

changed = 0
for dirpath, dirnames, files in os.walk(ROOT):
    dirnames[:] = [d for d in dirnames if d != 'feedback' and not d.startswith('.') and d != 'node_modules']
    for name in sorted(files):
        if not name.lower().endswith(('.html', '.htm')):
            continue
        path = os.path.join(dirpath, name)
        with open(path, 'rb') as f:
            text = f.read().decode('utf-8', errors='surrogateescape')
        if REMOVE:
            new = TAG_RE.sub('', text)
        else:
            if 'feedback/feedback.js' in text:
                print('Already has it:', path)
                continue
            idx = text.lower().rfind('</body>')
            if idx < 0:
                print('Skipped (no </body>):', path)
                continue
            rel = os.path.relpath(dirpath, ROOT)
            depth = 0 if rel == '.' else rel.count(os.sep) + 1
            nl = '\r\n' if '\r\n' in text else '\n'
            tag = '<script src="%sfeedback/feedback.js" defer></script>' % ('../' * depth)
            new = text[:idx] + tag + nl + text[idx:]
        if new != text:
            with open(path, 'wb') as f:
                f.write(new.encode('utf-8', errors='surrogateescape'))
            changed += 1
            print(('Removed: ' if REMOVE else 'Added:   ') + path)

print('Done: %d page(s) %s.' % (changed, 'cleaned' if REMOVE else 'updated'))
