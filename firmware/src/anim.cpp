#include "anim.h"

#include <math.h>
#include <string.h>

#include "config.h"
#include "led_layout.h"

namespace {

AnimMode current = ANIM_PLAY;
uint32_t since = 0;
bool targetOn = false;
CRGB target = CRGB::Black;
CRGB solid = CRGB::Black;
uint8_t lightFace = 0;

// --- Modo LUCES ---
ShowEffect effect = FX_RAINBOW;
CRGB pal[4] = {CRGB(110, 60, 255), CRGB(255, 60, 40), CRGB(255, 170, 0), CRGB(0, 220, 90)};
uint8_t bands[7] = {0};
bool hasBeat = false;
uint32_t beatAt = 0;
uint16_t beatCount = 0;
const int16_t *faceUpNow = nullptr;

const char *const FX_NAME[FX_COUNT] = {"RAINBOW", "PLASMA", "FIRE", "TWINKLE", "BREATHE", "RIPPLE", "SPIRAL",
                                       "RAIN", "CHASE", "PARTY", "GRAVITY", "SPECTRUM", "PULSE", "RINGS",
                                       "KICK", "BURST"};

// Ángulo (0–255) de cada LED alrededor del centro de la cara (igual que ANGLE en effects.ts).
const uint8_t ANGLE[7][7] = {
    {160, 168, 179, 192, 205, 216, 224},
    {152, 160, 173, 192, 211, 224, 232},
    {141, 147, 160, 192, 224, 237, 243},
    {128, 128, 128, 0, 0, 0, 0},
    {115, 109, 96, 64, 32, 19, 13},
    {104, 96, 83, 64, 45, 32, 24},
    {96, 88, 77, 64, 51, 40, 32}
};

const CRGB COUNT3(255, 60, 40);
const CRGB COUNT2(255, 170, 0);
const CRGB COUNT1(0, 220, 90);
const CRGB GO_COLOR(110, 60, 255);
const CRGB FAIL_COLOR(255, 40, 30);
const CRGB LINK_COLOR(255, 120, 0);
const CRGB LIGHT_COLOR(180, 180, 180);

// Dígitos de 5×7 (columnas 1–5 de la cara). Iguales a glyphs.ts.
const char *const DIGITS[3][7] = {
    {"..#..", ".##..", "..#..", "..#..", "..#..", "..#..", ".###."},  // 1
    {".###.", "#...#", "....#", "...#.", "..#..", ".#...", "#####"},  // 2
    {"#####", "...#.", "..#..", "...#.", "....#", "#...#", ".###."},  // 3
};

bool glyphOn(uint8_t digit, uint8_t x, uint8_t y) {
  if (x < 1 || x > 5 || y > 6) return false;
  return DIGITS[digit - 1][y][x - 1] == '#';
}

CRGB scaled(const CRGB &c, float k) {
  return CRGB((uint8_t)lroundf(c.r * k), (uint8_t)lroundf(c.g * k), (uint8_t)lroundf(c.b * k));
}

// Hash entero idéntico a hash4() de ledModel.ts (destellos pseudoaleatorios).
uint32_t hash4(uint32_t a, uint32_t b, uint32_t c, uint32_t d) {
  uint32_t h = ((a + 1) * 0x9E3779B1u) ^ ((b + 1) * 0x85EBCA77u) ^ ((c + 1) * 0xC2B2AE3Du) ^ ((d + 1) * 0x27D4EB2Fu);
  h ^= h >> 15;
  h *= 0x2C1B3C6Du;
  h ^= h >> 12;
  return h;
}

CRGB rainbow(uint8_t hue, uint8_t sat) {
  CRGB c;
  hsv2rgb_rainbow(CHSV(hue, sat, 255), c);
  return c;
}

CRGB scaleC(const CRGB &c, int v) {
  return CRGB(scale8(c.r, (uint8_t)v), scale8(c.g, (uint8_t)v), scale8(c.b, (uint8_t)v));
}

// Color de la paleta en la posición i, interpolando entre los 4 colores (cíclico).
CRGB palAt(uint8_t i) {
  const uint8_t seg = i >> 6;
  const int f = (i & 63) << 2;
  const CRGB &a = pal[seg];
  const CRGB &b = pal[(seg + 1) & 3];
  return CRGB(a.r + ((((int)b.r - a.r) * f) >> 8), a.g + ((((int)b.g - a.g) * f) >> 8), a.b + ((((int)b.b - a.b) * f) >> 8));
}

CRGB heat(int h) {
  if (h < 85) return CRGB(h * 3, 0, 0);
  if (h < 170) return CRGB(255, (h - 85) * 3, 0);
  const int b = (h - 170) * 3;
  return CRGB(255, 255, b > 255 ? 255 : b);
}

// Efectos del modo LUCES: mismas fórmulas enteras que showPixel() en effects.ts.
CRGB showPixel(uint32_t t, uint8_t face, uint8_t x, uint8_t y, uint32_t now) {
  const int dx = abs((int)x - 3), dy = abs((int)y - 3);
  const int d = dx > dy ? dx : dy;
  const uint32_t beatAge = hasBeat ? now - beatAt : 1000000000u;
  // Efectos de audio: cada bombo avanza un color entero de la paleta y el
  // brillo sigue a los graves (la mayor de las dos bandas más bajas).
  const int bass = bands[0] > bands[1] ? bands[0] : bands[1];
  const uint8_t beatHue = (uint8_t)(beatCount * 64);
  switch (effect) {
    case FX_RAINBOW:
      return rainbow((uint8_t)(t / 16 + (x + y) * 10 + face * 43), 240);
    case FX_PLASMA: {
      const int a = sin8((uint8_t)(x * 24 + t / 6));
      const int b = sin8((uint8_t)(y * 32 + t / 9 + face * 40));
      const int c = sin8((uint8_t)((x + y) * 16 + t / 13));
      return palAt((uint8_t)((a + b + c) / 3 + t / 40));
    }
    case FX_FIRE: {
      int h = 255 - (6 - y) * 38 - (int)(hash4(face, x, y, t / 70) & 95);
      return heat(h < 0 ? 0 : h);
    }
    case FX_TWINKLE: {
      const CRGB base = scaleC(palAt((uint8_t)(face * 64 + x * 4)), 18);
      const uint32_t off = hash4(face, x, y, 1) % 900;
      const uint32_t slot = (t + off) / 900;
      const uint32_t r = hash4(face, x, y, slot + 7);
      if (r % 6 != 0) return base;
      const uint32_t ph = (t + off) % 900;
      const int v = ph < 450 ? (int)(ph * 255 / 450) : (int)((900 - ph) * 255 / 450);
      return v > 18 ? scaleC(palAt((r >> 8) & 0xFF), v) : base;
    }
    case FX_BREATHE: {
      const int v = sin8((uint8_t)(t / 10));
      return scaleC(palAt((uint8_t)(t / 60 + face * 8)), 40 + ((v * 215) >> 8));
    }
    case FX_RIPPLE: {
      const uint8_t phase = (uint8_t)(t / 5 - d * 48 + face * 24);
      return scaleC(palAt(phase), sin8(phase));
    }
    case FX_SPIRAL:
      return scaleC(palAt((uint8_t)(ANGLE[y][x] + t / 8 + d * 20 + face * 40)), 255 - d * 30);
    case FX_RAIN: {
      const uint32_t speed = 50 + (hash4(face, x, 9, 3) % 4) * 25;
      const uint32_t off = hash4(face, x, 7, 5) % 11;
      const int head = (int)((t / speed + off) % 11);
      const int dist = head - y;
      const int v = dist == 0 ? 255 : dist == 1 ? 120 : dist == 2 ? 45 : 0;
      return v ? scaleC(palAt((uint8_t)(face * 40 + x * 12)), v) : CRGB::Black;
    }
    case FX_CHASE: {
      const int idx = y * 7 + ((y & 1) ? 6 - x : x);
      const int pos = (int)((t / 30 + face * 8) % 49);
      const int dist = (pos - idx + 49) % 49;
      const int v = dist < 8 ? 255 - dist * 32 : 0;
      return v ? scaleC(palAt((uint8_t)(face * 40 + t / 40)), v) : CRGB::Black;
    }
    case FX_PARTY: {
      const uint32_t r = hash4(face, 0, 0, t / 220);
      const CRGB c = palAt((r >> 8) & 0xFF);
      if (r % 3 != 0) return scaleC(c, 14);
      return hash4(face, x, y, t / 60) % 11 == 0 ? CRGB::White : c;
    }
    case FX_GRAVITY: {
      const int u = ((faceUpNow ? faceUpNow[face] : 0) + 255) >> 1;
      const int v = 170 + ((sin8((uint8_t)(x * 20 + y * 20 + t / 6)) * 85) >> 8);
      return scaleC(palAt((uint8_t)u), v);
    }
    case FX_SPECTRUM: {
      const int height = (bands[x] * 8) >> 8;
      const int row = 6 - y;
      if (row < height) {
        if (beatAge < 100 && row == height - 1) return CRGB::White;
        return palAt((uint8_t)(beatHue + row * 24 + face * 4));
      }
      return scaleC(palAt((uint8_t)(beatHue + 128)), (bass >> 3) + 6);
    }
    case FX_PULSE: {
      const int flash = beatAge < 300 ? 255 - (int)(beatAge * 255 / 300) : 0;
      int v = bass > flash ? bass : flash;
      if (v < 28) v = 28;
      return scaleC(palAt((uint8_t)(beatHue + face * 8)), v);
    }
    case FX_RINGS: {
      const int r = (int)(beatAge / 70);
      if (beatAge < 350 && d == r) return scaleC(palAt(beatHue), 255 - r * 45);
      return scaleC(palAt((uint8_t)(beatHue + 128 + face * 16)), (bass >> 2) + 8);
    }
    case FX_KICK: {
      CRGB c = palAt(beatHue);
      if (beatAge < 60) c = CRGB((c.r + 255) >> 1, (c.g + 255) >> 1, (c.b + 255) >> 1);
      const int env = beatAge < 250 ? 255 - (int)(beatAge * 255 / 250) : 0;
      int v = (bass * 3) >> 2;
      if (env > v) v = env;
      if (v < 20) v = 20;
      return scaleC(c, v);
    }
    case FX_BURST: {
      const int radius = (bass * 5) >> 8;
      if (d < radius) return scaleC(palAt((uint8_t)(beatHue + d * 12)), 255 - d * 30);
      if (beatAge < 120 && d == radius) return CRGB::White;
      return scaleC(palAt((uint8_t)(beatHue + 128)), 12);
    }
    default:
      return CRGB::Black;
  }
}

CRGB pixel(uint32_t t, uint8_t face, uint8_t x, uint8_t y, const CRGB &player, uint8_t topFace) {
  switch (current) {
    case ANIM_PLAY:
      return player;
    case ANIM_TARGET: {
      if (face != topFace || !targetOn) return player;
      const bool border = x == 0 || y == 0 || x == FACE_W - 1 || y == FACE_H - 1;
      return border ? CRGB::Black : target;
    }
    case ANIM_SOLID:
      return solid;
    case ANIM_LIGHT:
      return face == lightFace - 1 ? LIGHT_COLOR : CRGB::Black;
    case ANIM_IDLE:
      return rainbow((uint8_t)((t / 16) + (x + y) * 10 + face * 43), 240);
    case ANIM_COUNT: {
      if (t < 3 * anim::BEAT_MS) {
        const uint32_t beat = t / anim::BEAT_MS;
        const uint8_t digit = 3 - beat;
        const CRGB &c = digit == 3 ? COUNT3 : digit == 2 ? COUNT2 : COUNT1;
        const float env = 1.0f - 0.45f * ((float)(t - beat * anim::BEAT_MS) / anim::BEAT_MS);
        return glyphOn(digit, x, y) ? scaled(c, env) : scaled(c, 0.08f);
      }
      // GO: anillo cuadrado que se expande desde el centro.
      float p = (float)(t - 3 * anim::BEAT_MS) / anim::GO_MS;
      if (p > 1) p = 1;
      const int dx = abs((int)x - 3), dy = abs((int)y - 3);
      const float d = (float)(dx > dy ? dx : dy);
      const float r = p * 4.5f;
      if (fabsf(d - r) < 1.0f) return CRGB::White;
      if (d < r) return scaled(GO_COLOR, 1.0f - p * 0.6f);
      return CRGB::Black;
    }
    case ANIM_WIN: {
      if (hash4(face, x, y, t / 90) % 9 == 0) return CRGB::White;
      return rainbow((uint8_t)((t / 6) + face * 43 + y * 20), 255);
    }
    case ANIM_FAIL: {
      const float k = t < 1500 ? 0.25f + 0.75f * fabsf(sinf((float)M_PI * t / 500.0f)) : 0.25f;
      return scaled(FAIL_COLOR, k);
    }
    case ANIM_LINK_LOST:
      return (t / 200) % 2 == 0 ? LINK_COLOR : CRGB::Black;
    case ANIM_SHOW:
      return CRGB::Black;  // se dibuja con showPixel() en render()
  }
  return CRGB::Black;
}

}  // namespace

