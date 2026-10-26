/**
 * Identificadores BLE, copiados del firmware (Magic Cube/include/config.h).
 * Nordic UART Service: TX = notificaciones cubo → PC, RX = escritura PC → cubo.
 */
export const CUBE_DEVICE_NAME = 'CUBY';
/** Nombre que anunciaba el firmware anterior: la app lo sigue aceptando. */
export const LEGACY_DEVICE_NAMES = ['CuboRGB'] as const;
export const NUS_SERVICE_UUID = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';
export const NUS_RX_UUID = '6e400002-b5a3-f393-e0a9-e50e24dcca9e'; // write (PC → cubo)
export const NUS_TX_UUID = '6e400003-b5a3-f393-e0a9-e50e24dcca9e'; // notify (cubo → PC)
