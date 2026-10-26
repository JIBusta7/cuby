# CUBY

Un cubo de 293 LEDs que cambia de color cuando lo girás. Es un juego para igualar colores contra el
reloj y también una lámpara que reacciona a la música.

**Probarlo online: https://cuby-sandy.vercel.app** (Chrome o Edge de escritorio; sin el cubo usa el
simulador).

Proyecto del Obligatorio 1 de **Diseño Multimedia 1**, Facultad de Diseño, Universidad ORT Uruguay
(2026).

## Qué hace

- **Juego.** Cada nivel muestra un color objetivo al azar, y el jugador inclina el cubo hasta
  igualarlo. Hay cuatro modos: Precision Challenge, Timed Match, Physical Target (el objetivo se
  muestra en la cara de arriba del cubo) y Speed Challenge (3, 5 o 10 colores seguidos). Cada modo
  tiene su ranking.
- **Luces.** 11 efectos animados, un modo que reacciona al sonido por micrófono o por el audio de una
  pestaña, y un modo que se conecta a Spotify. En cada golpe del bombo el cubo cambia de color.
- **Sincronización.** La cuenta regresiva, las celebraciones y los efectos corren en el ESP32 y se
  ven igual en el cubo físico y en el cubo 3D de la pantalla.

## Estructura

| Carpeta | Qué es |
|---|---|
| [`app/`](app) | App web (React, TypeScript, Three.js, Web Bluetooth). Funciona con el cubo real o con un cubo simulado. |
| [`firmware/`](firmware) | Firmware del ESP32 (PlatformIO, Arduino): sensor MPU6050, 293 LEDs WS2812B, Bluetooth, animaciones y actualización inalámbrica. |

## Probarlo

**App:** requiere Node 20 o superior, y Chrome o Edge de escritorio para Bluetooth.
```
cd app
npm install
npm run dev        # http://127.0.0.1:5173
```
Sin el cubo, la app usa el simulador: arrastrá el cubo 3D o usá las flechas.

**Firmware:** con PlatformIO.
```
cd firmware
pio run -e esp32dev -t upload
```
Desde la versión 3, el firmware también se actualiza por Bluetooth desde la app, en
Ajustes → Firmware del cubo.

## Hardware

ESP32 DevKit · MPU6050 (I²C) · 6 paneles de 7×7 WS2812B en una sola cadena de 293 LEDs, porque la cara
inferior no tiene LED central (por ahí sale el cable) · conversor de nivel 74LVC8T245 · fuente de
5 V con fusible de 7 A. El circuito está en
[`firmware/hardware/hardware-cubo-led.md`](firmware/hardware/hardware-cubo-led.md) y la estructura
impresa en 3D en [`firmware/hardware/enclosure`](firmware/hardware/enclosure).

## Documentación técnica

- [App: arquitectura, modos, puntaje, luces y Spotify](app/README.md)
- [Protocolo Bluetooth entre la app y el cubo](app/docs/firmware.md)
- [Firmware: conexiones, pruebas de paneles, comandos](firmware/README.md)

## Uso de IA

El código de la app y del firmware se desarrolló con asistencia de Claude Code (Anthropic). El grupo
definió el proyecto, construyó y probó el hardware, y validó cada parte en el cubo real.
