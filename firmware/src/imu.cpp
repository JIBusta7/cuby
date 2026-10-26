#include "imu.h"

#include <Wire.h>
#include <math.h>
#include <string.h>

#include "config.h"

static Vec3 normalize(const Vec3 &v) {
  float l = sqrtf(v.x * v.x + v.y * v.y + v.z * v.z);
  return l > 1e-6f ? Vec3{v.x / l, v.y / l, v.z / l} : Vec3{0, 0, 1};
}

// Lista por serie lo que responde en el bus. Sirve para verificar el cableado:
// el módulo combinado debería mostrar el MPU6050 (0x68) y el BMP (0x76/0x77).
static void scanI2c() {
  uint16_t prevTimeout = Wire.getTimeOut();
  Wire.setTimeOut(5); // sin nada conectado el bus flota: no esperar 50 ms por dirección
  int found = 0;
  Serial.print("[I2C] dispositivos:");
  for (uint8_t addr = 1; addr < 127; addr++) {
    Wire.beginTransmission(addr);
    if (Wire.endTransmission() != 0) continue;
    found++;
    const char *name = "?";
    if (addr == 0x68 || addr == 0x69)      name = "MPU6050";
    else if (addr == 0x76 || addr == 0x77) name = "BMP180/BMP280";
    else if (addr == 0x1E)                 name = "HMC5883L";
    Serial.printf(" 0x%02X(%s)", addr, name);
  }
  if (!found) Serial.print(" ninguno");
  Serial.println();
  Wire.setTimeOut(prevTimeout);
}

bool Imu::begin() {
  Wire.begin(PIN_SDA, PIN_SCL);
  Wire.setClock(400000);
  scanI2c();

  uint8_t who = read8(0x75);
  if (who == 0xFF) return false; // nada respondió en el bus
  if (who != 0x68) {
    Serial.printf("[IMU] WHO_AM_I=0x%02X (clon de MPU6050, se continúa)\n", who);
  }
  configure();
  lastUs = micros();
  lastChangeMs = millis();
  return true;
}

void Imu::configure() {
  write8(0x6B, 0x01); // despertar, reloj = PLL giroscopio X
  delay(50);
  write8(0x19, 0x00); // sample rate divider
  write8(0x1A, 0x03); // DLPF ~44 Hz
  write8(0x1B, 0x08); // giroscopio ±500 °/s
  write8(0x1C, 0x00); // acelerómetro ±2 g
  delay(20);
}

void Imu::watchdog(uint32_t) {
  // Hora propia: la del inicio del loop puede ser anterior a la última lectura
  // y la resta sin signo daría un número enorme (falso "congelado").
  const uint32_t nowMs = millis();
  if (nowMs - lastCheckMs < 250) return;
  lastCheckMs = nowMs;
  const char *why = nullptr;
  if (failStreak >= 5) {
    why = "no responde por I2C";
    // Bus trabado (por ejemplo un falso contacto en SDA/SCL): reiniciar Wire.
    Wire.end();
    Wire.begin(PIN_SDA, PIN_SCL);
    Wire.setClock(400000);
  } else {
    const uint8_t pwr = read8(0x6B);
    if (pwr != 0xFF && (pwr & 0x40)) why = "se durmió (¿bajón de 3,3 V?)";
    // Un MPU6050 funcionando nunca repite exactamente los 14 bytes: siempre hay ruido.
    else if ((int32_t)(nowMs - lastChangeMs) > 400) why = "devuelve siempre el mismo valor";
  }
  if (!why) return;
  configure();
  resets++;
  failStreak = 0;
  lastChangeMs = nowMs;
  Serial.printf("[IMU] el sensor %s: reinicializado (%u)\n", why, resets);
}

void Imu::calibrateGyro() {
  float sx = 0, sy = 0, sz = 0;
  for (int i = 0; i < GYRO_CAL_SAMPLES; i++) {
    readRaw();
    sx += gx;
    sy += gy;
    sz += gz;
    delay(2);
  }
  biasX = sx / GYRO_CAL_SAMPLES;
  biasY = sy / GYRO_CAL_SAMPLES;
  biasZ = sz / GYRO_CAL_SAMPLES;
  yaw = 0;
}

void Imu::setNeutralFromCurrent() { setNeutral(upRaw); }

void Imu::setNeutral(const Vec3 &ref) {
  neutral = normalize(ref);
  buildNeutralRotation();
  up = {0, 0, 1};
  yaw = 0;
}

Vec3 Imu::getNeutral() const { return neutral; }

