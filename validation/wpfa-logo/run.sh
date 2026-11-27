#!/usr/bin/env bash
set -euo pipefail
plugin=$1
harness=$2
export OUT=$3 FIXTURE=$3/fixture.json
mkdir -p "$OUT"
site=$(mktemp -d)
paths=(includes/helpers/class-wpfaevent-event-template-controller.php public/css/templates/event.css)
restore() { for file in "${paths[@]}"; do git -C "$plugin" show "HEAD:$file" > "$plugin/$file"; done; }
cleanup() { restore; if [[ -n "${server_pid:-}" ]]; then kill "$server_pid" 2>/dev/null || true; fi; }
trap cleanup EXIT
wp core download --path="$site"
wp config create --path="$site" --dbname=wordpress_browser --dbuser=root --dbpass=wordpress_test_password --dbhost=127.0.0.1 --skip-check
wp db create --path="$site"
wp core install --path="$site" --url=http://127.0.0.1:8188 --title='Logo validation' --admin_user=validation --admin_password=throwaway_logo_password --admin_email=validation@example.invalid --skip-email
ln -s "$plugin" "$site/wp-content/plugins/wpfaevent"
wp rewrite structure '/%postname%/' --path="$site"
wp plugin activate wpfaevent --path="$site"
wp theme install twentytwentyone --activate --path="$site"
wp eval-file "$harness/seed.php" --path="$site" > "$FIXTURE"
php -d opcache.enable=0 -S 127.0.0.1:8188 -t "$site" "$harness/router.php" > "$OUT/server.log" 2>&1 &
server_pid=$!
for attempt in $(seq 1 40); do if curl -fsS http://127.0.0.1:8188/ >/dev/null; then break; fi; sleep 1; done
for file in "${paths[@]}"; do git -C "$plugin" show "$BASE_SHA:$file" > "$plugin/$file"; done
MODE=baseline node "$harness/browser/check.cjs"
restore
MODE=patched node "$harness/browser/check.cjs"
