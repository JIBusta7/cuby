#include "ble_link.h"

#include <BLE2902.h>
#include <BLEUtils.h>

#include "config.h"
#include "ota.h"

void BleLink::begin() {
  cmdQueue = xQueueCreate(8, BLE_CMD_MAX);

  BLEDevice::init(BLE_DEVICE_NAME);
  BLEDevice::setMTU(185);
  server = BLEDevice::createServer();
  server->setCallbacks(this);

  BLEService *svc = server->createService(BLE_SERVICE_UUID);
  tx = svc->createCharacteristic(BLE_TX_UUID, BLECharacteristic::PROPERTY_NOTIFY);
  tx->addDescriptor(new BLE2902());
  BLECharacteristic *rx = svc->createCharacteristic(
      BLE_RX_UUID, BLECharacteristic::PROPERTY_WRITE | BLECharacteristic::PROPERTY_WRITE_NR);
  rx->setCallbacks(this);
  svc->start();

  BLEAdvertising *adv = BLEDevice::getAdvertising();
  adv->addServiceUUID(BLE_SERVICE_UUID);
  adv->setScanResponse(true);
  BLEDevice::startAdvertising();
}

void BleLink::sendLine(const char *line) {
  if (!isConnected) return;
  size_t len = strlen(line);
  uint16_t mtu = server->getPeerMTU(connId);
  size_t chunk = mtu > 3 ? mtu - 3 : 20;
  if (chunk > 180) chunk = 180;

  static uint8_t buf[256];
  if (len + 1 > sizeof(buf)) len = sizeof(buf) - 1;
  memcpy(buf, line, len);
  buf[len++] = '\n';

  for (size_t off = 0; off < len; off += chunk) {
    size_t n = min(chunk, len - off);
    tx->setValue(buf + off, n);
    tx->notify();
  }
}

bool BleLink::pollCommand(char *out) {
  return cmdQueue && xQueueReceive(cmdQueue, out, 0) == pdTRUE;
}

void BleLink::service() {
  if (restartAdv) {
    restartAdv = false;
    delay(200);
    BLEDevice::startAdvertising();
  }
}

void BleLink::onConnect(BLEServer *, esp_ble_gatts_cb_param_t *param) {
  connId = param->connect.conn_id;
  isConnected = true;
  Serial.printf("[BLE] conectado (conn %u)\n", connId);
}

void BleLink::onDisconnect(BLEServer *) {
  isConnected = false;
  ota::abort("se cortó el Bluetooth");
  restartAdv = true;
}

void BleLink::onWrite(BLECharacteristic *c) {
  auto value = c->getValue();
  // Durante una actualización, todo lo que llega es parte del archivo .bin.
  if (ota::active()) {
    ota::feed((const uint8_t *)value.c_str(), value.length());
    return;
  }
  char cmd[BLE_CMD_MAX] = {0};
  size_t n = min((size_t)value.length(), (size_t)BLE_CMD_MAX - 1);
  memcpy(cmd, value.c_str(), n);
  xQueueSend(cmdQueue, cmd, 0);
}
