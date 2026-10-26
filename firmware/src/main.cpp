// =====================================================================
//  Magic Cube — cubo RGB interactivo con orientación (ESP32)
//
//  IMU (MPU6050) → orientación → color RGB → 293 WS2812B (6 caras de 7×7; la 6, inferior, sin el LED central)
//                                       └──→ BLE hacia la PC
//
//  ---------------- Botón táctil ----------------
//   Toque corto  → evento "short" a la PC (iniciar partida / confirmar color)
//   Toque largo  → recalibrar: la posición actual pasa a ser la neutral
//
//  ---------------- Comandos BLE (PC → cubo) ----------------
//   CAL            recalibrar posición neutral + bias del giroscopio
//   MODE n         modo de color 0=SIGNED 1=ABS 2=HSV
//   BRI n          brillo 0–255 (limitado a MAX_BRIGHTNESS)
//   STATE n        estado de partida (la PC lo define, se reenvía en cada paquete)
//   COLOR r g b    forzar un color (feedback del juego)
//   AUTO           volver al color según orientación
//   PING           responde {"t":"pong"}
//  v2 (juego CUBY):
//   INFO           responde {"t":"info","fw":3,"caps":["anim","target","fmap","show","ota"]}
//   ANIM x         animación local: PLAY, IDLE, COUNT (3-2-1-GO), WIN, FAIL
//   TARGET r g b   objetivo en la cara de arriba (TARGET OFF lo quita)
//   LIGHT n        enciende solo la cara n (1–6) para identificarla; 0 = jugar
//   FMAP a b c d e f  eje del sensor de cada cara (+X -X +Y -Y +Z -Z), se guarda
//   OTA <tam> <md5>   actualización del firmware por Bluetooth (ver ota.h)
//  Modo LUCES:
//   SHOW x         efecto: RAINBOW PLASMA FIRE TWINKLE BREATHE RIPPLE SPIRAL RAIN
//                  CHASE PARTY GRAVITY (demo) · SPECTRUM PULSE RINGS KICK BURST (audio)
//   PAL c1 c2 c3 c4   paleta de 4 colores en hex (rrggbb)
//   A<14 hex><b>   cuadro de audio: 7 bandas 00–FF + beat (0/1). Sin respuesta.
//
//  ---------------- Datos (cubo → PC) ----------------
//   {"t":"d","x":0.32,"y":-0.71,"z":0.54,"roll":..,"pitch":..,"yaw":..,
//    "rgb":[180,45,220],"btn":0,"state":0,"mode":0}
//   {"t":"btn","ev":"short"|"long","rgb":[r,g,b]}
//   {"t":"ack","cmd":"MODE"} / {"t":"err","cmd":"..."}
//   "rgb" es siempre el color del jugador (según la orientación), aunque los
//   LEDs estén mostrando una animación o un color forzado con COLOR.
// =====================================================================
#include <Arduino.h>
#include <FastLED.h>
#include <Preferences.h>

#include "anim.h"
#include "ble_link.h"
#include "color_map.h"
#include "config.h"
#include "imu.h"
#include "led_layout.h"
#include "ota.h"

CRGB leds[NUM_LEDS];
Imu imu;
BleLink ble;
Preferences prefs;

ColorMode colorMode   = (ColorMode)DEFAULT_COLOR_MODE;
uint8_t   brightness  = DEFAULT_BRIGHTNESS;
int       gameState   = 0;

float   curR = 0, curG = 0, curB = 0; // color del jugador suavizado
CRGB    currentColor;                 // color del jugador (lo que se informa en "rgb")
bool    imuOk = false;

// Eje del sensor que apunta hacia afuera de cada cara (0 +X … 5 −Z), ver config.h.
uint8_t faceAxis[FACES] = FACE_AXES_DEFAULT;
int8_t  topFace = -1;

// ---------------------------------------------------------------------
//  Utilidades LED  (ledIndex / fillFace están en led_layout.h)
// ---------------------------------------------------------------------
void flash(const CRGB &c, int times = 2) {
  for (int i = 0; i < times; i++) {
    fill_solid(leds, NUM_LEDS, c);   FastLED.show(); delay(80);
    fill_solid(leds, NUM_LEDS, CRGB::Black); FastLED.show(); delay(80);
  }
}

// ---------------------------------------------------------------------
//  Cara de arriba (para TARGET)
// ---------------------------------------------------------------------
static const char *const AXIS_NAME[6] = {"+X", "-X", "+Y", "-Y", "+Z", "-Z"};

