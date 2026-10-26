// =====================================================================
//  Magic Cube — prueba de los 6 paneles de 7×7 WS2812B
//
//  Firmware independiente (sin IMU ni BLE) para verificar los paneles antes
//  de armar el cubo. Subir y mirar el monitor:
//      pio run -e led_test -t upload
//      pio device monitor
//
//  Las caras se numeran 1–6 (en el código los índices van 0–5).
//
//  Pruebas (se encadenan solas; por serie se puede fijar una):
//   0 CARAS    cada cara se enciende sola con su color (1 rojo, 2 verde,
//              3 azul, 4 amarillo, 5 magenta, 6 cian) → orden de encadenado.
//   1 BARRIDO  un píxel recorre los 293 en orden → píxeles muertos y
//              recorrido físico del dato dentro de cada panel.
//   2 NÚMEROS  cada cara muestra su número (1–6) con ledIndex() y un punto
//              blanco en (0,0) → zigzag y orientación (FACE_LAYOUTS, config.h).
//   3 BLANCO   todo blanco → consumo. Si las últimas caras se ven amarillas o
//              más tenues, cae la tensión de 5 V por el cable.
//   4 RGB      todo rojo, verde, azul → el orden de color (GRB) es correcto.
//   5 TODAS    las 6 caras a la vez, cada una con su color, y además se envían
//              49 LEDs de más en blanco: si algo se ve blanco, la cadena tiene
//              más de 293 LEDs. Si una cara muestra dos colores, el conteo
//              de alguna cara anterior no es 49.
//   6 VERIFICAR  (arranca acá) recorre las 6 caras: cada una entera en su
//              color, se apaga, y se rellena tira por tira, LED a LED, con el
//              monitor diciendo qué tira va. Donde el relleno deja de crecer
//              está el LED o el puente cortado. Termina con TODAS y se repite.
//   7 LÍNEAS   en todas las caras a la vez: una línea vertical que va de
//              izquierda a derecha y después una horizontal de arriba a abajo,
//              usando ledIndex(). Diagnostica el cableado de cada panel:
//              línea quebrada → zigzag; va al revés → espejo; vertical que se
//              ve horizontal → girado 90°. Se corrige en FACE_LAYOUTS.
//   8 PARPADEO todo blanco / todo apagado cada 400 ms. Para buscar un falso
//              contacto: lo que no parpadea no recibe datos; mover los puentes
//              entre tiras con el dedo y ver cuál lo hace volver.
//  La cara 6 es la inferior: tiene 48 LEDs (sin el del centro, por donde
//  sale el cable). Total: 293. El agujero se dibuja apagado en todas las pruebas.
//
//   9 CONTEO   todo en gris tenue (un LED muerto se ve negro), el PRIMER LED
//              de cada cara en rojo y el ÚLTIMO en azul; lo que haya más allá
//              del LED 293, en verde. Cada panel debe tener exactamente un rojo
//              (arriba-izquierda) y un azul (abajo-derecha). Si un panel tiene
//              dos rojos, o el azul no está en la esquina, ese panel no tiene
//              49 LEDs y todo lo que sigue queda corrido.
//
//  Comandos por serie (una tecla, sin Enter):
//   0–9   fija una prueba        a   vuelve al ciclo automático
//   n     pasa a la siguiente    +/- cambian el brillo
//   c1–c6 deja UNA sola cara en blanco tenue y el resto apagado
//   f1–f6 rellena esa cara LED a LED, despacio y en orden de cadena: donde
//         deja de crecer está el LED (o el puente entre tiras) cortado
//   p1–p6 UNA cara en blanco al 100 % durante 10 s (≈2,8 A, solo con la
//         fuente), con rampa de subida y bajada; después vuelve al brillo
//         normal. Cualquier otra tecla lo corta. Para medir potencia/consumo.
//   z1–z6 / x1–x6 / y1–y6 / t1–t6  cambian EN VIVO el cableado de esa cara
//         (zigzag / espejo X / espejo Y / girado 90°) y redibujan la prueba
//         actual. El monitor imprime la tabla lista para pegar en config.h.
// =====================================================================
#include <Arduino.h>
#include <FastLED.h>

#include "config.h"
#include "led_layout.h"

