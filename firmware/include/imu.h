// =====================================================================
//  IMU — MPU6050 por I²C
//
//  Entrega:
//   - vector "arriba" (gravedad normalizada y suavizada) en ejes del cubo,
//     ya corregido por la posición neutral calibrada
//   - roll / pitch (filtro complementario) y yaw (solo giroscopio, deriva)
// =====================================================================
#pragma once
#include <Arduino.h>

struct Vec3 {
  float x, y, z;
};

class Imu {
public:
  Vec3  up    = {0, 0, 1};           // gravedad corregida (se usa para el color)
  Vec3  upRaw = {0, 0, 1};           // gravedad en ejes del sensor, sin corregir
  float roll = 0, pitch = 0, yaw = 0; // grados

  bool begin();
  void update();

  // Vigilante: si el sensor deja de responder, se duerme (p. ej. tras un bajón
  // de los 3,3 V cuando los LEDs consumen fuerte) o devuelve siempre lo mismo,
  // lo reinicializa. Llamar seguido desde loop().
  void watchdog(uint32_t nowMs);
  uint16_t resets = 0;   // reinicializaciones hechas (se informa a la PC)
  uint32_t readErrors = 0;

  // Mantener el cubo quieto mientras se ejecuta (~1 s).
  void calibrateGyro();

  // Toma la orientación actual como "neutral": a partir de ahora up = (0,0,1).
  void setNeutralFromCurrent();
  void setNeutral(const Vec3 &ref);
  Vec3 getNeutral() const;

private:
  float ax = 0, ay = 0, az = 1;          // g
  float gx = 0, gy = 0, gz = 0;          // °/s
  float biasX = 0, biasY = 0, biasZ = 0;
  uint32_t lastUs = 0;

  Vec3  neutral = {0, 0, 1};
  float R[3][3] = {{1, 0, 0}, {0, 1, 0}, {0, 0, 1}}; // lleva "neutral" a (0,0,1)

  int16_t  lastRaw[7] = {0};
  uint16_t failStreak = 0;          // lecturas I²C fallidas seguidas
  uint32_t lastChangeMs = 0;        // última vez que cambió algún registro
  uint32_t lastCheckMs = 0;

  void configure();
  void buildNeutralRotation();
  Vec3 rotate(const Vec3 &v) const;
  bool readRaw();
  void write8(uint8_t reg, uint8_t val);
  uint8_t read8(uint8_t reg);
};
