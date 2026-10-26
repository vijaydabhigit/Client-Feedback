<?php
/**
 * Client Feedback — public endpoint used by the widget.
 *   GET  ?action=list&page=/path        → all comments for that page (open and closed)
 *   POST {comment, author, ...}         → save a new comment
 *   POST {action:"reply",  id, author, comment}
 *   POST {action:"close",  id, password, author}   → CLOSE_PASSWORD or ADMIN_PASSWORD
 *   POST {action:"delete", id, password}           → ADMIN_PASSWORD only
 */
define('NLFB', 1);
require __DIR__ . '/lib.php';

if (!nlfb_ensure_dirs()) {
    nlfb_json(array('ok' => false, 'error' => 'Comments folder is not writable on the server (feedback/data).'), 500);
}

// Optional host check (see config.php)
if (!empty($ALLOWED_HOSTS)) {
    $origin = isset($_SERVER['HTTP_ORIGIN']) ? $_SERVER['HTTP_ORIGIN'] : (isset($_SERVER['HTTP_REFERER']) ? $_SERVER['HTTP_REFERER'] : '');
    $host = parse_url($origin, PHP_URL_HOST);
    if ($host && !in_array(strtolower($host), array_map('strtolower', $ALLOWED_HOSTS), true)) {
        nlfb_json(array('ok' => false, 'error' => 'Not allowed from this site.'), 403);
    }
}

$method = isset($_SERVER['REQUEST_METHOD']) ? $_SERVER['REQUEST_METHOD'] : 'GET';
$ip = isset($_SERVER['REMOTE_ADDR']) ? $_SERVER['REMOTE_ADDR'] : '0.0.0.0';
$features = array(
    'close'  => nlfb_pw_set(CLOSE_PASSWORD) || nlfb_pw_set(ADMIN_PASSWORD),
    'delete' => nlfb_pw_set(ADMIN_PASSWORD),
);

// ---------- list ----------
if ($method === 'GET') {
    $action = isset($_GET['action']) ? $_GET['action'] : '';
    if ($action !== 'list') nlfb_json(array('ok' => false, 'error' => 'Unknown action'), 400);
    $page = isset($_GET['page']) ? (string)$_GET['page'] : '';
    $norm = function ($p) { return preg_replace('#/index\.html?$#i', '/', $p); };
    $out = array();
    foreach (nlfb_read_store() as $c) {
        if ($page !== '' && $norm($c['page']) !== $norm($page)) continue;
        $out[] = nlfb_public($c);
    }
    nlfb_json(array('ok' => true, 'items' => $out, 'features' => $features));
}

if ($method !== 'POST') nlfb_json(array('ok' => false, 'error' => 'Method not allowed'), 405);

$raw = file_get_contents('php://input');
if (strlen($raw) > MAX_SCREENSHOT_BYTES * 1.5 + 200000) nlfb_json(array('ok' => false, 'error' => 'Comment is too large.'), 413);
$in = json_decode($raw, true);
if (!is_array($in)) nlfb_json(array('ok' => false, 'error' => 'Invalid data.'), 400);
$action = isset($in['action']) ? (string)$in['action'] : 'comment';

// Honeypot: real users never fill this hidden field.
if (!empty($in['website'])) nlfb_json(array('ok' => true, 'item' => null));

/** Find one comment by id or stop with 404. */
function nlfb_need($id) {
    foreach (nlfb_read_store() as $c) if ($c['id'] === $id) return $c;
    nlfb_json(array('ok' => false, 'error' => 'This comment no longer exists. Reload the page.'), 404);
}

/** Check a password for an action; counts wrong attempts (10 per 15 minutes per visitor). */
function nlfb_need_role($given, $allowed, $ip) {
    if (!nlfb_rate_ok($ip, 'pw', 10, 900)) nlfb_json(array('ok' => false, 'error' => 'Too many wrong passwords. Please wait 15 minutes.'), 429);
    $role = nlfb_pw_role($given);
    if ($role === 'close' && !in_array('close', $allowed, true)) {
        nlfb_json(array('ok' => false, 'error' => 'This password can close comments but not delete them. Deleting needs the team password.', 'badPassword' => true), 403);
    }
    if (!in_array($role, $allowed, true)) nlfb_json(array('ok' => false, 'error' => 'Wrong password.', 'badPassword' => true), 403);
    return $role;
}

