// =====================================================================
//  Orientación → color RGB
// =====================================================================
#pragma once
#include <FastLED.h>

#include "imu.h"

enum ColorMode : uint8_t {
  MODE_SIGNED = 0, // cada eje (-1..1) → componente (0..255). X→R, Y→G, Z→B
  MODE_ABS    = 1, // |eje| → componente. Caras opuestas = mismo primario
  MODE_HSV    = 2, // dirección de inclinación → tono, cantidad → saturación
  MODE_COUNT
};

CRGB orientationToColor(const Vec3 &up, ColorMode mode);
