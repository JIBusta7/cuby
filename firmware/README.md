# Magic Cube — firmware ESP32

Cubo RGB interactivo: la orientación (MPU6050) define el color de 293 WS2812B
y los datos se envían a la PC por BLE. El juego de la PC es la webapp **CUBY**
(carpeta `../app` de este repositorio).

**Caras:** seis paneles de 7×7 encadenados, cara 1 → cara 6. La **cara 6 es la inferior**: por su
centro (fila 4) sale el cable de alimentación, así que tiene 48 LEDs. Total: 293. El mapeo lo resuelve
`FACE_HOLE` en `config.h`; todo el código dibuja con `setPixel()`, que ignora el agujero.

## Estructura
```
Magic Cube/
├── platformio.ini      placa esp32dev, partición huge_app, FastLED
├── include/            declaraciones (.h)
│   ├── config.h        pines y parámetros ajustables
│   ├── led_layout.h    mapeo (cara, x, y) → índice de LED
│   ├── imu.h           MPU6050: orientación y calibración
│   ├── color_map.h     orientación → color
│   ├── anim.h          animaciones locales del juego (v2)
│   └── ble_link.h      BLE (Nordic UART)
└── src/                implementaciones (.cpp)
    ├── main.cpp        setup/loop: LEDs, botón, comandos, envío de datos
    ├── led_test/       firmware aparte para probar los paneles (ver abajo)
    ├── imu.cpp
    ├── color_map.cpp
    ├── anim.cpp
    └── ble_link.cpp
hardware/hardware-cubo-led.md   circuito armado: pines, level shifter, alimentación (fuente de verdad)
hardware/enclosure/     estructura impresa en 3D (OpenSCAD + STL), ver su README
```

## Actualizar sin cable (Bluetooth)
Desde el firmware v3 se puede actualizar desde la app CUBY: Ajustes → Firmware del cubo. La
**primera** carga del v3 tiene que ser por USB, porque cambia la tabla de particiones a
`min_spiffs.csv` (dos espacios de programa de 1,9 MB: uno corre, en el otro se escribe el nuevo).
Después: `pio run -e esp32dev` y, en `../app`, `npm run firmware:bundle`. Ver `src/ota.cpp`.

## Compilar y subir
Desde la barra de PlatformIO en VS Code (✓ Build, → Upload, 🔌 Monitor) o por terminal:
```
pio run -t upload
pio device monitor
```
FastLED está fijado en 3.9.x: la 3.10 no compila con el core Arduino 2.x de la plataforma oficial `espressif32`.

Driver de LEDs: FastLED manda los datos con el periférico RMT del ESP32 y recarga su buffer desde una
interrupción. Si esa interrupción llega tarde (BLE, escrituras en flash, serie), la cadena ve un corte
a mitad de trama: los LEDs que siguen no se actualizan y los primeros de la cadena reciben datos que
no eran para ellos. Síntoma típico: la última cara a medias, a veces sí y a veces no. Los `build_flags`
de `platformio.ini` le dan al canal RMT toda la memoria (320 µs de margen en lugar de 80) y bloquean
la flash durante el envío. Abrir el monitor serie no reinicia la placa (`monitor_dtr/rts = 0`); para
ver el arranque, botón EN.

### Probar los paneles
Hay un segundo entorno, `led_test`, que no necesita la IMU ni usa BLE:
```
pio run -e led_test -t upload
pio device monitor
```
(En la barra de PlatformIO también se puede elegir el entorno `led_test` antes de subir.)

Al encender arranca en VERIFICAR (prueba 6) y la repite; `a` pasa al ciclo con todas las pruebas.
Comandos en el monitor (una tecla, sin Enter): `0`–`9` fija una prueba, `a` ciclo automático,
`n` pasa a la siguiente, `+`/`-` cambian el brillo. Para revisar
una cara: `c1`–`c6` la deja sola en blanco tenue, y `f1`–`f6` la rellena LED a LED en orden de
cadena, despacio; donde deja de crecer está el LED o el puente entre tiras cortado.

