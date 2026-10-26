// =====================================================================
//  Animaciones locales de los LEDs (firmware v2)
//
//  El ESP32 dibuja él mismo las animaciones del juego; la PC solo dice cuál.
//  La web tiene un espejo exacto de este archivo (src/core/leds/ledModel.ts
//  de la app CUBY, carpeta app/) con los mismos tiempos y colores, para que el cubo
//  3D muestre lo mismo que el cubo físico.
//
//  Cuenta regresiva: 3, 2, 1 (1000 ms cada uno) y GO (500 ms). Al terminar
//  vuelve sola a PLAY, o a TARGET si hay un objetivo armado.
// =====================================================================
#pragma once
#include <FastLED.h>

enum AnimMode : uint8_t {
  ANIM_PLAY = 0,  // color según orientación en todo el cubo
  ANIM_TARGET,    // cara de arriba = objetivo; el resto = color del jugador
  ANIM_IDLE,      // ondas de arco iris
  ANIM_COUNT,     // 3, 2, 1, GO
  ANIM_WIN,       // celebración
  ANIM_FAIL,      // pulsos rojos
  ANIM_SOLID,     // color fijo (COLOR r g b)
  ANIM_LIGHT,     // una cara blanca (asistente de caras)
  ANIM_LINK_LOST, // se cortó el BLE: pulsos ámbar y vuelve a PLAY
  ANIM_SHOW,      // modo LUCES: un efecto (ver effects.ts en la web)
};

// Efectos del modo LUCES. Mismo orden y nombres que SHOW_EFFECTS en effects.ts.
enum ShowEffect : uint8_t {
  FX_RAINBOW, FX_PLASMA, FX_FIRE, FX_TWINKLE, FX_BREATHE, FX_RIPPLE, FX_SPIRAL,
  FX_RAIN, FX_CHASE, FX_PARTY, FX_GRAVITY, FX_SPECTRUM, FX_PULSE, FX_RINGS, FX_KICK, FX_BURST, FX_COUNT
};

namespace anim {

constexpr uint32_t BEAT_MS = 1000;
constexpr uint32_t GO_MS = 500;
constexpr uint32_t COUNTDOWN_MS = 3 * BEAT_MS + GO_MS;
constexpr uint32_t LINK_LOST_MS = 1200;

void start(AnimMode m);          // ANIM IDLE / COUNT / WIN / FAIL
void play();                     // PLAY, o TARGET si hay objetivo armado
void setTarget(const CRGB &c);   // TARGET r g b
void clearTarget();              // TARGET OFF
void setSolid(const CRGB &c);    // COLOR r g b
void setLight(uint8_t face);     // LIGHT 1–6 (0 = volver a jugar)
void linkLost();                 // desconexión BLE

AnimMode mode();
bool parseName(const char *name, AnimMode &out); // "PLAY", "IDLE", "COUNT", "WIN", "FAIL"

// Modo LUCES
bool parseEffect(const char *name, ShowEffect &out); // "RAINBOW", "PLASMA", …
void startShow(ShowEffect e);                        // SHOW <efecto>
void setPalette(const CRGB p[4]);                    // PAL rrggbb ×4
void audioFrame(const uint8_t bands[7], bool beat);  // A<14 hex><beat>, ~30 por segundo

// Transiciones por tiempo y dibujo de los 293 LEDs. faceUp: cuánto mira hacia
// arriba cada cara (producto escalar × 255), para el efecto GRAVITY.
void update(uint32_t now);
void render(uint32_t now, const CRGB &player, uint8_t topFace, const int16_t faceUp[6]);

}  // namespace anim
