// =====================================================================
//  Enlace BLE con la PC (Nordic UART Service)
//
//  Cubo → PC  (notify en TX): líneas JSON terminadas en '\n'.
//      Si el MTU negociado es chico, una línea llega partida en varios
//      paquetes: la PC debe acumular y cortar por '\n'.
//  PC → Cubo  (write en RX):  comandos de texto, ver main.cpp.
// =====================================================================
#pragma once
#include <Arduino.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <freertos/FreeRTOS.h>
#include <freertos/queue.h>

#define BLE_CMD_MAX 64

class BleLink : public BLEServerCallbacks, public BLECharacteristicCallbacks {
public:
  void begin();
  bool connected() const { return isConnected; }

  // Envía una línea completa (se agrega '\n'), troceada según el MTU.
  void sendLine(const char *line);

  // Devuelve true y copia el comando en `out` (BLE_CMD_MAX bytes) si hay uno pendiente.
  bool pollCommand(char *out);

  // Reanuda el advertising tras una desconexión. Llamar desde loop().
  void service();

  // Callbacks del stack BLE (se ejecutan en su propia tarea)
  void onConnect(BLEServer *server, esp_ble_gatts_cb_param_t *param) override;
  void onDisconnect(BLEServer *server) override;
  void onWrite(BLECharacteristic *characteristic) override;

private:
  BLEServer *server = nullptr;
  BLECharacteristic *tx = nullptr;
  QueueHandle_t cmdQueue = nullptr;
  volatile bool isConnected = false;
  volatile bool restartAdv = false;
  uint16_t connId = 0;
};