float axisDot(uint8_t axis, const Vec3 &v) {
  const float s = (axis & 1) ? -1.0f : 1.0f;
  return s * (axis < 2 ? v.x : axis < 4 ? v.y : v.z);
}

// La cara cuyo eje está más alineado con "arriba". Solo cambia si otra la
// supera por 0,12 (en coseno): el objetivo no salta de cara cerca de 45°.
uint8_t computeTopFace(const Vec3 &up) {
  uint8_t best = 0;
  float bestDot = -2;
  for (uint8_t f = 0; f < FACES; f++) {
    const float d = axisDot(faceAxis[f], up);
    if (d > bestDot) { bestDot = d; best = f; }
  }
  if (topFace >= 0 && topFace != best && bestDot - axisDot(faceAxis[topFace], up) < 0.12f) return topFace;
  return best;
}

bool validFaceMap(const uint8_t *m) {
  uint8_t seen = 0;
  for (uint8_t f = 0; f < FACES; f++) {
    if (m[f] > 5 || (seen & (1 << m[f]))) return false;
    seen |= 1 << m[f];
  }
  return true;
}

int8_t parseAxis(const char *s) {
  for (uint8_t i = 0; i < 6; i++) if (!strcasecmp(s, AXIS_NAME[i])) return i;
  return -1;
}

// ---------------------------------------------------------------------
//  Persistencia (NVS)
// ---------------------------------------------------------------------
void saveSettings() {
  Vec3 n = imu.getNeutral();
  prefs.putFloat("nx", n.x);
  prefs.putFloat("ny", n.y);
  prefs.putFloat("nz", n.z);
  prefs.putUChar("mode", colorMode);
  prefs.putUChar("bri", brightness);
}

void loadSettings() {
  Vec3 n = {prefs.getFloat("nx", 0), prefs.getFloat("ny", 0), prefs.getFloat("nz", 1)};
  imu.setNeutral(n);
  colorMode  = (ColorMode)min<uint8_t>(prefs.getUChar("mode", DEFAULT_COLOR_MODE), MODE_COUNT - 1);
  brightness = min<uint8_t>(prefs.getUChar("bri", DEFAULT_BRIGHTNESS), MAX_BRIGHTNESS);
  uint8_t m[FACES];
  if (prefs.getBytes("fmap", m, FACES) == FACES && validFaceMap(m)) memcpy(faceAxis, m, FACES);
}

// ---------------------------------------------------------------------
//  Envío de datos
// ---------------------------------------------------------------------
void sendJson(const char *json) {
  ble.sendLine(json);
  Serial.println(json);
}

void sendButtonEvent(const char *ev) {
  char buf[96];
  snprintf(buf, sizeof(buf), "{\"t\":\"btn\",\"ev\":\"%s\",\"rgb\":[%u,%u,%u]}",
           ev, currentColor.r, currentColor.g, currentColor.b);
  sendJson(buf);
}

void buildDataPacket(char *buf, size_t len, bool btnDown) {
  snprintf(buf, len,
           "{\"t\":\"d\",\"x\":%.2f,\"y\":%.2f,\"z\":%.2f,"
           "\"roll\":%.1f,\"pitch\":%.1f,\"yaw\":%.1f,"
           "\"rgb\":[%u,%u,%u],\"btn\":%d,\"state\":%d,\"mode\":%d,\"ie\":%u}",
           imu.up.x, imu.up.y, imu.up.z, imu.roll, imu.pitch, imu.yaw,
           currentColor.r, currentColor.g, currentColor.b,
           btnDown ? 1 : 0, gameState, (int)colorMode, imu.resets);
}

// Paquete compacto para BLE (firmware v2): una lectura entra SIEMPRE en una
// sola notificación, aunque el MTU sea el mínimo (20 bytes útiles). Con el
// JSON completo (~125 bytes) una lectura viajaba en hasta 7 fragmentos y, si
// se perdía uno, se descartaba entera.
//   d<seq><x>,<y>,<z>,<flags>      ej. "d7-707,12,707,0"  (máx. 18 bytes + \n)
//   seq   0–9, cíclico (para medir pérdidas)
//   x,y,z dirección "arriba" × 999, enteros −999…999
//   flags botón (bit 0) + 2 × modo de color
void buildBlePacket(char *buf, size_t len, bool btnDown) {
  static uint8_t seq = 0;
  const int x = (int)lroundf(constrain(imu.up.x, -1.0f, 1.0f) * 999);
  const int y = (int)lroundf(constrain(imu.up.y, -1.0f, 1.0f) * 999);
  const int z = (int)lroundf(constrain(imu.up.z, -1.0f, 1.0f) * 999);
  snprintf(buf, len, "d%u%d,%d,%d,%d", seq, x, y, z, (btnDown ? 1 : 0) + 2 * (int)colorMode);
  seq = (seq + 1) % 10;
}

