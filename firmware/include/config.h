// =====================================================================
//  Magic Cube — configuración
//  Todos los parámetros ajustables del firmware están aquí.
// =====================================================================
#pragma once

// ---------- Pines (ver hardware/hardware-cubo-led.md) ----------
#define PIN_LEDS        16   // DATA → A0 del 74LVC8T245 → B0 → 330 Ω → DIN cara 1
                             // (en módulos ESP32-WROVER el 16 es de la PSRAM: usar otro pin)
#define PIN_BUTTON      27   // OUT del TTP223 (opcional; no está en el circuito actual)
#define PIN_SDA         22   // MPU6050 SDA   ¡invertidos respecto del ESP32 por defecto!
#define PIN_SCL         21   // MPU6050 SCL

// ---------- Firmware ----------
#define FW_VERSION      3     // v2: animaciones, objetivo físico, mapa de caras · v3: luces y OTA por BLE

// ---------- LEDs ----------
#define FACES           6
#define FACE_W          7
#define FACE_H          7
#define LEDS_PER_FACE   (FACE_W * FACE_H)      // 49 en la grilla 7×7
// NUM_LEDS (total encadenado, 293) se calcula en led_layout.h a partir de FACE_LEDS.

// LEDs realmente encadenados en cada cara (1 a 6).
//  - La cara 6 es la INFERIOR: por su centro (fila 4, columna 4) sale el cable
//    de alimentación, así que esa fila tiene 6 LEDs y la cara 48 en total.
//    FACE_HOLE indica qué posición de la grilla no tiene LED, contando desde 0
//    en orden de cadena sobre la grilla completa (24 = el centro; el centro es
//    el mismo con cualquier FACE_LAYOUTS). -1 = sin agujero.
//  - FACE_SKIP: si una cara tuviera un LED de más (una tira de 8, un LED en un
//    puente), su posición en la cadena dentro de la cara. -1 = no hay.
//  FACE_LEDS debe ser 49 − (agujero) + (sobrante); hay un static_assert.
#define FACE_LEDS  {49, 49, 49, 49, 49, 48}
#define FACE_HOLE  {-1, -1, -1, -1, -1, 24}
#define FACE_SKIP  {-1, -1, -1, -1, -1, -1}

// Cableado interno de cada panel 7×7, uno por cara (1 a 6), porque no todos
// los paneles vienen armados igual. Se ajusta con las pruebas LÍNEAS y
// NÚMEROS de led_test. Cada entrada es {zigzag, espejoX, espejoY, girado90}:
//   zigzag   1 si las filas alternan sentido (línea vertical "quebrada" → cambiarlo)
//   espejoX  1 si la línea vertical avanza de derecha a izquierda
//   espejoY  1 si la línea horizontal avanza de abajo hacia arriba
//   girado90 1 si la línea "vertical" se ve horizontal (y después revisar espejos)
#define FACE_LAYOUTS {          \
    {1, 0, 0, 0}, /* cara 1 */  \
    {1, 0, 0, 0}, /* cara 2 */  \
    {1, 0, 0, 0}, /* cara 3 */  \
    {1, 0, 0, 0}, /* cara 4 */  \
    {1, 0, 0, 0}, /* cara 5 */  \
    {1, 0, 0, 0}, /* cara 6 */  \
  }

// Qué eje del MPU6050 (ya calibrado: +Z = arriba en reposo, con la cara 6
// apoyada) apunta hacia afuera de cada cara. Códigos: 0 +X, 1 −X, 2 +Y,
// 3 −Y, 4 +Z, 5 −Z. Es un supuesto inicial: se mide con el asistente
// "Identificar caras" de la web (comando FMAP) y queda guardado en el cubo.
#define FACE_AXES_DEFAULT  {4, 0, 2, 1, 3, 5}

// Brillo por defecto (0–255). 26 ≈ 10 %. Se puede cambiar por BLE (BRI n).
#define DEFAULT_BRIGHTNESS   26
// Tope absoluto: 30 % (76/255). Los paneles no se pueden llevar más arriba
// (temperatura y consumo). Ningún comando ni modo lo supera.
#define MAX_BRIGHTNESS       76

// Límite de corriente para los LEDs: FastLED baja el brillo si el color pedido
// lo superaría (293 LEDs en blanco pleno pedirían ~17 A). Fuente de 5 V de
// pared con fusible de 7 A. Si la fuente es de menos de 5 A, poner la
// capacidad de la fuente menos 500 mA (lo que usa el ESP32).
#define POWER_LIMIT_MA       4500

// ---------- Botón táctil (TTP223) ----------
#define BUTTON_ACTIVE_HIGH   1     // TTP223 por defecto: HIGH al tocar
#define DEBOUNCE_MS          30
#define LONG_PRESS_MS        1500  // pulsación larga → recalibrar posición neutral

// ---------- IMU (MPU6050) ----------
// Módulo combinado MPU6050 + BMP (barómetro) en la misma placa y el mismo bus I²C.
// Solo se usa el MPU6050; el BMP (0x76/0x77) queda sin usar.
#define MPU_ADDR             0x68  // 0x69 si AD0 está a 3,3 V
#define GYRO_CAL_SAMPLES     400   // muestras para calcular el bias del giroscopio
#define COMPLEMENTARY_ALPHA  0.98f // peso del giroscopio en roll/pitch
#define GRAVITY_SMOOTHING    0.15f // 0–1: más bajo = color más suave pero más lento

// ---------- Color ----------
// Modo de color inicial: 0 = SIGNED, 1 = ABS, 2 = HSV (ver color_map.h)
#define DEFAULT_COLOR_MODE   0
#define COLOR_SMOOTHING      0.25f // suavizado extra sobre el RGB final

// ---------- Tiempos ----------
#define LED_INTERVAL_MS      16    // ~60 fps (293 LEDs tardan ~9 ms en enviarse)
#define BLE_INTERVAL_MS      33    // ~30 lecturas/s hacia la PC (paquete compacto, 1 notificación c/u)
#define SERIAL_INTERVAL_MS   100   // salida de depuración por USB

// ---------- BLE ----------
#define BLE_DEVICE_NAME      "CUBY"
// Nordic UART Service (compatible con nRF Connect, Bleak, Web Bluetooth…)
#define BLE_SERVICE_UUID     "6E400001-B5A3-F393-E0A9-E50E24DCCA9E"
#define BLE_RX_UUID          "6E400002-B5A3-F393-E0A9-E50E24DCCA9E" // PC → cubo (write)
#define BLE_TX_UUID          "6E400003-B5A3-F393-E0A9-E50E24DCCA9E" // cubo → PC (notify)