| # | Prueba | Qué verifica |
|---|---|---|
| 0 | CARAS | Cada cara sola con su color: 1 rojo, 2 verde, 3 azul, 4 amarillo, 5 magenta, 6 cian. Orden de encadenado. |
| 1 | BARRIDO | Un píxel recorre los 293. Píxeles muertos y recorrido del dato dentro del panel. |
| 2 | NÚMEROS | Cada cara muestra su número (1 a 6) y un punto blanco en (0,0). Zigzag y orientación. |
| 3 | BLANCO | Todo blanco. Si las últimas caras se ven amarillas o más tenues, cae la tensión de 5 V. |
| 4 | RGB | Rojo, verde, azul. Si "rojo" sale verde, el orden de color no es GRB. |
| 5 | TODAS | Las 6 caras a la vez con su color, más 49 LEDs extra en blanco. Si algo se ve blanco, la cadena tiene más de 293 LEDs; si una cara mezcla dos colores, alguna cara anterior no tiene los LEDs esperados. |
| 6 | VERIFICAR | Cara por cara: entera en su color, apagado, y relleno tira por tira LED a LED (el monitor dice qué tira va). Donde deja de crecer está el corte. Termina con TODAS. |
| 7 | LÍNEAS | En todas las caras a la vez: línea vertical de izquierda a derecha, después horizontal de arriba a abajo. Diagnostica el cableado de cada panel (ver abajo). |
| 8 | PARPADEO | Todo blanco / apagado cada 400 ms. Lo que no parpadea no recibe datos: mover los puentes entre tiras con el dedo para encontrar el falso contacto. |
| 9 | CONTEO | Todo gris tenue (un LED muerto se ve negro), primer LED de cada cara rojo, último azul, LEDs más allá del 293 en verde. Cada panel debe tener un solo rojo arriba a la izquierda y un solo azul abajo a la derecha; si no, ese panel no tiene los LEDs esperados (49, o 48 la cara 6). |

El cableado se configura **por cara** en `FACE_LAYOUTS` (`config.h`), porque no todos los paneles vienen
armados igual. Se puede ajustar **en vivo** desde el monitor: `z5` cambia el zigzag de la cara 5, `x5` el
espejo X, `y5` el espejo Y, `t5` el giro de 90°; la prueba se redibuja y el monitor imprime la tabla lista
para pegar en `config.h`. `p1`–`p6` pone una sola cara en blanco al 100 % durante 10 s (unos 2,8 A, solo
con la fuente conectada) para medir potencia; sube y baja en rampa y después vuelve al brillo normal.
Con LÍNEAS, mirar cada cara y corregir su entrada `{zigzag, espejoX, espejoY, girado90}`:
- línea vertical "quebrada" (puntos alternados, no una línea) → cambiar `zigzag`
- línea vertical recta pero que avanza de derecha a izquierda → `espejoX 1`
- línea horizontal que avanza de abajo hacia arriba → `espejoY 1`
- la "vertical" se ve horizontal y viceversa → `girado90 1`, y después revisar los espejos
Después NÚMEROS confirma: cada número derecho y el punto blanco arriba a la izquierda.

Si una cara tiene un LED de más (una tira de 8, un LED en un puente), todo lo que sigue en la cadena
queda corrido: en CONTEO el azul de esa cara aparece un lugar antes de la esquina y la cara siguiente
pierde su rojo. Se corrige en `config.h` con `FACE_LEDS` (cantidad real por cara) y `FACE_SKIP`
(posición del sobrante dentro de la cara, contando desde 0 en orden de cadena). El relleno `fN` muestra
dónde está: el monitor imprime el número de cada LED mientras se enciende.

