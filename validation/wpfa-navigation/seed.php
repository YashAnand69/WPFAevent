<?php
// Test-only fixture: execute with wp eval-file after activating the real plugin.
$overview = str_repeat( '<p>Placeholder event overview for navigation validation. No real attendee or speaker data.</p>', 55 );
$event_id = wp_insert_post( array(
    'post_type' => 'wpfa_event',
    'post_status' => 'publish',
    'post_title' => 'Navigation demonstration',
    'post_name' => 'navigation-demo',
    'post_content' => $overview,
) );
update_post_meta( $event_id, 'wpfa_event_start_date', '2027-03-15' );
update_post_meta( $event_id, 'wpfa_event_end_date', '2027-03-16' );
update_post_meta( $event_id, 'wpfa_event_url', home_url( '/registration/' ) );
update_post_meta( $event_id, 'wpfa_event_custom_tabs', array(
    array( 'title' => 'Event details', 'slug' => 'details', 'content' => '<p>Details section target. This content comes from real event metadata.</p>' ),
) );
update_post_meta( $event_id, 'wpfa_event_custom_navigation', array(
    array( 'text' => 'Event overview', 'type' => 'link', 'href' => '#about' ),
    array( 'text' => 'Event details', 'type' => 'link', 'href' => '#custom-section-details' ),
    array( 'text' => 'More information', 'type' => 'dropdown', 'items' => array(
        array( 'text' => 'Overview again', 'type' => 'link', 'href' => '#about' ),
        array( 'text' => 'Travel', 'type' => 'custom_page', 'slug' => 'travel', 'title' => 'Travel information', 'href' => '?custom_page=travel', 'content' => '<p>Placeholder travel information on an actual custom event page.</p>' ),
    ) ),
) );
$home_id = wp_insert_post( array( 'post_type' => 'page', 'post_status' => 'publish', 'post_title' => 'Events', 'post_name' => 'events' ) );
update_post_meta( $home_id, '_wp_page_template', 'page-events.php' );
update_option( 'show_on_front', 'page' );
update_option( 'page_on_front', $home_id );
$coc_id = wp_insert_post( array( 'post_type' => 'page', 'post_status' => 'publish', 'post_title' => 'Code of Conduct', 'post_name' => 'code-of-conduct', 'post_content' => 'Placeholder conduct guidance.' ) );
update_post_meta( $coc_id, '_wp_page_template', 'page-code-of-conduct.php' );
update_option( 'permalink_structure', '/%postname%/' );
flush_rewrite_rules( false );
$urls = array(
    'home' => home_url( '/' ),
    'event' => get_permalink( $event_id ),
    'custom' => add_query_arg( 'custom_page', 'travel', get_permalink( $event_id ) ),
    'event_id' => $event_id,
    'home_id' => $home_id,
);
echo wp_json_encode( $urls ) . PHP_EOL;
