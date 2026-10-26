#!/bin/sh
# Empaqueta el último firmware compilado dentro de la app, para instalarlo por
# Bluetooth desde Ajustes → Firmware.
#   1. Compilar el firmware:  pio run -e esp32dev   (en la carpeta firmware/)
#   2. npm run firmware:bundle
set -e
HERE="$(cd "$(dirname "$0")/.." && pwd)"
FW="${FIRMWARE_DIR:-$HERE/../firmware}"
BIN="$FW/.pio/build/esp32dev/firmware.bin"
[ -f "$BIN" ] || { echo "No existe $BIN: compilá primero el firmware (pio run -e esp32dev)"; exit 1; }
mkdir -p "$HERE/public/firmware"
cp "$BIN" "$HERE/public/firmware/cubo.bin"
VERSION=$(grep -E '^#define FW_VERSION' "$FW/include/config.h" | awk '{print $3}')
node -e '
const fs = require("fs"), crypto = require("crypto");
const [bin, out, fw] = process.argv.slice(1);
const data = fs.readFileSync(bin);
fs.writeFileSync(out, JSON.stringify({ fw: Number(fw), size: data.length, md5: crypto.createHash("md5").update(data).digest("hex"), built: fs.statSync(bin).mtime.toISOString() }, null, 2) + "\n");
console.log(`firmware v${fw} empaquetado: ${(data.length / 1024).toFixed(0)} KB`);
' "$HERE/public/firmware/cubo.bin" "$HERE/public/firmware/manifest.json" "$VERSION"