$id = strtoupper(nlfb_str(isset($in['id']) ? $in['id'] : '', 20));

// ---------- reply ----------
if ($action === 'reply') {
    if (!nlfb_rate_ok($ip)) nlfb_json(array('ok' => false, 'error' => 'Too many messages in a short time. Please wait a few minutes.'), 429);
    $text = nlfb_str(isset($in['comment']) ? $in['comment'] : '', MAX_COMMENT_CHARS);
    $author = nlfb_str(isset($in['author']) ? $in['author'] : '', 80);
    if ($text === '') nlfb_json(array('ok' => false, 'error' => 'Please type your reply.'), 422);
    if ($author === '') nlfb_json(array('ok' => false, 'error' => 'Please add your name.'), 422);
    $c = nlfb_need($id);
    if (isset($c['status']) && $c['status'] === 'resolved') nlfb_json(array('ok' => false, 'error' => 'This comment is closed.'), 409);
    $updated = null;
    $all = nlfb_with_store(function ($items) use ($id, $text, $author, &$updated) {
        foreach ($items as &$it) {
            if ($it['id'] !== $id) continue;
            $replies = isset($it['replies']) ? (array)$it['replies'] : array();
            $replies[] = array('id' => 'R' . (count($replies) + 1), 'author' => $author, 'comment' => $text, 'created' => date('c'));
            $it['replies'] = $replies;
            $it['updated'] = date('c');
            $updated = $it;
        }
        return $items;
    });
    if ($all === false || !$updated) nlfb_json(array('ok' => false, 'error' => 'Could not save the reply.'), 500);
    nlfb_build_report($all);
    nlfb_json(array('ok' => true, 'item' => nlfb_public($updated)));
}

// ---------- close ----------
if ($action === 'close') {
    if (!$features['close']) nlfb_json(array('ok' => false, 'error' => 'Closing comments is switched off.'), 403);
    nlfb_need($id);
    $role = nlfb_need_role(isset($in['password']) ? $in['password'] : '', array('close', 'admin'), $ip);
    $who = nlfb_str(isset($in['author']) ? $in['author'] : '', 80);
    $all = nlfb_with_store(function ($items) use ($id, $who, $role) {
        foreach ($items as &$it) {
            if ($it['id'] !== $id) continue;
            $it['status'] = 'resolved';
            $it['closed_at'] = date('c');
            $it['closed_by'] = ($who !== '' ? $who : 'Unknown') . ($role === 'admin' ? ' (team)' : '');
            $it['updated'] = date('c');
        }
        return $items;
    });
    if ($all === false) nlfb_json(array('ok' => false, 'error' => 'Could not close the comment.'), 500);
    nlfb_build_report($all);
    nlfb_json(array('ok' => true, 'id' => $id));
}

// ---------- delete ----------
if ($action === 'delete') {
    if (!$features['delete']) nlfb_json(array('ok' => false, 'error' => 'Deleting comments is switched off.'), 403);
    nlfb_need($id);
    nlfb_need_role(isset($in['password']) ? $in['password'] : '', array('admin'), $ip);
    $res = nlfb_delete_ids(array($id));
    if ($res === false) nlfb_json(array('ok' => false, 'error' => 'Could not delete the comment.'), 500);
    nlfb_build_report($res['items']);
    nlfb_json(array('ok' => true, 'id' => $id));
}

if ($action !== 'comment') nlfb_json(array('ok' => false, 'error' => 'Unknown action'), 400);

// ---------- new comment ----------
if (!nlfb_rate_ok($ip)) nlfb_json(array('ok' => false, 'error' => 'Too many comments in a short time. Please wait a few minutes.'), 429);

$comment = nlfb_str(isset($in['comment']) ? $in['comment'] : '', MAX_COMMENT_CHARS);
$author  = nlfb_str(isset($in['author']) ? $in['author'] : '', 80);
if ($comment === '') nlfb_json(array('ok' => false, 'error' => 'Please type your comment.'), 422);
if ($author === '')  nlfb_json(array('ok' => false, 'error' => 'Please add your name.'), 422);

