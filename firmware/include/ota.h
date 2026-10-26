// =====================================================================
//  Actualización del firmware por Bluetooth (OTA)
//
//  La web (CUBY → Ajustes → Firmware) manda:
//    1. "OTA <tamaño> <md5>"  por el canal de comandos.
//       El cubo responde {"t":"ota","ready":1} cuando está listo.
//    2. El archivo .bin en bloques binarios por la misma característica RX.
//       Mientras dura la carga, todo lo que llega por RX es parte del archivo.
//    3. Al completar, el cubo verifica el MD5 y la imagen, responde
//       {"t":"ota","done":1} y se reinicia con el firmware nuevo.
//  Progreso: {"t":"ota","n":<bytes escritos>} cada 8 KB.
//  Si algo falla: {"t":"ota","err":"..."} y sigue con el firmware actual.
//
//  Requiere la tabla de particiones con dos espacios de programa
//  (min_spiffs.csv): se escribe en el que no está corriendo.
// =====================================================================
#pragma once
#include <Arduino.h>

namespace ota {

// Empieza una actualización. md5 puede ser nullptr. Devuelve false con motivo en `why`.
bool begin(uint32_t size, const char *md5, const char *&why);
bool active();
// Llamado desde la tarea de BLE con cada bloque recibido (no bloquea).
void feed(const uint8_t *data, size_t len);
// Llamar en cada loop(): escribe en flash, informa progreso y termina.
// Devuelve true mientras hay una actualización en curso.
bool loop(void (*send)(const char *json));
void abort(const char *why);
float progress();

}  // namespace ota