void Imu::update() {
  uint32_t now = micros();
  float dt = (now - lastUs) * 1e-6f;
  lastUs = now;
  if (dt <= 0 || dt > 0.2f) dt = 0.01f;

  if (!readRaw()) return; // sin lectura nueva: no se inventa movimiento

  // --- Gravedad suavizada (para el color) ---
  Vec3 a = normalize({ax, ay, az});
  upRaw.x += GRAVITY_SMOOTHING * (a.x - upRaw.x);
  upRaw.y += GRAVITY_SMOOTHING * (a.y - upRaw.y);
  upRaw.z += GRAVITY_SMOOTHING * (a.z - upRaw.z);
  up = normalize(rotate(upRaw));

  // --- Roll / pitch / yaw ---
  // Las velocidades angulares se llevan al mismo marco que `up` (el neutral
  // calibrado); si no, el filtro mezcla ejes distintos cuando el sensor va
  // montado inclinado respecto del cubo.
  Vec3  g  = rotate({gx - biasX, gy - biasY, gz - biasZ}); // °/s
  float rx = g.x, ry = g.y, rz = g.z;
  float accRoll  = atan2f(up.y, up.z) * RAD_TO_DEG;
  float accPitch = atan2f(-up.x, sqrtf(up.y * up.y + up.z * up.z)) * RAD_TO_DEG;
  roll  = COMPLEMENTARY_ALPHA * (roll + rx * dt) + (1 - COMPLEMENTARY_ALPHA) * accRoll;
  pitch = COMPLEMENTARY_ALPHA * (pitch + ry * dt) + (1 - COMPLEMENTARY_ALPHA) * accPitch;
  yaw  += rz * dt;
  if (yaw > 180) yaw -= 360;
  if (yaw < -180) yaw += 360;
}

// Rotación mínima (Rodrigues) que alinea el vector neutral con +Z.
void Imu::buildNeutralRotation() {
  Vec3 n = neutral;
  // eje = n × z, cosθ = n·z
  float kx = n.y, ky = -n.x; // n × (0,0,1) = (n.y, -n.x, 0)
  float s = sqrtf(kx * kx + ky * ky);
  float c = n.z;
  if (s < 1e-6f) {
    // ya alineado (c≈1) o invertido (c≈-1 → girar 180° sobre X)
    float sign = c > 0 ? 1.f : -1.f;
    float I[3][3] = {{1, 0, 0}, {0, sign, 0}, {0, 0, sign}};
    memcpy(R, I, sizeof(R));
    return;
  }
  kx /= s;
  ky /= s;
  float t = 1 - c;
  R[0][0] = c + kx * kx * t; R[0][1] = kx * ky * t;     R[0][2] = ky * s;
  R[1][0] = kx * ky * t;     R[1][1] = c + ky * ky * t; R[1][2] = -kx * s;
  R[2][0] = -ky * s;         R[2][1] = kx * s;          R[2][2] = c;
}

Vec3 Imu::rotate(const Vec3 &v) const {
  return {R[0][0] * v.x + R[0][1] * v.y + R[0][2] * v.z,
          R[1][0] * v.x + R[1][1] * v.y + R[1][2] * v.z,
          R[2][0] * v.x + R[2][1] * v.y + R[2][2] * v.z};
}

bool Imu::readRaw() {
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(0x3B);
  if (Wire.endTransmission(false) != 0 || Wire.requestFrom((uint8_t)MPU_ADDR, (uint8_t)14) != 14) {
    readErrors++;
    failStreak++;
    return false;
  }
  failStreak = 0;
  int16_t v[7];
  for (int i = 0; i < 7; i++) v[i] = (int16_t)((Wire.read() << 8) | Wire.read());
  if (memcmp(v, lastRaw, sizeof(v)) != 0) {
    memcpy(lastRaw, v, sizeof(v));
    lastChangeMs = millis();
  }
  ax = v[0] / 16384.0f; ay = v[1] / 16384.0f; az = v[2] / 16384.0f; // ±2 g
  // v[3] = temperatura (no se usa)
  gx = v[4] / 65.5f;    gy = v[5] / 65.5f;    gz = v[6] / 65.5f;    // ±500 °/s
  return true;
}

void Imu::write8(uint8_t reg, uint8_t val) {
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(reg);
  Wire.write(val);
  Wire.endTransmission();
}

uint8_t Imu::read8(uint8_t reg) {
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(reg);
  if (Wire.endTransmission(false) != 0) return 0xFF;
  if (Wire.requestFrom((uint8_t)MPU_ADDR, (uint8_t)1) != 1) return 0xFF;
  return Wire.read();
}
