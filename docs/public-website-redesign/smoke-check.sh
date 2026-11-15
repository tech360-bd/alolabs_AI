#!/usr/bin/env bash
# Public-website smoke check against a running server (default: localhost:3011).
# Verifies: every public route renders, internal routes are blocked for
# anonymous visitors, no internal vocabulary leaks into public HTML, SEO tags
# are present, and the public contact API validates correctly.
set -u
BASE="${1:-http://localhost:3011}"
FAIL=0
say() { printf '%s\n' "$*"; }
check() { # check <name> <condition-exit-code>
  if [ "$2" -eq 0 ]; then say "  PASS  $1"; else say "  FAIL  $1"; FAIL=1; fi
}

say "== Public routes return 200 and render expected content =="
declare -A PAGES=(
  ["/"]="Building Intelligent"
  ["/site/about"]="global AI"
  ["/site/solutions"]="Nine ways"
  ["/site/services"]="service experience"
  ["/site/how-we-work"]="delivery process"
  ["/site/projects"]="honestly labelled"
  ["/site/careers"]="Real openings"
  ["/site/contact"]="Talk to the ALO Labs team"
  ["/site/privacy"]="Privacy Policy"
  ["/site/terms"]="Terms of Service"
)
for path in "${!PAGES[@]}"; do
  html=$(curl -s -o /tmp/page.html -w "%{http_code}" "$BASE$path")
  check "GET $path -> 200" $([ "$html" = "200" ] && echo 0 || echo 1)
  grep -qi "${PAGES[$path]}" /tmp/page.html
  check "GET $path contains '${PAGES[$path]}'" $?
  grep -qi "ALO Labs" /tmp/page.html
  check "GET $path branded ALO Labs" $?
done

say "== Redirects =="
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/site")
check "GET /site -> 307 redirect" $([ "$code" = "307" ] && echo 0 || echo 1)

say "== 404 page =="
code=$(curl -s -o /tmp/page.html -w "%{http_code}" "$BASE/this-page-does-not-exist")
check "GET unknown route -> 404" $([ "$code" = "404" ] && echo 0 || echo 1)
grep -q "does not exist" /tmp/page.html
check "404 renders branded not-found page" $?

say "== Internal surfaces are not anonymously reachable =="
for path in /dashboard /brand /design /invoice /site/platform /site/pricing /site/diagrams /site/press /site/insights /site/work; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE$path")
  # proxy should redirect (307/302) or deny; never 200 with content
  ok=1; [ "$code" = "200" ] && ok=0
  check "GET $path not public (got $code)" $([ "$ok" -eq 0 ] && echo 1 || echo 0)
done

say "== No internal vocabulary in public HTML =="
for path in / /site/about /site/solutions /site/contact /site/projects; do
  curl -s "$BASE$path" > /tmp/page.html
  for term in "AgentOS" "1020" "AI AGENTS" "command center" "api.alolabs.net" "SOC2" "Sub-200ms" "99.9%"; do
    grep -qi "$term" /tmp/page.html
    check "GET $path free of '$term'" $([ $? -ne 0 ] && echo 0 || echo 1)
  done
done

say "== SEO essentials =="
curl -s "$BASE/" > /tmp/page.html
for tag in '<title' 'meta name="description"' 'rel="canonical"\|og:url' 'property="og:title"'; do
  grep -qi "$tag" /tmp/page.html
  check "homepage has $tag" $?
done
curl -s "$BASE/sitemap.xml" | grep -q "<urlset"
check "sitemap.xml renders" $?
curl -s "$BASE/sitemap.xml" | grep -q "/site/platform"
check "sitemap excludes internal /site/platform" $([ $? -ne 0 ] && echo 0 || echo 1)
curl -s "$BASE/robots.txt" | grep -q "Disallow: /portal"
check "robots.txt disallows /portal" $?

say "== Public contact API validation =="
# Missing name -> 400
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/public/contact" \
  -H 'Content-Type: application/json' \
  -d '{"email":"a@b.co","message":"A sufficiently long message here."}')
check "POST /api/public/contact without name -> 400" $([ "$code" = "400" ] && echo 0 || echo 1)
# Honeypot -> fake success, no record
body=$(curl -s -X POST "$BASE/api/public/contact" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Bot","email":"bot@spam.co","message":"Buy now buy now buy now","company_website":"spam.example"}')
echo "$body" | grep -q '"ok":true'
check "honeypot pretends success" $?

echo
if [ "$FAIL" -eq 0 ]; then say "SMOKE CHECK: ALL PASS"; else say "SMOKE CHECK: FAILURES PRESENT"; fi
exit $FAIL
