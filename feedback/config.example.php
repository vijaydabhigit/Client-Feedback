<?php
/**
 * Client Feedback — settings.
 *
 * 1. Copy this file to config.php (same folder).
 * 2. Change REPORT_KEY and the two passwords below.
 * 3. Upload. config.php is listed in .gitignore, so your real keys never end up in Git.
 */
if (!defined('NLFB')) { http_response_code(403); exit; }

// 1) Secret key for the report page:  https://your-site.com/feedback/report.php?key=THIS-VALUE
//    Use a long random string (letters + numbers). Do NOT share it with the client.
define('REPORT_KEY', 'CHANGE-ME-to-a-long-random-string');

// 2) Passwords for actions on the site (checked on the server, never visible to visitors).
//    CLOSE_PASSWORD: give to the client. Lets them close a comment once it is done (closed comments are hidden on the site).
//    ADMIN_PASSWORD: team only. Lets you close OR permanently delete a comment from the site.
//    Leave a password empty ('') to switch that action off.
define('CLOSE_PASSWORD', 'CHANGE-ME-client-close-password');
define('ADMIN_PASSWORD', 'CHANGE-ME-team-admin-password');

// 3) Project name shown at the top of the report.
define('PROJECT_NAME', 'My project');

// 4) Time zone used for comment dates.
define('TIMEZONE', 'Asia/Kolkata');

// 5) Limits (normally no need to change).
define('MAX_COMMENT_CHARS', 3000);
define('MAX_SCREENSHOT_BYTES', 2 * 1024 * 1024);   // 2 MB per screenshot
define('RATE_LIMIT_COUNT', 40);                    // max comments ...
define('RATE_LIMIT_WINDOW', 600);                  // ... per IP per 10 minutes

// 6) Optional: only accept comments sent from these hosts (leave empty to accept any).
//    Example: array('nexus-demos.com', 'www.nexus-demos.com')
$ALLOWED_HOSTS = array();