// Límite de corriente para la prueba: el mismo del cubo (fuente de 5 V con
// fusible de 7 A). Si se prueba solo con el USB de la PC, bajarlo a 500:
// hay ~500 mA para todo (el ESP32 usa ~150 mA y cada LED apagado ~1 mA) y
// FastLED va a dejar los paneles tenues.
#ifndef LED_TEST_POWER_MA
#define LED_TEST_POWER_MA POWER_LIMIT_MA
#endif

static_assert(FACES <= 6, "la tabla de dígitos llega hasta la cara 6");

// LEDs de más que se envían en TODAS para detectar cadenas más largas que 293.
#define EXTRA_LEDS LEDS_PER_FACE

CRGB    leds[NUM_LEDS + EXTRA_LEDS];
uint8_t brightness = DEFAULT_BRIGHTNESS;

// HOLD_FACE y FILL_FACE quedan fuera del ciclo automático (después de PHASE_COUNT).
enum Phase { CARAS = 0, BARRIDO, NUMEROS, BLANCO, RGB_TEST, TODAS, VERIFICAR, LINEAS, PARPADEO, CONTEO, PHASE_COUNT, HOLD_FACE, FILL_FACE, POWER_FACE };
const char *PHASE_NAME[PHASE_COUNT] = {"CARAS", "BARRIDO", "NUMEROS", "BLANCO", "RGB", "TODAS", "VERIFICAR", "LINEAS", "PARPADEO", "CONTEO"};

int     phase     = VERIFICAR; // al encender: verificación de las 6 caras, repetida
bool    autoCycle = false;     // 'a' pasa al ciclo con todas las pruebas
bool    skip      = false; // se pidió otra prueba por serie: cortar la actual
uint8_t holdFace  = 0;     // índice 0–5 de la cara elegida con cN / fN
char    prefix    = 0;     // 'c','f','p','z','x','y','t' recibido, falta el número de cara

const CRGB FACE_COLOR[6] = {CRGB::Red,    CRGB::Green,   CRGB::Blue,
                            CRGB::Yellow, CRGB::Magenta, CRGB::Cyan};
const char *FACE_COLOR_NAME = "1 rojo, 2 verde, 3 azul, 4 amarillo, 5 magenta, 6 cian";

// Dígitos 1–6 en 5×7 (DIGIT[i] es el dígito i+1); van en las columnas 1–5.
const char *DIGIT[6][7] = {
  {"..#..", ".##..", "..#..", "..#..", "..#..", "..#..", ".###."}, // 1
  {".###.", "#...#", "....#", "...#.", "..#..", ".#...", "#####"}, // 2
  {"#####", "...#.", "..#..", "...#.", "....#", "#...#", ".###."}, // 3
  {"...#.", "..##.", ".#.#.", "#..#.", "#####", "...#.", "...#."}, // 4
  {"#####", "#....", "####.", "....#", "....#", "#...#", ".###."}, // 5
  {".###.", "#....", "#....", "####.", "#...#", "#...#", ".###."}, // 6
};

// ---------------------------------------------------------------------
//  Serie
// ---------------------------------------------------------------------
void printLayouts() {
  Serial.println("[test] FACE_LAYOUTS actual, para pegar en config.h:");
  for (uint8_t f = 0; f < FACES; f++) {
    const FaceLayout &L = FACE_LAYOUT[f];
    Serial.printf("    {%u, %u, %u, %u}, /* cara %u */\n", L.serpentine, L.flipX, L.flipY, L.transpose, f + 1);
  }
}

