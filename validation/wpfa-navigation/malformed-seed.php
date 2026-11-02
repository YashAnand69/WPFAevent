<?php
// Real WordPress escaping and registered post-meta sanitization, not a fake DOM.
$fixture = json_decode(file_get_contents(getenv('WPFA_FIXTURE')), true);
$event_id = (int) $fixture['event_id'];
$items = get_post_meta($event_id, 'wpfa_event_custom_navigation', true);
if (getenv('WPFA_RESTORE_NAV')) {
    $original = get_option('wpfa_validation_original_navigation');
    update_post_meta($event_id, 'wpfa_event_custom_navigation', $original);
    delete_option('wpfa_validation_original_navigation');
    return;
}
update_option('wpfa_validation_original_navigation', $items);
$probes = array('http://[invalid', 'http://[::1', 'http://%zz', 'http://[invalid/#about');
$diagnostics = array();
foreach ($probes as $index => $url) {
    $items[] = array('text' => 'Malformed URL probe ' . $index, 'type' => 'link', 'href' => $url);
    $diagnostics[] = array('raw' => $url, 'esc_url_raw' => esc_url_raw($url), 'esc_url' => esc_url($url));
}
update_post_meta($event_id, 'wpfa_event_custom_navigation', $items);
echo wp_json_encode(array('escaping' => $diagnostics, 'stored_navigation' => get_post_meta($event_id, 'wpfa_event_custom_navigation', true))) . PHP_EOL;
