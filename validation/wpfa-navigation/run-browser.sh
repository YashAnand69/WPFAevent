#!/usr/bin/env bash
set -euo pipefail
plugin=$1
harness=$2
output=$3
base=$4
site=/tmp/wpfa-navigation-site
mkdir -p "$output"
export WPFA_FIXTURE="$output/site-fixture.json"
export WPFA_SITE_DIR="$site"
paths=(public/partials/header.php includes/helpers/class-wpfaevent-main-navigation-helper.php public/class-wpfaevent-public.php public/js/wpfaevent-public.js)
restore_source() { for file in "${paths[@]}"; do git -C "$plugin" show "HEAD:$file" > "$plugin/$file"; done; }
restore_everything() { restore_source; if [[ -n "${server_pid:-}" ]]; then kill "$server_pid" 2>/dev/null || true; fi; }
trap restore_everything EXIT
wp core download --path="$site" --force
wp config create --path="$site" --dbname=wordpress_browser --dbuser=root --dbpass=wordpress_test_password --dbhost=127.0.0.1 --skip-check
wp db create --path="$site"
wp core install --path="$site" --url=http://127.0.0.1:8188 --title='Navigation validation' --admin_user=validation --admin_password=throwaway_navigation_password --admin_email=validation@example.invalid --skip-email
ln -s "$plugin" "$site/wp-content/plugins/wpfaevent"
wp rewrite structure '/%postname%/' --path="$site"
wp plugin activate wpfaevent --path="$site"
wp eval-file "$harness/seed.php" --path="$site" > "$WPFA_FIXTURE"
python3 -c 'import json,os; x=json.load(open(os.environ["WPFA_FIXTURE"])); assert all(x[k].startswith("http://127.0.0.1:8188/") for k in ("home","event","custom"))'
wp theme install twentytwentyone twentytwentythree --path="$site" --force
wp core version --path="$site" > "$output/wordpress-version.txt"
wp theme list --path="$site" --format=json > "$output/theme-versions.json"
php -d opcache.enable=0 -d opcache.enable_cli=0 -S 127.0.0.1:8188 -t "$site" "$harness/router.php" > "$output/php-server.log" 2>&1 &
server_pid=$!
for attempt in $(seq 1 40); do if curl -fsS http://127.0.0.1:8188/ > /dev/null; then break; fi; sleep 1; done
curl -fsS http://127.0.0.1:8188/ > /dev/null
failures=0
for theme in twentytwentyone twentytwentythree; do
  wp theme activate "$theme" --path="$site"
  export WPFA_THEME="$theme"
  for mode in baseline fixed; do
    export WPFA_MODE="$mode"
    export WPFA_OUTPUT="$output/$theme/$mode"
    mkdir -p "$WPFA_OUTPUT"
    if [[ "$mode" == baseline ]]; then for file in "${paths[@]}"; do git -C "$plugin" show "$base:$file" > "$plugin/$file"; done; else restore_source; fi
    if ! node "$harness/browser/browser.cjs" > "$WPFA_OUTPUT/browser.log" 2>&1; then failures=$((failures+1)); fi
    if [[ "$mode" == baseline ]] && ! python3 -c 'import json,sys; x=json.load(open(sys.argv[1])); assert x["baseline_reproduced"] and not x["unexpectedFailures"]' "$WPFA_OUTPUT/results.json"; then failures=$((failures+1)); fi
    wp eval-file "$harness/malformed-seed.php" --path="$site" > "$WPFA_OUTPUT/wordpress-url-escaping.json"
    export WPFA_MALFORMED_OUTPUT="$WPFA_OUTPUT/malformed-results.json"
    if ! node "$harness/browser/malformed.cjs" > "$WPFA_OUTPUT/malformed-browser.log" 2>&1; then failures=$((failures+1)); fi
    WPFA_RESTORE_NAV=1 wp eval-file "$harness/malformed-seed.php" --path="$site"
  done
done
restore_source
git -C "$plugin" diff --exit-code -- "${paths[@]}"
printf '%s\n' "$failures" > "$output/failed-browser-groups.txt"
test "$failures" -eq 0
