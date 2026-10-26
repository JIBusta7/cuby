// Stub mínimo de FastLED para compilar anim.cpp en la PC (solo para la prueba de paridad).
#pragma once
#include <cstdint>
#include <cmath>
#include <cstdlib>
#include <cstring>
struct CRGB {
  uint8_t r = 0, g = 0, b = 0;
  CRGB() = default;
  constexpr CRGB(uint8_t r_, uint8_t g_, uint8_t b_) : r(r_), g(g_), b(b_) {}
  static const CRGB Black, White;
};
inline const CRGB CRGB::Black = CRGB(0, 0, 0);
inline const CRGB CRGB::White = CRGB(255, 255, 255);
struct CHSV { uint8_t h, s, v; CHSV(uint8_t h_, uint8_t s_, uint8_t v_) : h(h_), s(s_), v(v_) {} };
inline uint8_t scale8(uint8_t i, uint8_t sc) { return (uint8_t)(((uint16_t)i * (1 + (uint16_t)sc)) >> 8); }
inline uint8_t scale8_video(uint8_t i, uint8_t sc) { return (uint8_t)((((int)i * (int)sc) >> 8) + ((i && sc) ? 1 : 0)); }
// Copia de hsv2rgb_rainbow de FastLED 3.9 (Y1=1, Y2=0, G2=0, Gscale=0, SCALE8_FIXED=1).
inline void hsv2rgb_rainbow(const CHSV &hsv, CRGB &rgb) {
  uint8_t hue = hsv.h, sat = hsv.s, val = hsv.v;
  uint8_t offset8 = (uint8_t)((hue & 0x1F) << 3);
  uint8_t third = scale8(offset8, 256 / 3);
  uint8_t r, g, b;
  if (!(hue & 0x80)) {
    if (!(hue & 0x40)) {
      if (!(hue & 0x20)) { r = 255 - third; g = third; b = 0; }
      else { r = 171; g = 85 + third; b = 0; }
    } else {
      if (!(hue & 0x20)) { uint8_t tt = scale8(offset8, (256 * 2) / 3); r = 171 - tt; g = 170 + third; b = 0; }
      else { r = 0; g = 255 - third; b = third; }
    }
  } else {
    if (!(hue & 0x40)) {
      if (!(hue & 0x20)) { uint8_t tt = scale8(offset8, (256 * 2) / 3); r = 0; g = 171 - tt; b = 85 + tt; }
      else { r = third; g = 0; b = 255 - third; }
    } else {
      if (!(hue & 0x20)) { r = 85 + third; g = 0; b = 171 - third; }
      else { r = 170 + third; g = 0; b = 85 - third; }
    }
  }
  if (sat != 255) {
    if (sat == 0) { r = 255; b = 255; g = 255; }
    else {
      uint8_t desat = 255 - sat; desat = scale8_video(desat, desat);
      uint8_t satscale = 255 - desat;
      r = scale8(r, satscale); g = scale8(g, satscale); b = scale8(b, satscale);
      r += desat; g += desat; b += desat;
    }
  }
  if (val != 255) {
    val = scale8_video(val, val);
    if (val == 0) { r = 0; g = 0; b = 0; }
    else { r = scale8(r, val); g = scale8(g, val); b = scale8(b, val); }
  }
  rgb.r = r; rgb.g = g; rgb.b = b;
}
// sin8 de FastLED (sin8_C)
inline uint8_t sin8(uint8_t theta) {
  static const uint8_t b_m16[] = {0, 49, 49, 41, 90, 27, 117, 10};
  uint8_t offset = theta;
  if (theta & 0x40) offset = (uint8_t)255 - offset;
  offset &= 0x3F;
  uint8_t secoffset = offset & 0x0F;
  if (theta & 0x40) ++secoffset;
  uint8_t section = offset >> 4;
  uint8_t b = b_m16[section * 2], m16 = b_m16[section * 2 + 1];
  uint8_t mx = (m16 * secoffset) >> 4;
  int8_t y = mx + b;
  if (theta & 0x80) y = -y;
  y += 128;
  return (uint8_t)y;
}
inline void fill_solid(CRGB *leds, int n, const CRGB &c) { for (int i = 0; i < n; i++) leds[i] = c; }
extern uint32_t g_millis;
inline uint32_t millis() { return g_millis; }
