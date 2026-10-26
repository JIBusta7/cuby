#include "color_map.h"

static uint8_t unitTo8(float v) { // -1..1 → 0..255
  return (uint8_t)constrain((v + 1.f) * 127.5f, 0.f, 255.f);
}

static uint8_t absTo8(float v) { // |v| 0..1 → 0..255
  return (uint8_t)constrain(fabsf(v) * 255.f, 0.f, 255.f);
}

CRGB orientationToColor(const Vec3 &u, ColorMode mode) {
  switch (mode) {
    case MODE_ABS:
      return CRGB(absTo8(u.x), absTo8(u.y), absTo8(u.z));

    case MODE_HSV: {
      // Hacia dónde se inclina → tono; cuánto se inclina → saturación.
      // Boca abajo (más de 90°) el color se va oscureciendo.
      float hue   = atan2f(u.y, u.x);                 // -π..π
      float theta = acosf(constrain(u.z, -1.f, 1.f)); // 0..π
      uint8_t h = (uint8_t)((hue + PI) / (2 * PI) * 255.f);
      uint8_t s = (uint8_t)(constrain(theta / HALF_PI, 0.f, 1.f) * 255.f);
      float vF  = theta <= HALF_PI ? 1.f : 1.f - 0.6f * (theta - HALF_PI) / HALF_PI;
      CRGB c;
      hsv2rgb_rainbow(CHSV(h, s, (uint8_t)(vF * 255.f)), c);
      return c;
    }

    case MODE_SIGNED:
    default:
      return CRGB(unitTo8(u.x), unitTo8(u.y), unitTo8(u.z));
  }
}