// Estado de baja frecuencia (1 por segundo, y al cambiar): reinicios del sensor.
void sendBleStatus() {
  char buf[48];
  snprintf(buf, sizeof(buf), "{\"t\":\"s\",\"ie\":%u,\"fw\":%d}", imu.resets, FW_VERSION);
  ble.sendLine(buf);
}

// ---------------------------------------------------------------------
//  Calibración
// ---------------------------------------------------------------------
void recalibrate() {
  flash(CRGB::White, 1);
  imu.calibrateGyro();          // ~1 s, mantener quieto
  for (int i = 0; i < 40; i++) { imu.update(); delay(5); } // estabilizar gravedad
  imu.setNeutralFromCurrent();
  saveSettings();
  flash(CRGB::White, 2);
  sendJson("{\"t\":\"cal\"}");
}

// ---------------------------------------------------------------------
//  Botón táctil
// ---------------------------------------------------------------------
struct Button {
  bool stable = false, lastRaw = false, longFired = false;
  uint32_t changedAt = 0, pressedAt = 0;
} btn;

bool readButtonRaw() {
  bool v = digitalRead(PIN_BUTTON);
  return BUTTON_ACTIVE_HIGH ? v : !v;
}

void updateButton() {
  uint32_t now = millis();
  bool raw = readButtonRaw();
  if (raw != btn.lastRaw) { btn.lastRaw = raw; btn.changedAt = now; }
  if (now - btn.changedAt < DEBOUNCE_MS) return;

  if (raw != btn.stable) {
    btn.stable = raw;
    if (raw) {                       // se presionó
      btn.pressedAt = now;
      btn.longFired = false;
    } else if (!btn.longFired) {     // se soltó antes del umbral → toque corto
      sendButtonEvent("short");
    }
  }
  if (btn.stable && !btn.longFired && now - btn.pressedAt >= LONG_PRESS_MS) {
    btn.longFired = true;
    sendButtonEvent("long");
    recalibrate();
  }
}