void readSerial() {
  while (Serial.available()) {
    char ch = Serial.read();
    if (prefix) {                           // segunda tecla de "cN", "fN", "zN", "xN", "yN", "tN"
      char p = prefix;
      prefix = 0;
      if (ch >= '1' && ch <= '0' + FACES) {
        uint8_t f = ch - '1';
        if (p == 'c' || p == 'f' || p == 'p') {
          holdFace  = f;
          phase     = (p == 'c') ? HOLD_FACE : (p == 'f') ? FILL_FACE : POWER_FACE;
          autoCycle = false;
          skip      = true;
          if (p == 'c')
            Serial.printf("[test] cara %u sola en blanco, resto apagado (a = volver al ciclo)\n", f + 1);
          else if (p == 'f')
            Serial.printf("[test] cara %u: relleno LED a LED (a = volver al ciclo)\n", f + 1);
          else
            Serial.printf("[test] cara %u al 100 %% durante 10 s, cualquier tecla lo corta\n", f + 1);
        } else {                            // ajuste en vivo del cableado de la cara f
          FaceLayout &L = FACE_LAYOUT[f];
          if (p == 'z') L.serpentine ^= 1;
          if (p == 'x') L.flipX ^= 1;
          if (p == 'y') L.flipY ^= 1;
          if (p == 't') L.transpose ^= 1;
          printLayouts();
          skip = true;                      // redibujar la prueba actual con el cambio
        }
      }
      continue;
    }
    if (ch == 'c' || ch == 'f' || ch == 'p' || ch == 'z' || ch == 'x' || ch == 'y' || ch == 't') {
      prefix = ch;
    } else if (ch >= '0' && ch < '0' + PHASE_COUNT) {
      phase     = ch - '0';
      autoCycle = false;
      skip      = true;
      Serial.printf("[test] fija: %s (a = automático)\n", PHASE_NAME[phase]);
    } else if (ch == 'a') {
      if (phase >= PHASE_COUNT) { phase = CARAS; skip = true; }
      autoCycle = true;
      Serial.println("[test] ciclo automático");
    } else if (ch == 'n') {
      phase = (phase >= PHASE_COUNT) ? CARAS : (phase + 1) % PHASE_COUNT;
      skip  = true;
    } else if (ch == '+' || ch == '-') {
      int b = brightness + (ch == '+' ? 10 : -10);
      brightness = constrain(b, 5, MAX_BRIGHTNESS);
      FastLED.setBrightness(brightness);
      FastLED.show();
      Serial.printf("[test] brillo %u\n", brightness);
    }
  }
}

// Espera `ms` atendiendo el serie. Devuelve true si hay que cortar la prueba.
bool wait(uint32_t ms) {
  uint32_t t0 = millis();
  while (millis() - t0 < ms) {
    readSerial();
    if (skip) return true;
    delay(5);
  }
  return false;
}

// ---------------------------------------------------------------------
//  Pruebas
// ---------------------------------------------------------------------
void testCaras() {
  for (uint8_t f = 0; f < FACES; f++) {
    FastLED.clear();
    fillFace(f, FACE_COLOR[f]);
    FastLED.show();
    Serial.printf("  cara %u  (LEDs %u–%u)\n", f + 1, faceStart(f), faceStart(f) + faceLeds(f) - 1);
    if (wait(700)) return;
  }
  for (uint8_t f = 0; f < FACES; f++) fillFace(f, FACE_COLOR[f]);
  FastLED.show();
  Serial.println("  todas juntas");
  wait(1500);
}

void testBarrido() {
  uint8_t nextFace = 0;
  for (uint16_t i = 0; i < NUM_LEDS; i++) {
    fadeToBlackBy(leds, NUM_LEDS, 90); // cola tenue detrás del píxel
    leds[i] = CRGB::White;
    FastLED.show();
    if (nextFace < FACES && i == faceStart(nextFace)) Serial.printf("  cara %u\n", ++nextFace);
    if (wait(12)) return;
  }
  FastLED.clear(true);
}

// Dibuja el dígito (face + 1) en la cara `face`.
void drawDigit(uint8_t face, const CRGB &c) {
  for (uint8_t y = 0; y < 7; y++)
    for (uint8_t x = 0; x < 5; x++)
      if (DIGIT[face][y][x] == '#') setPixel(face, x + 1, y, c);
}

void testNumeros() {
  FastLED.clear();
  for (uint8_t f = 0; f < FACES; f++) {
    drawDigit(f, FACE_COLOR[f]);
    setPixel(f, 0, 0, CRGB::White); // origen (0,0): debe quedar arriba a la izquierda
  }
  FastLED.show();
  Serial.println("  número (1–6) por cara + punto blanco en (0,0). Si se ve mal, ajustar FACE_LAYOUTS en config.h");
  wait(4000);
}

void testBlanco() {
  fill_solid(leds, NUM_LEDS, CRGB::White);
  FastLED.show();
  Serial.printf("  blanco, brillo %u, tope %u mA (si el ESP32 se reinicia, la fuente no alcanza)\n",
                brightness, LED_TEST_POWER_MA);
  wait(3000);
}

