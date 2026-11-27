<?php
$upload = wp_upload_dir();
$dir = trailingslashit( $upload['basedir'] ) . 'fossasia-data';
wp_mkdir_p( $dir );
file_put_contents( "$dir/logo.svg", '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100"><circle cx="50" cy="50" r="32" fill="#0055cc"/></svg>' );
$logo = trailingslashit( $upload['baseurl'] ) . 'fossasia-data/logo.svg';
$urls = array();
foreach ( array( 'with-logo', 'cleared-logo' ) as $name ) {
    $id = wp_insert_post( array(
        'post_type' => 'wpfa_event',
        'post_status' => 'publish',
        'post_title' => ucfirst( str_replace( '-', ' ', $name ) ),
        'post_name' => $name,
        'post_content' => '<p>Sample event.</p>',
    ) );
    update_post_meta( $id, 'wpfa_event_logo_url', 'with-logo' === $name ? $logo : '' );
    file_put_contents( "$dir/site-settings-$id.json", wp_json_encode( array( 'event_logo_url' => $logo ) ) );
    $urls[$name] = get_permalink( $id );
}
flush_rewrite_rules( false );
echo wp_json_encode( $urls ) . PHP_EOL;
