# Protocolo con el cubo (firmware v2)

Firmware: proyecto PlatformIO `Magic Cube` (ESP32). Conexión **BLE**, Nordic UART Service:

| | UUID |
|---|---|
| Servicio | `6E400001-B5A3-F393-E0A9-E50E24DCCA9E` |
| RX (PC → cubo, write) | `6E400002-B5A3-F393-E0A9-E50E24DCCA9E` |
| TX (cubo → PC, notify) | `6E400003-B5A3-F393-E0A9-E50E24DCCA9E` |

Nombre del dispositivo: `CUBY` (`CuboRGB` en firmwares anteriores; la app acepta los dos). Las líneas JSON llegan troceadas según el MTU: se acumulan y se
cortan por `\n`.

## Cubo → PC

Lecturas por BLE (firmware v2), ~30 por segundo, en formato compacto: cada lectura entra en **una sola
notificación** aunque el MTU sea el mínimo (20 bytes útiles). Con JSON una lectura viajaba en hasta 7
fragmentos y, si se perdía uno, se descartaba entera.

```
d<seq><x>,<y>,<z>,<flags>        ej. d7-707,12,707,0
  seq    0–9 cíclico (la web cuenta los saltos como paquetes perdidos)
  x,y,z  dirección "arriba" ya calibrada × 999 (enteros −999…999)
  flags  botón (bit 0) + 2 × modo de color
```

Todo lo demás es JSON, una línea por mensaje:

```
{"t":"s","ie":0,"fw":2}             estado, 1 por segundo: reinicios del sensor (ie)
{"t":"btn","ev":"short"}            toque corto (el juego lo usa para confirmar)
{"t":"info","fw":2,"caps":["anim","target","fmap","show"]}
{"t":"ack","cmd":"MODE"} / {"t":"err","cmd":"..."} / {"t":"pong"} / {"t":"cal"}
```

- Por USB (monitor serie) y con el firmware v1 las lecturas siguen siendo JSON completo:
  `{"t":"d","x":0.32,"y":-0.71,"z":0.54,"roll":..,"pitch":..,"yaw":..,"rgb":[..],"btn":0,"state":0,"mode":0,"ie":0}`.
- La web calcula el color con `x, y, z` y la misma función del firmware.
- **Vigilante del sensor:** si el MPU6050 deja de responder, se duerme (bajón de 3,3 V) o devuelve
  siempre lo mismo, el firmware lo reinicializa solo y suma 1 a `ie`. La web avisa y lo muestra en
  el diagnóstico (Ajustes, o `D` durante la partida).

## PC → cubo

| Comando | Desde | Efecto |
|---|---|---|
| `CAL` | v1 | Posición actual = neutral (apoyar el cubo sobre la cara 6) |
| `MODE n` | v1 | Modo de color 0 SIGNED, 1 ABS, 2 HSV. El juego usa 0 |
| `BRI n` | v1 | Brillo, recortado al 30 % (76) |
| `COLOR r g b` / `AUTO` | v1 | Color fijo / volver al color por orientación |
| `STATE n`, `PING` | v1 | Estado libre que se reenvía / responde `pong` |
| `INFO` | v2 | Versión y capacidades (el v1 responde `err`) |
| `ANIM x` | v2 | `PLAY`, `IDLE`, `COUNT`, `WIN`, `FAIL` (corren en el ESP32) |
| `TARGET r g b` / `TARGET OFF` | v2 | Objetivo en la cara de arriba (Physical Target) |
| `LIGHT n` | v2 | Solo la cara n en blanco (1–6), 0 vuelve a jugar |
| `FMAP a b c d e f` | v2 | Eje del sensor de cada cara (`+X -X +Y -Y +Z -Z`), se guarda en el cubo |
| `SHOW x` | v2 | Modo LUCES: `RAINBOW PLASMA FIRE TWINKLE BREATHE RIPPLE SPIRAL RAIN CHASE PARTY GRAVITY` (demo) y `SPECTRUM PULSE RINGS KICK BURST` (audio: cambian de color en cada bombo y siguen a los graves) |
| `PAL c1 c2 c3 c4` | v2 | Paleta de 4 colores en hex `rrggbb` |
| `OTA <tam> <md5>` | v3 | Actualización por Bluetooth: después van los bytes del `.bin` en crudo por RX. Respuestas `{"t":"ota","ready":1}`, `{"t":"ota","n":bytes}`, `{"t":"ota","done":1}` o `{"t":"ota","err":"…"}` |
| `A<14 hex><b>` | v2 | Cuadro de audio: 7 bandas `00`–`FF` + beat `0/1` (16 caracteres). ~30 por segundo, sin respuesta |

## Animaciones (anim.cpp = src/core/leds/ledModel.ts)

| Animación | Qué muestra |
|---|---|
| `IDLE` | Ondas de arco iris que recorren las caras |
| `COUNT` | 3 (coral), 2 (amarillo), 1 (verde), 1000 ms cada uno, en las matrices de 7 × 7; GO = anillo que se expande, 500 ms. Después vuelve sola a `PLAY` o `TARGET` |
| `PLAY` | Todo el cubo con el color del jugador |
| `TARGET` | Cara de arriba = objetivo con marco negro; resto = color del jugador. La cara de arriba se decide con histéresis para que no salte cerca de 45° |
| `WIN` / `FAIL` | Arco iris con destellos / pulsos rojos |
| `LIGHT` | Una cara blanca (asistente "Identificar caras") |
| Desconexión BLE | Pulsos ámbar 1,2 s y vuelve a `PLAY` |
| `SHOW` | Uno de los 16 efectos del modo LUCES (`effects.ts` = `showPixel()` en `anim.cpp`, aritmética entera de FastLED: `sin8`, `scale8`) |

Para verificar que el firmware y la web dibujan lo mismo: `npm run parity`
(usa la carpeta `firmware/` del repositorio; otra ruta con `FIRMWARE_DIR`).

## Cargar el firmware

```
pio run -e esp32dev -t upload
```
El cubo tiene que estar con la fuente de 5 V conectada (el USB solo no alcanza para los LEDs).