void testRgb() {
  const CRGB  c[3] = {CRGB::Red, CRGB::Green, CRGB::Blue};
  const char *n[3] = {"rojo", "verde", "azul"};
  for (int i = 0; i < 3; i++) {
    fill_solid(leds, NUM_LEDS, c[i]);
    FastLED.show();
    Serial.printf("  %s\n", n[i]);
    if (wait(800)) return;
  }
}

void testTodas() {
  FastLED.clear();
  for (uint8_t f = 0; f < FACES; f++) fillFace(f, FACE_COLOR[f]);
  fill_solid(leds + NUM_LEDS, EXTRA_LEDS, CRGB::White); // más allá del 293: blanco
  FastLED.show();
  Serial.printf("  cada cara con su color (%s)\n", FACE_COLOR_NAME);
  Serial.println("  si algo se ve BLANCO hay más de 293 LEDs; si una cara mezcla dos colores, alguna cara anterior no tiene los LEDs esperados");
  wait(5000);
}

// Verificación completa: cara por cara, entera y después tira por tira.
void testVerificar() {
  for (uint8_t f = 0; f < FACES; f++) {
    uint16_t base = faceStart(f);
    Serial.printf("=== CARA %u (LEDs %u-%u) ===\n", f + 1, base, base + faceLeds(f) - 1);
    FastLED.clear();
    fillFace(f, FACE_COLOR[f]);
    FastLED.show();
    Serial.println("  entera en su color");
    if (wait(1000)) return;
    FastLED.clear(true);
    if (wait(400)) return;
    // Largo de cada tira en orden de cadena (la fila del agujero del cable tiene una menos).
    uint8_t row = 0, rowStart = 0;
    for (uint8_t i = 0; i < faceLeds(f); i++) {
      const int8_t hole = FACE_HOLE_N[f];
      const uint8_t rowLen = FACE_W - (hole >= 0 && hole / FACE_W == row ? 1 : 0);
      if (i == rowStart)
        Serial.printf("  tira %u (LEDs %u-%u%s)\n", row + 1, base + i, base + i + rowLen - 1,
                      rowLen < FACE_W ? ", sin el LED del cable" : "");
      if (i == rowStart + rowLen - 1) { row++; rowStart = i + 1; }
      leds[base + i] = CRGB::White;
      FastLED.show();
      if (wait(150)) return;
    }
    Serial.println("  completa. Si quedó incompleta, el corte está justo después del último LED que prendió");
    if (wait(1500)) return;
  }
  Serial.println("=== CONTEO (TODAS) ===");
  testTodas();
}

// Línea vertical de izquierda a derecha y horizontal de arriba a abajo, en
// todas las caras a la vez, pasando por ledIndex(). Diagnostica FACE_LAYOUTS.
void testLineas() {
  for (uint8_t x = 0; x < FACE_W; x++) {
    FastLED.clear();
    for (uint8_t f = 0; f < FACES; f++)
      for (uint8_t y = 0; y < FACE_H; y++) setPixel(f, x, y, FACE_COLOR[f]);
    FastLED.show();
    Serial.printf("  columna %u (vertical, de izquierda a derecha)\n", x + 1);
    if (wait(400)) return;
  }
  FastLED.clear(true);
  if (wait(500)) return;
  for (uint8_t y = 0; y < FACE_H; y++) {
    FastLED.clear();
    for (uint8_t f = 0; f < FACES; f++)
      for (uint8_t x = 0; x < FACE_W; x++) setPixel(f, x, y, FACE_COLOR[f]);
    FastLED.show();
    Serial.printf("  fila %u (horizontal, de arriba a abajo)\n", y + 1);
    if (wait(400)) return;
  }
  FastLED.clear(true);
  wait(500);
}

// Todo blanco / todo apagado. Lo que no parpadea no está recibiendo datos.
void testParpadeo() {
  for (int k = 0; k < 10; k++) {
    fill_solid(leds, NUM_LEDS, (k & 1) ? CRGB::Black : CRGB::White);
    FastLED.show();
    if (wait(400)) return;
  }
}

// Gris tenue en todo (LED muerto = negro), primer LED de cada cara rojo,
// último azul, y verde lo que exista más allá del LED 293.
void testConteo() {
  fill_solid(leds, NUM_LEDS, CRGB(110, 110, 110));
  for (uint8_t f = 0; f < FACES; f++) {
    leds[faceStart(f)]                   = CRGB::Red;
    leds[faceStart(f) + faceLeds(f) - 1] = CRGB::Blue;
  }
  fill_solid(leds + NUM_LEDS, EXTRA_LEDS, CRGB::Green);
  FastLED.show();
  Serial.println("  gris todo; ROJO = primer LED de cada cara (arriba-izq), AZUL = último (abajo-der), VERDE = LEDs de más, NEGRO = LED muerto");
  wait(6000);
}

