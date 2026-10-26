// Prueba de paridad: imprime los píxeles que dibuja anim.cpp para varios escenarios.
#include <cstdio>
#include <initializer_list>
#include "FastLED.h"
#include "anim.h"
#include "config.h"
#include "led_layout.h"

uint32_t g_millis = 0;
CRGB leds[NUM_LEDS];
int16_t g_faceUp[6] = {255, 0, 0, 0, 0, -255};

static void dump(const char *name, uint32_t now, CRGB player, uint8_t top) {
  g_millis = now;
  anim::update(now);
  fill_solid(leds, NUM_LEDS, CRGB(1, 2, 3));
  anim::render(now, player, top, g_faceUp);
  printf("{\"name\":\"%s\",\"mode\":%d,\"px\":[", name, (int)anim::mode());
  for (int f = 0; f < FACES; f++)
    for (int y = 0; y < FACE_H; y++)
      for (int x = 0; x < FACE_W; x++) {
        const uint16_t i = ledIndex(f, x, y);
        if (f || y || x) printf(",");
        if (i == LED_NONE) printf("null");
        else printf("[%d,%d,%d]", leds[i].r, leds[i].g, leds[i].b);
      }
  printf("]}\n");
}

int main() {
  const CRGB player(200, 90, 40);
  g_millis = 1000; anim::start(ANIM_IDLE);
  for (uint32_t t : {0u, 333u, 5000u}) { char n[32]; snprintf(n, 32, "IDLE+%u", t); dump(n, 1000 + t, player, 0); }
  g_millis = 10000; anim::start(ANIM_COUNT);
  for (uint32_t t : {0u, 400u, 999u, 1000u, 1700u, 2500u, 3000u, 3250u, 3499u, 3500u, 3600u}) { char n[32]; snprintf(n, 32, "COUNT+%u", t); dump(n, 10000 + t, player, 0); }
  g_millis = 20000; anim::start(ANIM_WIN);
  for (uint32_t t : {0u, 95u, 1234u}) { char n[32]; snprintf(n, 32, "WIN+%u", t); dump(n, 20000 + t, player, 0); }
  g_millis = 30000; anim::start(ANIM_FAIL);
  for (uint32_t t : {0u, 125u, 250u, 1600u}) { char n[32]; snprintf(n, 32, "FAIL+%u", t); dump(n, 30000 + t, player, 0); }
  g_millis = 40000; anim::setTarget(CRGB(10, 220, 130)); anim::play();
  dump("TARGET-top2", 40000, player, 2);
  dump("TARGET-top5", 40010, player, 5);
  anim::clearTarget();
  dump("PLAY", 40020, player, 0);
  g_millis = 50000; anim::setLight(4);
  dump("LIGHT4", 50000, player, 0);
  g_millis = 60000; anim::linkLost();
  dump("LINK+0", 60000, player, 0);
  dump("LINK+250", 60250, player, 0);
  dump("LINK+1300", 61300, player, 0);

  // Modo LUCES: cada efecto con paleta propia, audio con beat y caras inclinadas.
  const CRGB pal[4] = {CRGB(10, 200, 30), CRGB(250, 20, 90), CRGB(40, 40, 255), CRGB(255, 255, 0)};
  anim::setPalette(pal);
  const int16_t fu[6] = {255, 120, 0, -60, -200, -255};
  for (int i = 0; i < 6; i++) g_faceUp[i] = fu[i];
  const uint8_t bands[7] = {200, 150, 100, 80, 60, 40, 20};
  for (int e = 0; e < FX_COUNT; e++) {
    const uint32_t T = 70000 + e * 10000;
    g_millis = T;
    anim::startShow((ShowEffect)e);
    g_millis = T + 100;
    anim::audioFrame(bands, true);
    for (uint32_t dt : {100u, 160u, 250u, 1234u, 5000u}) {
      char n[32];
      snprintf(n, 32, "FX%d+%u", e, dt);
      dump(n, T + dt, player, 0);
    }
  }
  return 0;
}