namespace anim {

void start(AnimMode m) {
  current = m;
  since = millis();
}

void play() { start(targetOn ? ANIM_TARGET : ANIM_PLAY); }

void setTarget(const CRGB &c) {
  target = c;
  targetOn = true;
  if (current == ANIM_PLAY || current == ANIM_TARGET) play();
}

void clearTarget() {
  targetOn = false;
  if (current == ANIM_TARGET) play();
}

void setSolid(const CRGB &c) {
  solid = c;
  start(ANIM_SOLID);
}

void setLight(uint8_t face) {
  if (face >= 1 && face <= FACES) {
    lightFace = face;
    start(ANIM_LIGHT);
  } else {
    play();
  }
}

void linkLost() {
  targetOn = false;
  start(ANIM_LINK_LOST);
}

AnimMode mode() { return current; }

bool parseEffect(const char *name, ShowEffect &out) {
  for (uint8_t i = 0; i < FX_COUNT; i++)
    if (!strcmp(name, FX_NAME[i])) {
      out = (ShowEffect)i;
      return true;
    }
  return false;
}

void startShow(ShowEffect e) {
  effect = e;
  start(ANIM_SHOW);
}

void setPalette(const CRGB p[4]) {
  for (uint8_t i = 0; i < 4; i++) pal[i] = p[i];
}

void audioFrame(const uint8_t b[7], bool beat) {
  memcpy(bands, b, 7);
  if (beat) {
    hasBeat = true;
    beatAt = millis();
    beatCount++;
  }
}

bool parseName(const char *name, AnimMode &out) {
  if (!strcmp(name, "PLAY")) out = ANIM_PLAY;
  else if (!strcmp(name, "IDLE")) out = ANIM_IDLE;
  else if (!strcmp(name, "COUNT")) out = ANIM_COUNT;
  else if (!strcmp(name, "WIN")) out = ANIM_WIN;
  else if (!strcmp(name, "FAIL")) out = ANIM_FAIL;
  else return false;
  return true;
}

void update(uint32_t now) {
  if (current == ANIM_COUNT && now - since >= COUNTDOWN_MS) {
    current = targetOn ? ANIM_TARGET : ANIM_PLAY;
    since += COUNTDOWN_MS;
  } else if (current == ANIM_LINK_LOST && now - since >= LINK_LOST_MS) {
    current = ANIM_PLAY;
    since += LINK_LOST_MS;
  }
}

void render(uint32_t now, const CRGB &player, uint8_t topFace, const int16_t faceUp[6]) {
  const uint32_t t = now - since;
  faceUpNow = faceUp;
  for (uint8_t f = 0; f < FACES; f++)
    for (uint8_t y = 0; y < FACE_H; y++)
      for (uint8_t x = 0; x < FACE_W; x++)
        setPixel(f, x, y, current == ANIM_SHOW ? showPixel(t, f, x, y, now) : pixel(t, f, x, y, player, topFace));
}

}  // namespace anim
