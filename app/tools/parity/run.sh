#!/bin/sh
# Paridad firmware ↔ web: compila src/anim.cpp del firmware en la PC (con un
# stub mínimo de FastLED), dibuja 28 escenarios y los compara píxel por píxel
# con el espejo de LEDs de la web (src/core/leds/ledModel.ts).
#   npm run parity   (usa ../firmware; otra ruta: FIRMWARE_DIR=/ruta npm run parity)
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
FW="${FIRMWARE_DIR:-$(cd "$HERE/../../.." && pwd)/firmware}"
OUT="$(mktemp -d)"
c++ -std=c++17 -O1 -I "$HERE/stub" -I "$FW/include" "$FW/src/anim.cpp" "$HERE/dump.cpp" -o "$OUT/dump"
"$OUT/dump" > "$OUT/fw.jsonl"
npx vite-node "$HERE/compare.ts" "$OUT/fw.jsonl"
