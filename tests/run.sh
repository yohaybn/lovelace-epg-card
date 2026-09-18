#!/usr/bin/env bash
# Visual and DOM smoke tests for the EPG card.
# Requires google-chrome. Usage: tests/run.sh [chrome-binary]
set -u
CHROME="${1:-google-chrome}"
HERE="$(cd "$(dirname "$0")" && pwd)"
PAGE="file://$HERE/harness/page.html"
OUT="$HERE/screenshots"
mkdir -p "$OUT"
FAIL=0

render() { # name width height extra-flags
  local name="$1" width="$2" height="$3"
  "$CHROME" --headless=new --disable-gpu --no-sandbox --hide-scrollbars \
    --force-device-scale-factor=1 --window-size="$width,$height" \
    --virtual-time-budget=6000 \
    --screenshot="$OUT/$name.png" "$PAGE?scenario=$name" >/dev/null 2>&1
  "$CHROME" --headless=new --disable-gpu --no-sandbox \
    --virtual-time-budget=6000 \
    --dump-dom "$PAGE?scenario=$name" >"$OUT/$name.dom.html" 2>/dev/null
}

check() { # file pattern description
  if grep -q "$2" "$OUT/$1.dom.html"; then
    echo "PASS: $3"
  else
    echo "FAIL: $3 (pattern '$2' not found in $1)"
    FAIL=1
  fi
}

check_absent() {
  if grep -q "$2" "$OUT/$1.dom.html"; then
    echo "FAIL: $3 (unexpected pattern '$2' in $1)"
    FAIL=1
  else
    echo "PASS: $3"
  fi
}

render desktop-light 1280 900
render desktop-dark 1280 900
render mobile-light 390 844
render rtl-desktop 1280 900
render tooltip 1280 900
render state-error 1280 700
CHROME_BUDGET=3000; "$CHROME" --headless=new --disable-gpu --no-sandbox --hide-scrollbars --force-device-scale-factor=1 --window-size=1280,700 --virtual-time-budget=$CHROME_BUDGET --screenshot="$OUT/state-loading.png" "$PAGE?scenario=state-loading" >/dev/null 2>&1
"$CHROME" --headless=new --disable-gpu --no-sandbox --virtual-time-budget=$CHROME_BUDGET --dump-dom "$PAGE?scenario=state-loading" >"$OUT/state-loading.dom.html" 2>/dev/null
render state-partial 1280 900

check desktop-light 'class="program' "renders program blocks"
check desktop-light 'program current' "highlights the current program"
check desktop-light 'hour-tick' "renders timeline ticks"
check desktop-light 'programs-track empty' "renders empty-channel state"
check desktop-light 'Unavailable' "renders unavailable-channel state"
check desktop-light 'tabindex="0"' "programs are keyboard focusable"
check desktop-light 'aria-label=' "programs carry accessible labels"
check desktop-light 'program-progress' "current program shows progress"
check desktop-light 'channel-icon\|channel-fallback' "channel cell shows icon or fallback"
check desktop-dark 'class="program' "dark theme renders programs"
check rtl-desktop 'dir="rtl"' "rtl scenario sets document direction"
check rtl-desktop 'class="program' "rtl renders programs"
check tooltip 'role="tooltip"' "tooltip element exists"
check tooltip 'tooltip-title' "tooltip is populated"
check state-error 'state-block error' "missing entities produce error state after grace"
check state-loading 'skeleton-block' "loading state shows skeleton"
check state-loading 'aria-busy="true"' "loading state announces busy"
check state-partial 'class="banner"' "partial missing entities show warning banner"
check_absent desktop-light '&lt;script' "no unescaped HTML injection"

if [ "$FAIL" -eq 0 ]; then
  echo "ALL TESTS PASSED"
else
  echo "SOME TESTS FAILED"
fi
exit $FAIL
