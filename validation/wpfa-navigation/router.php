<?php
// Fork-only loopback WordPress development router; no plugin behavior is replaced.
$site = getenv('WPFA_SITE_DIR');
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
if ($path && is_file($site . $path)) {
    return false;
}
require $site . '/index.php';
