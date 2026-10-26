#include "ota.h"

#include <Update.h>
#include <freertos/FreeRTOS.h>
#include <freertos/stream_buffer.h>

namespace {

StreamBufferHandle_t buffer = nullptr;
volatile bool running = false;
volatile bool overflow = false;
uint32_t total = 0;
uint32_t written = 0;
uint32_t lastReport = 0;
uint32_t lastDataMs = 0;
const char *pendingError = nullptr;
uint8_t chunk[2048];

constexpr size_t BUFFER_BYTES = 24 * 1024;  // la web manda de a bloques confirmados: nunca se llena
constexpr uint32_t TIMEOUT_MS = 15000;

}  // namespace

namespace ota {

bool begin(uint32_t size, const char *md5, const char *&why) {
  if (running) Update.abort();
  if (!buffer) buffer = xStreamBufferCreate(BUFFER_BYTES, 1);
  if (!buffer) {
    why = "sin memoria para el buffer";
    return false;
  }
  xStreamBufferReset(buffer);
  if (size == 0 || !Update.begin(size, U_FLASH)) {
    why = size == 0 ? "tamaño 0" : "no entra en la partición (¿firmware con particiones viejas?)";
    return false;
  }
  if (md5 && strlen(md5) == 32) Update.setMD5(md5);
  total = size;
  written = 0;
  lastReport = 0;
  overflow = false;
  pendingError = nullptr;
  lastDataMs = millis();
  running = true;
  return true;
}

bool active() { return running; }

float progress() { return total ? (float)written / total : 0; }

void feed(const uint8_t *data, size_t len) {
  if (!running) return;
  if (xStreamBufferSend(buffer, data, len, 0) != len) overflow = true;
}

void abort(const char *why) {
  if (!running) return;
  running = false;
  Update.abort();
  pendingError = why;
}

bool loop(void (*send)(const char *json)) {
  char msg[96];
  if (pendingError) {
    snprintf(msg, sizeof(msg), "{\"t\":\"ota\",\"err\":\"%s\"}", pendingError);
    send(msg);
    Serial.printf("[OTA] cancelada: %s\n", pendingError);
    pendingError = nullptr;
    return false;
  }
  if (!running) return false;
  if (overflow) {
    abort("se perdieron datos (buffer lleno)");
    return true;
  }
  size_t n;
  while ((n = xStreamBufferReceive(buffer, chunk, sizeof(chunk), 0)) > 0) {
    lastDataMs = millis();
    if (Update.write(chunk, n) != n) {
      abort(Update.errorString());
      return true;
    }
    written += n;
  }
  if (written - lastReport >= 8192 || (written == total && lastReport != written)) {
    lastReport = written;
    snprintf(msg, sizeof(msg), "{\"t\":\"ota\",\"n\":%u}", written);
    send(msg);
  }
  if (written >= total) {
    running = false;
    if (Update.end(true)) {  // verifica MD5 e imagen; marca la partición nueva para el próximo arranque
      send("{\"t\":\"ota\",\"done\":1}");
      Serial.println("[OTA] lista: reiniciando con el firmware nuevo");
      delay(600);  // que salga la notificación
      ESP.restart();
    }
    snprintf(msg, sizeof(msg), "{\"t\":\"ota\",\"err\":\"%s\"}", Update.errorString());
    send(msg);
    return false;
  }
  if (millis() - lastDataMs > TIMEOUT_MS) abort("no llegaron más datos");
  return true;
}

}  // namespace ota