$types = array('Design', 'Content / text', 'Bug / not working', 'Question', 'Other');
$type = isset($in['type']) && in_array($in['type'], $types, true) ? $in['type'] : 'Other';

$el = isset($in['element']) && is_array($in['element']) ? $in['element'] : array();
$ck = isset($in['click']) && is_array($in['click']) ? $in['click'] : array();
$vp = isset($in['viewport']) && is_array($in['viewport']) ? $in['viewport'] : array();

$item = array(
    'id'       => '',  // set under lock
    'status'   => 'open',
    'created'  => date('c'),
    'author'   => $author,
    'type'     => $type,
    'comment'  => $comment,
    'page'     => preg_replace('#/index\.html?$#i', '/', nlfb_str(isset($in['page']) ? $in['page'] : '/', 500)),
    'url'      => nlfb_str(isset($in['url']) ? $in['url'] : '', 1000),
    'hash'     => nlfb_str(isset($in['hash']) ? $in['hash'] : '', 300),
    'title'    => nlfb_str(isset($in['title']) ? $in['title'] : '', 300),
    'selector' => nlfb_str(isset($in['selector']) ? $in['selector'] : '', 1000),
    'section'  => nlfb_str(isset($in['section']) ? $in['section'] : '', 200),
    'heading'  => nlfb_str(isset($in['heading']) ? $in['heading'] : '', 200),
    'element'  => array(
        'tag'     => nlfb_str(isset($el['tag']) ? $el['tag'] : '', 30),
        'id'      => nlfb_str(isset($el['id']) ? $el['id'] : '', 200),
        'classes' => nlfb_str(isset($el['classes']) ? $el['classes'] : '', 500),
        'text'    => nlfb_str(isset($el['text']) ? $el['text'] : '', 300),
        'html'    => nlfb_str(isset($el['html']) ? $el['html'] : '', 1200),
    ),
    'click'    => array(
        'xPct'  => isset($ck['xPct']) ? (float)$ck['xPct'] : 50,
        'yPct'  => isset($ck['yPct']) ? (float)$ck['yPct'] : 50,
        'pageX' => isset($ck['pageX']) ? (int)$ck['pageX'] : 0,
        'pageY' => isset($ck['pageY']) ? (int)$ck['pageY'] : 0,
    ),
    'viewport' => array(
        'w' => isset($vp['w']) ? (int)$vp['w'] : 0,
        'h' => isset($vp['h']) ? (int)$vp['h'] : 0,
        'scrollY' => isset($vp['scrollY']) ? (int)$vp['scrollY'] : 0,
    ),
    'device'   => nlfb_str(isset($in['device']) ? $in['device'] : '', 400),
    'screenshot' => null,
    'replies'  => array(),
    'resolution_note' => '',
);

$shotData = null;
if (!empty($in['screenshot']) && is_string($in['screenshot'])
    && preg_match('#^data:image/(jpeg|png);base64,([A-Za-z0-9+/=]+)$#', $in['screenshot'], $m)) {
    $bin = base64_decode($m[2], true);
    if ($bin !== false && strlen($bin) <= MAX_SCREENSHOT_BYTES && @getimagesizefromstring($bin)) {
        $shotData = array('ext' => $m[1] === 'png' ? 'png' : 'jpg', 'bin' => $bin);
    }
}

$saved = null;
$all = nlfb_with_store(function ($items) use (&$item, &$saved, $shotData) {
    $item['id'] = nlfb_next_id($items);
    if ($shotData) {
        $file = $item['id'] . '.' . $shotData['ext'];
        if (@file_put_contents(SHOTS_DIR . '/' . $file, $shotData['bin']) !== false) $item['screenshot'] = 'shots/' . $file;
    }
    $items[] = $item;
    $saved = $item;
    return $items;
});
if ($all === false || !$saved) nlfb_json(array('ok' => false, 'error' => 'Could not save the comment on the server.'), 500);

nlfb_build_report($all);

nlfb_json(array('ok' => true, 'item' => nlfb_public($saved), 'features' => $features));
