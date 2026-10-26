// =====================================================================
//  Disposición física de los LEDs
//
//  Cada cara es un panel de 7×7 WS2812B. Las 6 caras van encadenadas
//  (DOUT de la cara n → DIN de la cara n+1) en orden 0→5.
//
//  Coordenadas lógicas (x, y) dentro de una cara, mirándola de frente:
//  (0,0) arriba a la izquierda, x hacia la derecha, y hacia abajo.
//  Cómo está cableado cada panel por dentro (zigzag, espejado, girado) se
//  ajusta por cara en FACE_LAYOUTS (config.h); las pruebas LÍNEAS y
//  NÚMEROS de led_test lo muestran en vivo.
// =====================================================================
#pragma once
#include <FastLED.h>

#include "config.h"

// Definido en cada programa (la prueba usa un buffer más grande que NUM_LEDS).
extern CRGB leds[];

struct FaceLayout {
  uint8_t serpentine, flipX, flipY, transpose;
};
// No es const a propósito: la prueba led_test lo modifica en vivo (comandos
// z/x/y/t + cara) para encontrar el cableado y después se copia a config.h.
static FaceLayout FACE_LAYOUT[FACES] = FACE_LAYOUTS;

// LEDs físicos por cara, posición sin LED (cable) y LED sobrante (config.h).
static constexpr uint8_t FACE_LEDS_N[FACES] = FACE_LEDS;
static constexpr int8_t  FACE_HOLE_N[FACES] = FACE_HOLE;
static constexpr int8_t  FACE_SKIP_N[FACES] = FACE_SKIP;

constexpr bool faceCountsOk(uint8_t f = 0) {
  return f == FACES ? true
                    : FACE_LEDS_N[f] == LEDS_PER_FACE - (FACE_HOLE_N[f] >= 0 ? 1 : 0) + (FACE_SKIP_N[f] >= 0 ? 1 : 0) &&
                          faceCountsOk(f + 1);
}
static_assert(faceCountsOk(), "FACE_LEDS no coincide con FACE_HOLE / FACE_SKIP (config.h)");

// Valor de ledIndex() para una posición de la grilla que no tiene LED.
constexpr uint16_t LED_NONE = 0xFFFF;

// Índice en la cadena del primer LED de la cara `face` (0–5).
constexpr uint16_t faceStart(uint8_t face) {
  return face == 0 ? 0 : faceStart(face - 1) + FACE_LEDS_N[face - 1];
}
inline uint16_t faceLeds(uint8_t face) { return FACE_LEDS_N[face]; }

// Total de LEDs encadenados: 293 (seis caras de 49, menos el agujero del cable).
constexpr uint16_t NUM_LEDS = faceStart(FACES);

// Índice en la cadena del LED (x, y) de la cara `face` (índice 0–5: la cara 1
// del cubo es face 0, la cara 6 es face 5). LED_NONE si ahí no hay LED.
inline uint16_t ledIndex(uint8_t face, uint8_t x, uint8_t y) {
  const FaceLayout &L = FACE_LAYOUT[face];
  if (L.transpose) { uint8_t t = x; x = y; y = t; }
  if (L.flipX) x = FACE_W - 1 - x;
  if (L.flipY) y = FACE_H - 1 - y;
  if (L.serpentine && (y & 1)) x = FACE_W - 1 - x; // filas impares de derecha a izquierda
  uint16_t local = y * FACE_W + x;                  // posición en la grilla completa
  const int8_t hole = FACE_HOLE_N[face];
  if (hole >= 0) {
    if (local == (uint16_t)hole) return LED_NONE;   // agujero del cable
    if (local > (uint16_t)hole) local--;
  }
  if (FACE_SKIP_N[face] >= 0 && local >= (uint16_t)FACE_SKIP_N[face]) local++; // saltar el sobrante
  return faceStart(face) + local;
}

inline bool hasLed(uint8_t face, uint8_t x, uint8_t y) { return ledIndex(face, x, y) != LED_NONE; }

// Escribe un píxel de la grilla; ignora las posiciones sin LED.
inline void setPixel(uint8_t face, uint8_t x, uint8_t y, const CRGB &c) {
  const uint16_t i = ledIndex(face, x, y);
  if (i != LED_NONE) leds[i] = c;
}

inline void fillFace(uint8_t face, const CRGB &c) {
  fill_solid(leds + faceStart(face), FACE_LEDS_N[face], c);
}