Alimentación en la prueba: usar la fuente de 5 V del cubo (ver "Alimentación"); la prueba aplica
los mismos topes `MAX_BRIGHTNESS` y `POWER_LIMIT_MA`. Si se prueba solo con el USB de la PC, bajar
`LED_TEST_POWER_MA` a 500 en `led_test/main.cpp`: hay ~500 mA para todo y los paneles se ven tenues.
Si el ESP32 se reinicia (`Brownout detector`), la fuente no alcanza. Si el primer panel parpadea
o muestra colores al azar, revisar OE a GND y DIR a 3V3 en el 74LVC8T245 (o un cable de DATA
demasiado largo).

## Conexiones
Fuente de verdad: [hardware/hardware-cubo-led.md](hardware/hardware-cubo-led.md) (circuito armado).
Los pines se editan en `config.h`.

| Pin ESP32 | Función | Conectado a |
|---|---|---|
| GPIO 16 | DATA LEDs | A0 del 74LVC8T245 |
| GPIO 22 | I²C SDA | SDA del MPU6050 |
| GPIO 21 | I²C SCL | SCL del MPU6050 |
| GPIO 27 | Botón táctil (opcional) | OUT del TTP223, si se agrega |
| 3V3 | 3,3 V | VCC del MPU6050, VCCA y DIR del 74LVC8T245 |
| 5V | Entrada de alimentación | Bus +5 V |
| GND | Tierra | Bus GND, MPU6050, 74LVC8T245 |

**SDA y SCL están invertidos respecto de los pines por defecto del ESP32** (SDA = 22, SCL = 21).
El firmware inicializa el bus con los pines de `config.h`; con los valores por defecto el sensor
no responde.

### Level shifter 74LVC8T245
VCCA → 3V3, VCCB → +5 V, DIR → 3V3 (sentido A → B), OE → GND. A0 ← GPIO 16; B0 → 330 Ω → DIN de la
cara 1. A1–A7 a GND, B1–B7 sin conectar. GPIO 16 no tiene pull-down: la línea flota en el arranque
y puede dar un destello; por eso `setup()` apaga los LEDs antes que nada.

### Alimentación
```
Fuente 5 V de pared → fusible 7 A → bus +5 V ─┬─ ESP32 (pin 5V)
                                             ├─ 74LVC8T245 (VCCB)
                                             └─ cara 1 … cara 6 (cada una con 100–470 µF)
GND común a todo. No hay switch: enciende al enchufar la fuente.
```
- La alimentación va en paralelo por cara; lo que va en serie es DATA: 293 LEDs encadenados,
  cara 1 → cara 2 → … → cara 6 (cara 1 = LEDs 0–48, cara 6 = 245–292, 48 LEDs).
- Las caras se numeran 1–6 en todo lo visible (mensajes, prueba); en el código los índices van 0–5.
- En reposo (LEDs en negro) consume ~0,3 A; no hay forma de cortar los LEDs por software.
- El ESP32 se puede dejar por USB mientras está la fuente: el DevKit tiene un diodo entre el USB
  y el pin 5V.

Límites en `config.h`:
- `MAX_BRIGHTNESS 76`: 30 % del brillo. Tope por temperatura y consumo de los paneles; ningún
  comando lo supera (`BRI` se recorta ahí).
- `POWER_LIMIT_MA 4500`: FastLED baja el brillo solo si el color pedido superaría esa corriente
  (293 LEDs en blanco pleno pedirían ~17 A). Si la fuente es de menos de 5 A, poner la capacidad
  de la fuente menos 500 mA para el ESP32.

### Módulo IMU
Es una placa combinada **MPU6050 + BMP** (barómetro). Los dos chips cuelgan del mismo bus I²C:
el firmware usa solo el MPU6050 (dirección `0x68`); el BMP (`0x76`/`0x77`) queda sin usar.
- Las resistencias pull-up de SDA/SCL ya vienen en el módulo, no hace falta agregar nada.
- El módulo tiene regulador propio: VCC acepta 3,3 V o 5 V. Se usa 3V3 del ESP32.
- Dejar AD0 sin conectar (o a GND) para que la dirección sea `0x68`.
- Si la placa es una GY-87 trae además un magnetómetro HMC5883L detrás del MPU6050; no se usa
  y no aparece en el escaneo del bus (haría falta activar el modo *bypass*).