// ---------------------------------------------------------------------
//  Comandos desde la PC
// ---------------------------------------------------------------------
void handleCommand(char *cmd) {
  // limpiar fin de línea y pasar a mayúsculas el comando y sus palabras
  for (char *p = cmd; *p; p++) {
    if (*p == '\r' || *p == '\n') *p = 0;
    else *p = toupper(*p);
  }
  // Cuadro de audio (modo LUCES): "A" + 7 bandas en hex + beat. Llega ~30 veces
  // por segundo; no se responde para no saturar el enlace.
  if (cmd[0] == 'A' && strlen(cmd) == 16) {
    uint8_t bands[7];
    bool okHex = true;
    for (uint8_t i = 0; i < 7 && okHex; i++) {
      char h[3] = {cmd[1 + i * 2], cmd[2 + i * 2], 0};
      char *end;
      bands[i] = (uint8_t)strtoul(h, &end, 16);
      okHex = *end == 0;
    }
    if (okHex) anim::audioFrame(bands, cmd[15] == '1');
    return;
  }
  char name[16] = {0};
  int a = 0, b = 0, c = 0;
  int n = sscanf(cmd, "%15s %d %d %d", name, &a, &b, &c);
  if (n < 1) return;
  char word[12] = {0};
  const bool hasWord = sscanf(cmd, "%*s %11s", word) == 1;

  bool ok = true;
  if (!strcmp(name, "CAL")) {
    recalibrate();
  } else if (!strcmp(name, "MODE") && n >= 2 && a >= 0 && a < MODE_COUNT) {
    colorMode = (ColorMode)a;
    saveSettings();
  } else if (!strcmp(name, "BRI") && n >= 2) {
    brightness = constrain(a, 0, MAX_BRIGHTNESS);
    FastLED.setBrightness(brightness);
    saveSettings();
  } else if (!strcmp(name, "STATE") && n >= 2) {
    gameState = a;
  } else if (!strcmp(name, "COLOR") && n >= 4) {
    anim::setSolid(CRGB(constrain(a, 0, 255), constrain(b, 0, 255), constrain(c, 0, 255)));
  } else if (!strcmp(name, "AUTO")) {
    anim::play();
  } else if (!strcmp(name, "PING")) {
    sendJson("{\"t\":\"pong\"}");
    return;
  } else if (!strcmp(name, "OTA") && n >= 2 && a > 0) {
    // OTA <tamaño> <md5>: empieza una actualización por Bluetooth (ver ota.h)
    char md5[40] = {0};
    sscanf(cmd, "%*s %*d %39s", md5);
    for (char *p = md5; *p; p++) *p = tolower(*p);
    const char *why = "";
    if (ota::begin((uint32_t)a, md5[0] ? md5 : nullptr, why)) {
      Serial.printf("[OTA] recibiendo %d bytes\n", a);
      sendJson("{\"t\":\"ota\",\"ready\":1}");
    } else {
      char err[96];
      snprintf(err, sizeof(err), "{\"t\":\"ota\",\"err\":\"%s\"}", why);
      sendJson(err);
    }
    return;
  } else if (!strcmp(name, "INFO")) {
    char info[112];
    snprintf(info, sizeof(info), "{\"t\":\"info\",\"fw\":%d,\"caps\":[\"anim\",\"target\",\"fmap\",\"show\",\"ota\"]}", FW_VERSION);
    sendJson(info);
    return;
  } else if (!strcmp(name, "ANIM") && hasWord) {
    AnimMode m;
    ok = anim::parseName(word, m);
    if (ok) {
      if (m == ANIM_PLAY) anim::play();
      else anim::start(m);
    }
  } else if (!strcmp(name, "TARGET") && hasWord && !strcmp(word, "OFF")) {
    anim::clearTarget();
  } else if (!strcmp(name, "TARGET") && n >= 4) {
    anim::setTarget(CRGB(constrain(a, 0, 255), constrain(b, 0, 255), constrain(c, 0, 255)));
  } else if (!strcmp(name, "LIGHT") && n >= 2) {
    anim::setLight(constrain(a, 0, FACES));
  } else if (!strcmp(name, "SHOW") && hasWord) {
    ShowEffect e;
    ok = anim::parseEffect(word, e);
    if (ok) anim::startShow(e);
  } else if (!strcmp(name, "PAL")) {
    char h[4][8];
    ok = sscanf(cmd, "%*s %6s %6s %6s %6s", h[0], h[1], h[2], h[3]) == 4;
    CRGB p[4];
    for (uint8_t i = 0; ok && i < 4; i++) {
      char *end;
      const uint32_t v = strtoul(h[i], &end, 16);
      ok = *end == 0 && strlen(h[i]) == 6;
      p[i] = CRGB((v >> 16) & 0xFF, (v >> 8) & 0xFF, v & 0xFF);
    }
    if (ok) anim::setPalette(p);
  } else if (!strcmp(name, "FMAP")) {
    char t[FACES][4];
    uint8_t m[FACES];
    ok = sscanf(cmd, "%*s %3s %3s %3s %3s %3s %3s", t[0], t[1], t[2], t[3], t[4], t[5]) == FACES;
    for (uint8_t f = 0; ok && f < FACES; f++) {
      const int8_t ax = parseAxis(t[f]);
      ok = ax >= 0;
      m[f] = ax;
    }
    ok = ok && validFaceMap(m);
    if (ok) {
      memcpy(faceAxis, m, FACES);
      topFace = -1;
      prefs.putBytes("fmap", faceAxis, FACES);
    }
  } else {
    ok = false;
  }

  char buf[64];
  snprintf(buf, sizeof(buf), "{\"t\":\"%s\",\"cmd\":\"%s\"}", ok ? "ack" : "err", name);
  sendJson(buf);
}

void readSerialCommand() {
  static char line[BLE_CMD_MAX];
  static size_t pos = 0;
  while (Serial.available()) {
    char ch = Serial.read();
    if (ch == '\n' || ch == '\r') {
      if (pos) { line[pos] = 0; handleCommand(line); pos = 0; }
    } else if (pos < sizeof(line) - 1) {
      line[pos++] = ch;
    }
  }
}