// Una cara en blanco al 100 % durante 10 s, con rampa. Siempre restaura el
// brillo normal al salir, aunque lo corten. Después queda como cN.
void powerOneFace() {
  FastLED.clear();
  fillFace(holdFace, CRGB::White);
  bool cut = false;
  for (int b = 0; b <= 255 && !cut; b += 5) {          // subida ~1 s
    FastLED.setBrightness(b); FastLED.show();
    cut = wait(20);
  }
  for (int sec = 10; sec > 0 && !cut; sec--) {          // 10 s al máximo
    Serial.printf("  100 %%: quedan %d s\n", sec);
    cut = wait(1000);
  }
  for (int b = 255; b >= brightness && !cut; b -= 5) {  // bajada ~0,5 s
    FastLED.setBrightness(b); FastLED.show();
    delay(10);
  }
  FastLED.setBrightness(brightness);                    // pase lo que pase, brillo normal
  FastLED.show();
  Serial.printf("[test] fin de la prueba de potencia, brillo %u\n", brightness);
  if (!skip) phase = HOLD_FACE;                         // queda la cara sola, brillo normal
}

// Una sola cara en blanco tenue, el resto apagado. Se queda hasta otro comando.
void holdOneFace() {
  FastLED.clear();
  fillFace(holdFace, CRGB::White);
  FastLED.show();
  wait(500);
}

// Relleno acumulativo de una cara en orden de cadena: donde deja de crecer
// está el LED cortado. Se repite hasta otro comando.
void fillOneFace() {
  FastLED.clear(true);
  wait(600);
  for (uint8_t i = 0; i < faceLeds(holdFace); i++) {
    leds[faceStart(holdFace) + i] = CRGB::White;
    FastLED.show();
    Serial.printf("  LED %u de la cara (índice %u)\n", i, faceStart(holdFace) + i);
    if (wait(250)) return;
  }
  wait(1500);
}

// ---------------------------------------------------------------------
void setup() {
  // LEDs primero: DATA flota en el arranque, apagarlos cuanto antes.
  FastLED.addLeds<WS2812B, PIN_LEDS, GRB>(leds, NUM_LEDS + EXTRA_LEDS);
  FastLED.setMaxPowerInVoltsAndMilliamps(5, LED_TEST_POWER_MA);
  FastLED.setBrightness(brightness);
  FastLED.clear(true);
  Serial.begin(115200);
  delay(200);
  Serial.printf("\n[test] paneles: %u caras (1–%u) x %u LEDs = %u, DATA en GPIO %u\n",
                FACES, FACES, LEDS_PER_FACE, NUM_LEDS, PIN_LEDS);
  Serial.println("[test] serie: 0-9 fija una prueba, a ciclo automático, n siguiente, +/- brillo, c1-c6 una cara sola, f1-f6 relleno LED a LED");
  Serial.println("[test]        z/x/y/t + cara: cambia en vivo zigzag / espejo X / espejo Y / girado de esa cara");
  Serial.println("[test] arranca en VERIFICAR (6): recorre las 6 caras tira por tira y se repite");
}

void loop() {
  skip = false;
  if (phase == HOLD_FACE) { holdOneFace(); return; }
  if (phase == FILL_FACE) { fillOneFace(); return; }
  if (phase == POWER_FACE) { powerOneFace(); return; }
  Serial.printf("[test] %d %s\n", phase, PHASE_NAME[phase]);
  switch (phase) {
    case CARAS:    testCaras();   break;
    case BARRIDO:  testBarrido(); break;
    case NUMEROS:  testNumeros(); break;
    case BLANCO:   testBlanco();  break;
    case RGB_TEST: testRgb();     break;
    case TODAS:    testTodas();   break;
    case VERIFICAR: testVerificar(); break;
    case LINEAS:    testLineas();    break;
    case PARPADEO:  testParpadeo();  break;
    case CONTEO:    testConteo();    break;
  }
  if (autoCycle && !skip) phase = (phase + 1) % PHASE_COUNT;
}