Al encender, el monitor serie lista lo que responde en el bus:
```
[I2C] dispositivos: 0x68(MPU6050) 0x77(BMP180/BMP280)
```
Si imprime `ninguno`, revisar VCC/GND/SDA/SCL. Si aparece `0x69`, AD0 está a 3,3 V: cambiar
`MPU_ADDR` en `config.h`.

## Uso
- **Al encender**: dejar el cubo quieto ~1 s (calibra el giroscopio, LEDs en gris tenue).
- **Toque corto**: evento `short` a la PC.
- **Toque largo (1,5 s)**: la posición actual pasa a ser la neutral (se guarda en memoria).
- El botón táctil es opcional y no está en el circuito actual. Sin él, el comando `CAL` (por BLE
  o por el monitor serie) hace lo mismo que el toque largo.
- **Parpadeo rojo**: no se detecta la IMU.
- **Destello azul**: la PC se conectó por BLE. **Pulsos ámbar**: se desconectó.
- **Calibrar** (`CAL` o toque largo) siempre con la cara 6, la del cable, apoyada.

## Modos de color (`MODE n`)
- `0` SIGNED: X→R, Y→G, Z→B, cada eje de -1..1 a 0..255.
- `1` ABS: valor absoluto por eje; caras opuestas dan el mismo primario.
- `2` HSV: hacia dónde se inclina → tono; cuánto se inclina → saturación.

## Protocolo BLE
Nombre `CUBY` (antes `CuboRGB`), Nordic UART Service (`6E400001-…`).
- **TX (notify, cubo → PC)**: líneas JSON terminadas en `\n`. Si el MTU es pequeño, una línea
  llega partida en varios paquetes: acumular y separar por `\n`.
  ```
  {"t":"d","x":0.32,"y":-0.71,"z":0.54,"roll":-52.3,"pitch":-18.6,"yaw":4.1,"rgb":[168,36,196],"btn":0,"state":0,"mode":0}
  {"t":"btn","ev":"short","rgb":[168,36,196]}
  ```
- **RX (write, PC → cubo)**: `CAL`, `MODE n`, `BRI n`, `STATE n`, `COLOR r g b`, `AUTO`, `PING`.
- **v2, para el juego**: `INFO`, `ANIM PLAY|IDLE|COUNT|WIN|FAIL`, `TARGET r g b` / `TARGET OFF`,
  `LIGHT n`, `FMAP a b c d e f`.
- **v2, modo LUCES**: `SHOW <efecto>` (14 efectos: 11 de demo y 3 reactivos al audio), `PAL` (paleta
  de 4 colores) y cuadros de audio `A<7 bandas hex><beat>` a ~30 por segundo, sin respuesta.
- **Lecturas por BLE**: formato compacto `d<seq><x>,<y>,<z>,<flags>` (una notificación por lectura,
  ~30 por segundo) y estado `{"t":"s","ie":n}` cada segundo. Por USB siguen en JSON.
- **Vigilante del sensor**: si el MPU6050 se duerme, se congela o no responde, se reinicializa solo
  (`[IMU] … reinicializado` por serie, `ie` hacia la web). Las animaciones corren en el ESP32 (`anim.cpp`); la webapp tiene un
  espejo idéntico, verificado píxel a píxel (`npm run parity` en `../app`). Detalle completo en
  `../app/docs/firmware.md`.

Los mismos comandos funcionan escribiéndolos en el Monitor serie.
El `yaw` sale solo del giroscopio (el MPU6050 no tiene magnetómetro) y deriva con el tiempo;
el color depende solo de la gravedad, así que no le afecta.