// ---------------------------------------------------------------------
//  Setup / loop
// ---------------------------------------------------------------------
void setup() {
  // LEDs primero: la línea de DATA no tiene pull-down y flota durante el
  // arranque, así que se apagan antes que cualquier otra cosa.
  FastLED.addLeds<WS2812B, PIN_LEDS, GRB>(leds, NUM_LEDS);
  FastLED.setMaxPowerInVoltsAndMilliamps(5, POWER_LIMIT_MA);
  FastLED.setBrightness(DEFAULT_BRIGHTNESS);
  FastLED.clear(true);

  Serial.begin(115200);
  delay(200);
  Serial.println("\n[CUBY] iniciando");

  // Pull-down interno: si no hay TTP223 conectado el pin queda en LOW y no
  // genera toques falsos.
  pinMode(PIN_BUTTON, BUTTON_ACTIVE_HIGH ? INPUT_PULLDOWN : INPUT_PULLUP);

  prefs.begin("cubo", false);

  imuOk = imu.begin();
  if (!imuOk) {
    Serial.println("[IMU] no se detecta el MPU6050 — revisar SDA/SCL/alimentación");
  } else {
    loadSettings();
    fill_solid(leds, NUM_LEDS, CRGB(40, 40, 40)); FastLED.show();
    imu.calibrateGyro();         // dejar el cubo quieto al encender
    FastLED.clear(true);
  }
  FastLED.setBrightness(brightness);

  ble.begin();
  Serial.println("[BLE] anunciando como \"" BLE_DEVICE_NAME "\"");
}

void loop() {
  static uint32_t lastLed = 0, lastBle = 0, lastSerial = 0;
  static bool wasConnected = false;
  uint32_t now = millis();

  if (!imuOk) {
    // Sin IMU: parpadeo rojo para indicar el error.
    fill_solid(leds, NUM_LEDS, (now / 500) % 2 ? CRGB::Red : CRGB::Black);
    FastLED.show();
    delay(50);
    return;
  }

  // Actualización en curso: solo escribir el archivo y mostrar el progreso.
  if (ota::loop(sendJson)) {
    static uint32_t lastShow = 0;
    if (now - lastShow >= 50) {
      lastShow = now;
      const uint16_t lit = (uint16_t)(ota::progress() * NUM_LEDS);
      for (uint16_t i = 0; i < NUM_LEDS; i++) leds[i] = i < lit ? CRGB(0, 90, 255) : CRGB(0, 0, 6);
      FastLED.show();
    }
    char ignored[BLE_CMD_MAX];
    while (ble.pollCommand(ignored)) {}
    ble.service();
    return;
  }

  imu.update();
  imu.watchdog(now);
  updateButton();

  char cmd[BLE_CMD_MAX];
  while (ble.pollCommand(cmd)) handleCommand(cmd);
  readSerialCommand();
  ble.service();

  if (ble.connected() && !wasConnected) flash(CRGB(0, 0, 255), 1);
  if (!ble.connected() && wasConnected) anim::linkLost(); // aviso ámbar y vuelve a PLAY
  wasConnected = ble.connected();

  // --- Color + LEDs ---
  if (now - lastLed >= LED_INTERVAL_MS) {
    lastLed = now;
    CRGB target = orientationToColor(imu.up, colorMode);
    curR += COLOR_SMOOTHING * (target.r - curR);
    curG += COLOR_SMOOTHING * (target.g - curG);
    curB += COLOR_SMOOTHING * (target.b - curB);
    currentColor = CRGB((uint8_t)(curR + 0.5f), (uint8_t)(curG + 0.5f), (uint8_t)(curB + 0.5f));
    topFace = computeTopFace(imu.up);
    int16_t faceUp[FACES];
    for (uint8_t f = 0; f < FACES; f++) faceUp[f] = (int16_t)lroundf(axisDot(faceAxis[f], imu.up) * 255);
    anim::update(now);
    anim::render(now, currentColor, topFace, faceUp);
    FastLED.show();
  }

  // --- Datos a la PC ---
  char buf[200];
  if (ble.connected() && now - lastBle >= BLE_INTERVAL_MS) {
    lastBle = now;
    buildBlePacket(buf, sizeof(buf), btn.stable);
    ble.sendLine(buf);
  }
  static uint32_t lastStatus = 0;
  static uint16_t lastResets = 0;
  if (ble.connected() && (now - lastStatus >= 1000 || imu.resets != lastResets)) {
    lastStatus = now;
    lastResets = imu.resets;
    sendBleStatus();
  }
  if (now - lastSerial >= SERIAL_INTERVAL_MS) {
    lastSerial = now;
    buildDataPacket(buf, sizeof(buf), btn.stable);
    Serial.println(buf);
  }
}
