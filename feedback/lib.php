<?php
/** Client Feedback — shared functions. Not meant to be opened directly. */
if (!defined('NLFB')) { http_response_code(403); exit; }

if (!is_file(__DIR__ . '/config.php')) {
    http_response_code(500);
    $msg = 'Client Feedback is not configured yet: copy feedback/config.example.php to feedback/config.php and edit it.';
    if (strpos(isset($_SERVER['SCRIPT_NAME']) ? $_SERVER['SCRIPT_NAME'] : '', 'save.php') !== false) {
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(array('ok' => false, 'error' => $msg));
    } else {
        echo htmlspecialchars($msg);
    }
    exit;
}
require_once __DIR__ . '/config.php';
date_default_timezone_set(TIMEZONE);

define('DATA_DIR', __DIR__ . '/data');
define('SHOTS_DIR', DATA_DIR . '/shots');
define('JSON_FILE', DATA_DIR . '/comments.json');
define('REPORT_FILE', DATA_DIR . '/review-comments.html');
define('RATE_FILE', DATA_DIR . '/rate.json');

function nlfb_json($data, $code = 200) {
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function nlfb_ensure_dirs() {
    foreach (array(DATA_DIR, SHOTS_DIR) as $d) {
        if (!is_dir($d)) @mkdir($d, 0755, true);
    }
    if (!file_exists(DATA_DIR . '/.htaccess')) {
        @file_put_contents(DATA_DIR . '/.htaccess', "# Block direct web access to stored feedback\n<IfModule mod_authz_core.c>\n  Require all denied\n</IfModule>\n<IfModule !mod_authz_core.c>\n  Order allow,deny\n  Deny from all\n</IfModule>\n");
    }
    if (!file_exists(DATA_DIR . '/index.html')) @file_put_contents(DATA_DIR . '/index.html', '');
    if (!file_exists(SHOTS_DIR . '/index.html')) @file_put_contents(SHOTS_DIR . '/index.html', '');
    return is_writable(DATA_DIR) && is_writable(SHOTS_DIR);
}

/** Run $fn(array $items): array|null with an exclusive lock on comments.json. Returns final items. */
function nlfb_with_store($fn) {
    $fh = fopen(JSON_FILE, 'c+');
    if (!$fh) return false;
    flock($fh, LOCK_EX);
    $raw = stream_get_contents($fh);
    $items = $raw ? json_decode($raw, true) : array();
    if (!is_array($items)) $items = array();
    $new = $fn($items);
    if (is_array($new)) {
        ftruncate($fh, 0);
        rewind($fh);
        fwrite($fh, json_encode($new, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
        fflush($fh);
        $items = $new;
    }
    flock($fh, LOCK_UN);
    fclose($fh);
    return $items;
}

function nlfb_read_store() {
    if (!file_exists(JSON_FILE)) return array();
    $items = json_decode((string)@file_get_contents(JSON_FILE), true);
    return is_array($items) ? $items : array();
}

/** Next comment id. A counter file makes sure ids of deleted comments are never reused. Call inside nlfb_with_store. */
function nlfb_next_id($items) {
    $counter = DATA_DIR . '/last-id.txt';
    $max = (int)@file_get_contents($counter);
    foreach ($items as $it) {
        if (preg_match('/^FB-(\d+)$/', isset($it['id']) ? $it['id'] : '', $m)) $max = max($max, (int)$m[1]);
    }
    @file_put_contents($counter, (string)($max + 1));
    return sprintf('FB-%04d', $max + 1);
}

function nlfb_str($v, $max) {
    $v = is_scalar($v) ? (string)$v : '';
    $v = str_replace("\0", '', $v);
    if (function_exists('mb_substr')) return mb_substr(trim($v), 0, $max, 'UTF-8');
    return substr(trim($v), 0, $max);
}

if (!defined('CLOSE_PASSWORD')) define('CLOSE_PASSWORD', '');
if (!defined('ADMIN_PASSWORD')) define('ADMIN_PASSWORD', '');

/** A password counts as set only when it is not empty and not the CHANGE-ME placeholder. */
function nlfb_pw_set($pw) { return $pw !== '' && strpos($pw, 'CHANGE-ME') !== 0; }

/** 'admin', 'close' or '' for the given password. */
function nlfb_pw_role($given) {
    $given = (string)$given;
    if ($given === '') return '';
    if (nlfb_pw_set(ADMIN_PASSWORD) && hash_equals(ADMIN_PASSWORD, $given)) return 'admin';
    if (nlfb_pw_set(CLOSE_PASSWORD) && hash_equals(CLOSE_PASSWORD, $given)) return 'close';
    return '';
}

function nlfb_status_label($s) {
    $map = array('open' => 'Open', 'in-progress' => 'In progress', 'resolved' => 'Closed');
    return isset($map[$s]) ? $map[$s] : $s;
}

/** Fields the public widget may see (no device, url, html). */
function nlfb_public($c) {
    $replies = array();
    foreach (isset($c['replies']) ? (array)$c['replies'] : array() as $r) {
        $replies[] = array('id' => $r['id'], 'author' => $r['author'], 'comment' => $r['comment'], 'created' => $r['created']);
    }
    return array(
        'id' => $c['id'], 'status' => isset($c['status']) ? $c['status'] : 'open',
        'author' => $c['author'], 'type' => $c['type'], 'comment' => $c['comment'], 'created' => $c['created'],
        'selector' => $c['selector'], 'hash' => $c['hash'], 'click' => $c['click'], 'replies' => $replies,
        'closed_by' => isset($c['closed_by']) ? $c['closed_by'] : '', 'closed_at' => isset($c['closed_at']) ? $c['closed_at'] : '',
    );
}

/** Permanently remove comments (and their screenshots). Returns the remaining items, or false. */
function nlfb_delete_ids($ids) {
    $removed = array();
    $all = nlfb_with_store(function ($items) use ($ids, &$removed) {
        $keep = array();
        foreach ($items as $it) {
            if (in_array($it['id'], $ids, true)) { $removed[] = $it; continue; }
            $keep[] = $it;
        }
        return $keep;
    });
    foreach ($removed as $it) {
        if (!empty($it['screenshot']) && preg_match('#^shots/FB-\d+\.(jpg|png)$#', $it['screenshot'])) @unlink(DATA_DIR . '/' . $it['screenshot']);
    }
    return $all === false ? false : array('items' => $all, 'removed' => count($removed));
}

/** Rate limit per IP. $bucket separates e.g. comments from password attempts. */
function nlfb_rate_ok($ip, $bucket = 'post', $limit = null, $window = null) {
    $limit = $limit === null ? RATE_LIMIT_COUNT : $limit;
    $window = $window === null ? RATE_LIMIT_WINDOW : $window;
    $now = time();
    $fh = fopen(RATE_FILE, 'c+');
    if (!$fh) return true;
    flock($fh, LOCK_EX);
    $data = json_decode((string)stream_get_contents($fh), true);
    if (!is_array($data)) $data = array();
    foreach ($data as $k => $times) {
        $data[$k] = array_values(array_filter((array)$times, function ($t) use ($now) { return $t > $now - 3600; }));
        if (!$data[$k]) unset($data[$k]);
    }
    $key = $bucket . ':' . md5($ip);
    $recent = isset($data[$key]) ? array_filter($data[$key], function ($t) use ($now, $window) { return $t > $now - $window; }) : array();
    $ok = count($recent) < $limit;
    if ($ok) $data[$key][] = $now;
    ftruncate($fh, 0); rewind($fh); fwrite($fh, json_encode($data)); fflush($fh);
    flock($fh, LOCK_UN); fclose($fh);
    return $ok;
}

function h($s) { return htmlspecialchars((string)$s, ENT_QUOTES, 'UTF-8'); }

/**
 * Writes data/feedback-report.html — one self-contained HTML file that people can read
 * and that also carries every comment as JSON (<script id="feedback-data">) for Claude.
 * Screenshot paths are relative (shots/FB-0001.jpg), so the file works inside the export zip.
 */
function nlfb_build_report($items) {
    $total = count($items);
    $open = 0; $prog = 0; $done = 0;
    foreach ($items as $it) {
        $s = isset($it['status']) ? $it['status'] : 'open';
        if ($s === 'resolved') $done++; elseif ($s === 'in-progress') $prog++; else $open++;
    }
    // Group by page, newest first inside each page.
    $byPage = array();
    foreach ($items as $it) $byPage[$it['page']][] = $it;
    ksort($byPage);

    $json = json_encode(array(
        'project' => PROJECT_NAME,
        'generated' => date('c'),
        'format' => 'nlfb-1',
        'comments' => $items,
    ), JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_HEX_AMP);

    ob_start(); ?>
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Review Comments · <?= h(PROJECT_NAME) ?></title>
<!--
  FOR CLAUDE / DEVELOPERS:
  Every comment is stored as JSON in the script element with id "feedback-data" at the end of this file.
  Per comment: id, status, page, url, hash, selector (CSS selector of the clicked element),
  section, heading, element {tag,id,classes,text,html}, click {xPct,yPct}, viewport, comment, author, type,
  created, screenshot (relative path, or null), replies [{id, author, comment, created}] (a conversation
  under the comment: read it, the latest reply may change or clarify the request), status
  (open / in-progress / resolved = closed), closed_by, closed_at.
  Use selector + element.html + element.text to find the exact markup in the site's HTML files.
-->
<style>
  :root{--bg:#f6f7f9;--card:#fff;--ink:#111827;--muted:#6b7280;--line:#e5e7eb;--accent:#ea580c;--ok:#16a34a;--prog:#2563eb}
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
  header{background:#111827;color:#fff;padding:24px 16px}
  .wrap{max-width:1040px;margin:0 auto;padding:0 16px}
  header .wrap{padding:0}
  h1{margin:0 0 4px;font-size:22px}
  header p{margin:0;color:#d1d5db;font-size:14px}
  .stats{display:flex;gap:10px;flex-wrap:wrap;margin:18px 0 0}
  .stat{background:rgba(255,255,255,.08);border-radius:10px;padding:10px 14px;min-width:110px}
  .stat b{display:block;font-size:22px}
  .stat span{font-size:12px;color:#d1d5db}
  .filters{display:flex;gap:8px;flex-wrap:wrap;margin:20px 0 4px}
  .filters button{border:1px solid var(--line);background:#fff;border-radius:999px;padding:6px 14px;font:inherit;font-size:13px;cursor:pointer}
  .filters button.on{background:var(--ink);color:#fff;border-color:var(--ink)}
  h2{font-size:16px;margin:28px 0 10px;word-break:break-all}
  h2 small{color:var(--muted);font-weight:400}
  .c{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:16px;margin:0 0 12px;display:grid;grid-template-columns:1fr 240px;gap:16px}
  .c.resolved{opacity:.6}
  .top{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:6px}
  .id{font-weight:700}
  .pill{font-size:12px;border-radius:999px;padding:2px 9px;background:#f3f4f6;color:#374151}
  .st-open{background:#fff1e6;color:var(--accent)} .st-in-progress{background:#e8efff;color:var(--prog)} .st-resolved{background:#e7f6ec;color:var(--ok)}
  .text{font-size:16px;white-space:pre-wrap;margin:6px 0 10px}
  .meta{font-size:13px;color:var(--muted)}
  .meta code{background:#f3f4f6;color:#111827;padding:1px 5px;border-radius:4px;font-size:12px;word-break:break-all}
  .meta div{margin:2px 0}
  .shot img{width:100%;border:1px solid var(--line);border-radius:8px;display:block}
  .shot .none{height:100%;min-height:90px;display:flex;align-items:center;justify-content:center;color:var(--muted);font-size:13px;border:1px dashed var(--line);border-radius:8px}
  .replies{margin:10px 0 0;border-left:2px solid var(--line);padding-left:12px}
  .reply{margin:0 0 8px;font-size:14px}
  .reply .who{font-weight:600}
  .reply .when{color:var(--muted);font-size:12px}
  .reply .body{white-space:pre-wrap}
  form.st button.del{color:#b91c1c;border-color:#fecaca}
  .note{margin-top:8px;font-size:13px;background:#f9fafb;border-left:3px solid var(--ok);padding:6px 10px}
  form.st{margin-top:10px;display:flex;gap:6px;flex-wrap:wrap}
  form.st button{font:inherit;font-size:12px;border:1px solid var(--line);background:#fff;border-radius:6px;padding:4px 10px;cursor:pointer}
  .empty{padding:60px 0;text-align:center;color:var(--muted)}
  @media (max-width:720px){.c{grid-template-columns:1fr}}
</style>
</head>
<body>
<header><div class="wrap">
  <h1>Review Comments</h1>
  <p><?= h(PROJECT_NAME) ?> · generated <?= h(date('d M Y, H:i')) ?> (<?= h(TIMEZONE) ?>)</p>
  <div class="stats">
    <div class="stat"><b><?= $total ?></b><span>Total</span></div>
    <div class="stat"><b><?= $open ?></b><span>Open</span></div>
    <div class="stat"><b><?= $prog ?></b><span>In progress</span></div>
    <div class="stat"><b><?= $done ?></b><span>Closed</span></div>
  </div>
</div></header>
<main class="wrap">
<?php if (!$total): ?>
  <p class="empty">No comments yet.</p>
<?php else: ?>
  <div class="filters">
    <button type="button" class="on" data-f="all">All</button>
    <button type="button" data-f="open">Open</button>
    <button type="button" data-f="in-progress">In progress</button>
    <button type="button" data-f="resolved">Closed</button>
  </div>
<?php foreach ($byPage as $page => $list):
    usort($list, function ($a, $b) { return strcmp($a['id'], $b['id']); }); ?>
  <h2><?= h($page) ?> <small>(<?= count($list) ?>)</small></h2>
<?php foreach ($list as $c):
    $st = isset($c['status']) ? $c['status'] : 'open'; ?>
  <article class="c <?= h($st) ?>" data-status="<?= h($st) ?>" id="<?= h($c['id']) ?>">
    <div>
      <div class="top">
        <span class="id"><?= h($c['id']) ?></span>
        <span class="pill st-<?= h($st) ?>"><?= h(nlfb_status_label($st)) ?></span>
        <span class="pill"><?= h($c['type']) ?></span>
        <span class="meta"><?= h($c['author']) ?> · <?= h(date('d M Y, H:i', strtotime($c['created']))) ?></span>
      </div>
      <div class="text"><?= h($c['comment']) ?></div>
      <div class="meta">
        <?php if (!empty($c['heading'])): ?><div>Near heading: <strong><?= h($c['heading']) ?></strong></div><?php endif; ?>
        <div>Clicked: <code>&lt;<?= h($c['element']['tag']) ?>&gt;</code> <?= h($c['element']['text']) ?></div>
        <div>Selector: <code><?= h($c['selector']) ?></code></div>
        <div>Screen: <?= (int)$c['viewport']['w'] ?>×<?= (int)$c['viewport']['h'] ?> · <a href="<?= h($c['url']) ?>" target="_blank" rel="noopener">open page</a></div>
      </div>
      <?php if (!empty($c['replies'])): ?>
      <div class="replies">
        <?php foreach ($c['replies'] as $r): ?>
        <div class="reply"><span class="who"><?= h($r['author']) ?></span> <span class="when">· <?= h(date('d M Y, H:i', strtotime($r['created']))) ?></span><div class="body"><?= h($r['comment']) ?></div></div>
        <?php endforeach; ?>
      </div>
      <?php endif; ?>
      <?php if ($st === 'resolved' && !empty($c['closed_by'])): ?><div class="note">Closed by <?= h($c['closed_by']) ?><?= !empty($c['closed_at']) ? ' · ' . h(date('d M Y, H:i', strtotime($c['closed_at']))) : '' ?></div><?php endif; ?>
      <?php if (!empty($c['resolution_note'])): ?><div class="note"><?= h($c['resolution_note']) ?></div><?php endif; ?>
      <!--STATUS_FORM:<?= h($c['id']) ?>-->
    </div>
    <div class="shot">
      <?php if (!empty($c['screenshot'])): ?>
        <a href="<?= h($c['screenshot']) ?>" target="_blank"><img src="<?= h($c['screenshot']) ?>" alt="Screenshot for <?= h($c['id']) ?>" loading="lazy"></a>
      <?php else: ?><div class="none">No screenshot</div><?php endif; ?>
    </div>
  </article>
<?php endforeach; endforeach; endif; ?>
</main>
<script type="application/json" id="feedback-data">
<?= $json ?>

</script>
<script>
  document.querySelectorAll('.filters button').forEach(function (b) {
    b.addEventListener('click', function () {
      document.querySelectorAll('.filters button').forEach(function (x) { x.classList.toggle('on', x === b); });
      var f = b.getAttribute('data-f');
      document.querySelectorAll('article.c').forEach(function (a) {
        a.style.display = (f === 'all' || a.getAttribute('data-status') === f) ? '' : 'none';
      });
    });
  });
</script>
</body>
</html>
<?php
    $html = ob_get_clean();
    @file_put_contents(REPORT_FILE, $html, LOCK_EX);
    return $html;
}
