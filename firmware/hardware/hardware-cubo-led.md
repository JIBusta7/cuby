# Contexto de hardware: cubo LED con ESP32

Este documento describe el circuito físico ya armado. Usalo como fuente de verdad para pines, alimentación y restricciones al escribir el firmware (PlatformIO + framework Arduino).

## Resumen

- Microcontrolador: **ESP32** (placa de desarrollo; el pin de 5 V de la placa no se llama VIN, se llama 5V/VBUS o similar).
- LEDs: **6 caras de 7×7 LEDs direccionables** (WS2812B o compatibles) = **293 LEDs en una sola cadena**. La cara 6 es la **inferior**: por su centro sale el cable de alimentación, así que tiene 48 LEDs (en la fila 4, la del medio, hay 6 en lugar de 7).
- Acelerómetro: **MPU6050** por I²C.
- Level shifter: **módulo 74LVC8T245** (8 canales, dos alimentaciones) para subir la señal de datos de 3,3 V a 5 V.
- Alimentación: **fuente de pared de 5 V** → **fusible de 7 A** → bus de +5 V. **No hay relé ni interruptor**: todo se enciende al enchufar la fuente.

## Mapa de pines del ESP32

| Pin ESP32 | Función | Conectado a |
|---|---|---|
| GPIO 16 | Datos de LEDs | A0 del 74LVC8T245 |
| GPIO 22 | **I²C SDA** | SDA del MPU6050 |
| GPIO 21 | **I²C SCL** | SCL del MPU6050 |
| 3V3 | Salida 3,3 V | VCC_IN del MPU6050, VCCA y DIR del 74LVC8T245 |
| 5V (equivalente a VIN) | Entrada de alimentación | Bus +5 V |
| GND | Tierra | Bus GND, GND del MPU6050, GND del 74LVC8T245 |

> **Atención: SDA y SCL están invertidos respecto de los pines por defecto del ESP32.** Hay que inicializar el bus explícitamente con `Wire.begin(22, 21);` (SDA, SCL) **antes** de inicializar el MPU6050. Sin esa línea el sensor no responde.

## Cadena de datos de los LEDs

```
GPIO 16 → A0 [74LVC8T245] B0 → resistencia 330 Ω → DIN Cara 1
Cara 1 DOUT → Cara 2 DIN → Cara 3 → Cara 4 → Cara 5 → Cara 6
```

- Índices globales: Cara 1 = LEDs 0–48, Cara 2 = 49–97, Cara 3 = 98–146, Cara 4 = 147–195, Cara 5 = 196–244, Cara 6 = 245–292 (48 LEDs: sin el del centro).
- La cara 6 se apoya sobre la mesa en reposo. La calibración de posición neutral (`CAL`) se hace con esa cara abajo.
- Cada cara son 7 tiras de 7 LEDs (matriz 7×7). **Pendiente de confirmar:** el recorrido de los datos dentro de cada cara (si es en serpentina o todas las tiras en el mismo sentido, y en qué esquina arranca). Hasta confirmarlo, encapsular el mapeo (x, y, cara) → índice en una sola función para poder ajustarlo fácilmente.
- Orden de color supuesto: **GRB** (típico de WS2812B). Verificar con un test de colores puros rojo/verde/azul.

## Level shifter 74LVC8T245

| Pin | Conexión | Motivo |
|---|---|---|
| VCCA | 3V3 del ESP32 | Lado A trabaja a 3,3 V |
| VCCB | Bus +5 V | Lado B saca 5 V para los LEDs |
| DIR | 3V3 | Dirección A → B |
| OE | GND | Habilitación activa en bajo |
| A0 | GPIO 16 | Entrada de datos |
| B0 | 330 Ω → DIN Cara 1 | Salida de datos a 5 V |
| A1–A7 | GND | Entradas sin usar |
| B1–B7 | Sin conectar | Salidas sin usar |

**No hay resistencia pull-down en GPIO 16.** Durante el arranque la línea puede flotar y producir un destello breve en los LEDs. El firmware debe apagar los LEDs lo antes posible en `setup()`.

## Alimentación y límites de corriente

- 293 LEDs a blanco pleno pueden pedir ~17 A. **El sistema no lo soporta.**
- **Obligatorio en firmware:** limitar el consumo con FastLED:
  ```cpp
  FastLED.setMaxPowerInVoltsAndMilliamps(5, 4500);
  ```
  4500 mA es el valor por defecto. Si la fuente es de menos de 5 A, usar (capacidad de la fuente − 500 mA).
- Cada cara recibe +5 V y GND directamente del bus, con un capacitor de 100–470 µF en su entrada.
- Con los LEDs en negro hay ~0,3 A de consumo en reposo. No existe forma de cortar la alimentación de los LEDs por software.

## Requisitos para el `setup()`

Orden recomendado:

```cpp
#include <Wire.h>
#include <FastLED.h>

#define LED_PIN   16
#define NUM_LEDS  293   // en el firmware se calcula sola a partir de FACE_LEDS / FACE_HOLE
CRGB leds[NUM_LEDS];

void setup() {
  // 1. LEDs primero, para apagarlos cuanto antes
  FastLED.addLeds<WS2812B, LED_PIN, GRB>(leds, NUM_LEDS);
  FastLED.setMaxPowerInVoltsAndMilliamps(5, 4500);
  FastLED.clear(true);

  // 2. I2C con pines invertidos: SDA = 22, SCL = 21
  Wire.begin(22, 21);

  // 3. Recién ahora inicializar el MPU6050 (dirección I2C típica 0x68)
}
```

## Cosas a verificar si algo falla

- **El MPU6050 no aparece:** confirmar `Wire.begin(22, 21)`; correr un escáner I²C (debería verse 0x68, o 0x69 si AD0 está en alto).
- **LEDs con colores erráticos o sin respuesta:** revisar que OE del 74LVC8T245 esté a GND y DIR a 3V3; probar orden de color GRB vs RGB.
- **Si la placa usa un módulo ESP32-WROVER:** GPIO 16 y 17 están reservados para la PSRAM y **no sirven** para los LEDs. En ese caso hay que mover los datos a otro pin (por ejemplo GPIO 4 o 13) y actualizar este documento.
- **Brillo que cae al poner mucho blanco:** es el límite de potencia actuando; es el comportamiento esperado.
