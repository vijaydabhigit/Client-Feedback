<?php
/**
 * Client Feedback — private report for your team (never share this link with the client).
 *   report.php?key=KEY                 → readable report: mark comments Open / In progress / Closed, delete
 *   report.php?key=KEY&download=zip    → review-comments zip (HTML report + JSON + screenshots) to give Claude
 *   report.php?key=KEY&format=json     → raw comments.json
 */
define('NLFB', 1);
require __DIR__ . '/lib.php';
nlfb_ensure_dirs();

header('X-Robots-Tag: noindex, nofollow');
header('Cache-Control: no-store');

$key = isset($_REQUEST['key']) ? (string)$_REQUEST['key'] : '';
if (REPORT_KEY === '' || strpos(REPORT_KEY, 'CHANGE-ME') === 0) {
    http_response_code(500);
    exit('Set REPORT_KEY in feedback/config.php before using the report.');
}
if (!hash_equals(REPORT_KEY, $key)) {
    http_response_code(403);
    exit('Access denied.');
}
$qkey = rawurlencode($key);

// ---------- update status (one or many ids) ----------
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $ids = preg_split('/[\s,]+/', isset($_POST['ids']) ? (string)$_POST['ids'] : '', -1, PREG_SPLIT_NO_EMPTY);
    $status = isset($_POST['status']) ? (string)$_POST['status'] : '';
    $note = nlfb_str(isset($_POST['note']) ? $_POST['note'] : '', 1000);
    $ids = array_map('strtoupper', $ids);
    if ($ids && isset($_POST['delete'])) {
        $res = nlfb_delete_ids($ids);
        if ($res !== false) nlfb_build_report($res['items']);
        header('Location: report.php?key=' . $qkey, true, 303);
        exit;
    }
    if ($ids && in_array($status, array('open', 'in-progress', 'resolved'), true)) {
        $ids = array_map('strtoupper', $ids);
        $all = nlfb_with_store(function ($items) use ($ids, $status, $note) {
            foreach ($items as &$it) {
                if (in_array($it['id'], $ids, true)) {
                    $it['status'] = $status;
                    $it['updated'] = date('c');
                    if ($status === 'resolved') { $it['closed_at'] = date('c'); $it['closed_by'] = 'Team (report)'; }
                    else { unset($it['closed_at'], $it['closed_by']); }
                    if ($note !== '') $it['resolution_note'] = $note;
                }
            }
            return $items;
        });
        if ($all !== false) nlfb_build_report($all);
    }
    header('Location: report.php?key=' . $qkey . '#' . (isset($ids[0]) ? rawurlencode($ids[0]) : ''), true, 303);
    exit;
}

// ---------- screenshot ----------
if (isset($_GET['shot'])) {
    $f = basename((string)$_GET['shot']);
    if (!preg_match('/^FB-\d+\.(jpg|png)$/', $f) || !is_file(SHOTS_DIR . '/' . $f)) { http_response_code(404); exit; }
    header('Content-Type: ' . (substr($f, -3) === 'png' ? 'image/png' : 'image/jpeg'));
    readfile(SHOTS_DIR . '/' . $f);
    exit;
}

$items = nlfb_read_store();

// ---------- raw JSON ----------
if (isset($_GET['format']) && $_GET['format'] === 'json') {
    header('Content-Type: application/json; charset=utf-8');
    if (isset($_GET['download'])) header('Content-Disposition: attachment; filename="comments.json"');
    echo json_encode($items, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

// ---------- export zip for Claude ----------
if (isset($_GET['download']) && $_GET['download'] === 'zip') {
    $only = isset($_GET['status']) ? (string)$_GET['status'] : 'unresolved';
    $export = array_values(array_filter($items, function ($c) use ($only) {
        $s = isset($c['status']) ? $c['status'] : 'open';
        return $only === 'all' ? true : $s !== 'resolved';
    }));
    $html = nlfb_build_report($export);
    nlfb_build_report($items); // keep the stored report complete
    if (!class_exists('ZipArchive')) {
        header('Content-Type: text/html; charset=utf-8');
        header('Content-Disposition: attachment; filename="review-comments.html"');
        echo $html; // screenshots not included without ZipArchive
        exit;
    }
    $tmp = tempnam(sys_get_temp_dir(), 'nlfb');
    $zip = new ZipArchive();
    $zip->open($tmp, ZipArchive::OVERWRITE);
    $zip->addFromString('review-comments.html', $html);
    $zip->addFromString('comments.json', json_encode($export, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
    foreach ($export as $c) {
        if (!empty($c['screenshot']) && is_file(DATA_DIR . '/' . $c['screenshot'])) {
            $zip->addFile(DATA_DIR . '/' . $c['screenshot'], $c['screenshot']);
        }
    }
    $zip->close();
    $name = 'review-comments-' . date('Y-m-d-Hi') . '.zip';
    header('Content-Type: application/zip');
    header('Content-Disposition: attachment; filename="' . $name . '"');
    header('Content-Length: ' . filesize($tmp));
    readfile($tmp);
    @unlink($tmp);
    exit;
}

// ---------- readable report with team controls ----------
$html = nlfb_build_report($items);
$html = str_replace(
    array('src="shots/', 'href="shots/'),
    array('src="report.php?key=' . h($qkey) . '&amp;shot=', 'href="report.php?key=' . h($qkey) . '&amp;shot='),
    $html
);
$html = preg_replace_callback('/<!--STATUS_FORM:(FB-\d+)-->/', function ($m) use ($key) {
    $f = '<form class="st" method="post" action="report.php"><input type="hidden" name="key" value="' . h($key) . '">'
       . '<input type="hidden" name="ids" value="' . h($m[1]) . '">';
    foreach (array('open' => 'Open', 'in-progress' => 'In progress', 'resolved' => 'Close') as $s => $label) {
        $f .= '<button name="status" value="' . $s . '">' . $label . '</button>';
    }
    $f .= '<button class="del" name="delete" value="1" onclick="return confirm(\'Delete ' . h($m[1]) . ' permanently?\')">Delete</button>';
    return $f . '</form>';
}, $html);

$toolbar = '<div class="wrap" style="margin-top:18px;display:flex;gap:10px;flex-wrap:wrap;align-items:center">'
  . '<a href="report.php?key=' . h($qkey) . '&amp;download=zip" style="background:#ea580c;color:#fff;text-decoration:none;font-weight:600;padding:9px 14px;border-radius:8px">Download open comments for Claude (.zip)</a>'
  . '<a href="report.php?key=' . h($qkey) . '&amp;download=zip&amp;status=all" style="color:#111827">Download all</a>'
  . '<form method="post" action="report.php" style="display:flex;gap:6px;flex-wrap:wrap;margin-left:auto">'
  . '<input type="hidden" name="key" value="' . h($key) . '">'
  . '<input name="ids" placeholder="IDs, e.g. FB-0001, FB-0004" style="padding:8px;border:1px solid #d1d5db;border-radius:8px;min-width:220px">'
  . '<input name="note" placeholder="Note (optional)" style="padding:8px;border:1px solid #d1d5db;border-radius:8px">'
  . '<button name="status" value="resolved" style="padding:8px 12px;border-radius:8px;border:0;background:#16a34a;color:#fff;font-weight:600;cursor:pointer">Close these</button>'
  . '</form></div>';
$html = preg_replace('#</header>#', '</header>' . $toolbar, $html, 1);

header('Content-Type: text/html; charset=utf-8');
echo $html;
