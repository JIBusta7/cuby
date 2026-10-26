# CUBY

Webapp de escritorio que convierte el **Magic Cube** (ESP32 + MPU6050 + 293 LEDs WS2812B en 6 caras)
en un juego: el jugador gira el cubo físico para igualar colores, contra reloj o buscando la máxima
precisión, con cuenta regresiva sincronizada entre la pantalla y los LEDs, y rankings por modo.

Además del juego, el modo **LUCES** convierte el cubo en lámpara y visualizador: 11 efectos de demo,
reacción al sonido (micrófono o audio de una pestaña) y a la música de Spotify.

Funciona completa con un **cubo simulado**; con el cubo real se conecta por **Web Bluetooth**.

## Cómo correrla

Requisitos: Node 20 o superior, y Chrome o Edge de escritorio (Web Bluetooth no existe en Safari ni Firefox).

```
npm install
npm run dev          # http://127.0.0.1:5173  (Spotify exige 127.0.0.1, no localhost)
```

- **Simulador**: se conecta solo al abrir. Arrastrá el cubo 3D o usá las flechas; `R` lo vuelve a apoyar.
- **Cubo real**: Ajustes → Cubo real → Conectar, y elegí `CUBY` en el selector del navegador (con el firmware anterior aparece como `CuboRGB`).
  Requiere el firmware del proyecto `Magic Cube` (ver [docs/firmware.md](docs/firmware.md)). Con el
  firmware original el juego funciona igual, pero el cubo no muestra animaciones ni Physical Target.
- Referencia visual 1440 × 900: la composición se escala para llenar cualquier ventana sin scroll.

```
npm test             # 89 pruebas unitarias (color, audio, paleta, protocolo, juego, ranking, Spotify, enlace)
npm run test:e2e     # 8 pruebas de punta a punta en el simulador (juego y modo luces)
                     # con Chrome instalado: PW_CHANNEL=chrome npm run test:e2e
npm run parity       # firmware ↔ web: compila anim.cpp y compara 31 644 píxeles (juego y 16 efectos)
npm run build        # chequeo de tipos estricto + build de producción
npm run firmware:bundle  # copia el último firmware compilado a la app (para instalarlo por Bluetooth)
```

## Modos de juego

| Modo | Mecánica | Gana | Límite |
|---|---|---|---|
| **Precision Challenge** | Igualar el color y confirmar con `SPACE` (o un toque en el cubo) | Mayor precisión; desempata el tiempo | 45 s; al agotarse se toma el último color |
| **Timed Match** | Llegar al 95 % y sostenerlo 500 ms | Menor tiempo | 60 s; si no, derrota |
| **Physical Target** | El objetivo se muestra **solo en la cara de arriba del cubo**; las otras cinco muestran tu color | Menor tiempo | 60 s |
| **Speed Challenge** Easy / Medium / Hard | 3 / 5 / 10 colores seguidos; al 90 % sostenido 300 ms pasa solo al siguiente | Menor tiempo total | 60 / 100 / 180 s |

Los umbrales se cambian en Ajustes → Reglas. Cada puntaje guarda las reglas con que se jugó y el
ranking marca los que se jugaron con otras.

## Modo LUCES

| Pestaña | Qué hace |
|---|---|
| **Demo** | 11 efectos que corren en el ESP32: Arcoíris, Plasma, Fuego, Estrellas, Respiración, Ondas, Espiral, Lluvia, Cometas, Fiesta y Gravedad (el color sigue a la cara de arriba: hay que girar el cubo). 6 paletas. En automático cambia cada 12 s. |
| **Sonido** | Escucha el **micrófono** o el **audio de una pestaña** (Chrome pide elegirla y tildar "Compartir audio"). 7 bandas de frecuencia y detección del **bombo** (ataque en 40–140 Hz; ignora hi-hats, voces y bajos sostenidos) con BPM. En cada bombo el cubo salta al color siguiente de la paleta y el brillo sigue a los graves. Efectos: Bombo, Explosión, Pulso, Anillos y Espectro. |
| **Música** | Se conecta a **Spotify**: la canción que suena en tu cuenta (en cualquier dispositivo) pone los colores, sacados de la tapa del disco, y cada tema elige su efecto. Con audio activado, el cubo late al beat. |

**Spotify, en concreto.** Desde fines de 2024 la API de Spotify no entrega a las apps nuevas el
análisis de audio (beats, tempo, energía). Por eso los colores salen de la tapa del disco y el beat del
audio real, por micrófono o capturando la pestaña de Spotify Web. Para conectar:
1. Crear una app gratis en developer.spotify.com/dashboard (Web API).
2. Agregar como Redirect URI exactamente `http://127.0.0.1:5173/`.
3. Pegar el Client ID en LUCES → Música. El login es PKCE: sin servidor y sin secretos.

**Cómo llega al cubo.** Los efectos los dibuja el ESP32. La web manda solo el efecto (`SHOW`), la paleta
(`PAL`) y ~30 cuadros de audio por segundo de 17 bytes (`A` + 7 bandas + beat). Cada cuadro entra en una
escritura BLE mínima y, si el enlace está ocupado, se descarta: siempre gana el más nuevo. El análisis
lo marca el propio motor de audio, así sigue andando con la pestaña en segundo plano (por ejemplo
mientras usás Spotify Web en otra pestaña).

## Actualizar el firmware por Bluetooth

Desde el firmware v3 el cubo se actualiza sin cable: **Ajustes → Firmware del cubo → Instalar**.
- La app trae empaquetada la última versión compilada. Para empaquetar una nueva: compilar en el
  carpeta `firmware/` (`pio run -e esp32dev`) y correr `npm run firmware:bundle`. También se puede
  elegir cualquier `.bin` de PlatformIO.
- El cubo escribe el firmware nuevo en el espacio de programa que no está usando, verifica el MD5 y la
  imagen, y recién ahí se reinicia con la versión nueva. Si se corta el Bluetooth o el archivo llega
  mal, sigue con el firmware anterior.
- Tarda entre 1 y varios minutos según el Bluetooth de la computadora. Durante la carga, los LEDs
  muestran una barra de progreso azul.
- **Requisito:** la primera vez hace falta cargar por USB el firmware v3, que cambia la tabla de
  particiones (`min_spiffs.csv`: dos espacios de 1,9 MB). Con el firmware v2 o anterior no hay forma
  de actualizar por Bluetooth. La calibración y el mapa de caras se conservan.
- Cualquiera que se conecte al cubo por Bluetooth puede actualizarlo: no dejarlo conectable en lugares
  públicos sin supervisión.

## Lo que el hardware permite (y lo que la app no inventa)

- **Orientación.** El MPU6050 tiene acelerómetro y giroscopio, sin magnetómetro. La gravedad da la
  inclinación, pero no el giro horizontal absoluto (el yaw del firmware sale de integrar el giroscopio
  y deriva). Por eso, con el cubo real, el modelo 3D muestra la inclinación con la rotación mínima, sin
  yaw. El color del cubo depende solo de la gravedad, así que el juego no pierde nada.
- **Colores alcanzables.** En el modo de color 0 (SIGNED) del firmware, cada eje de la gravedad
  (−1…1) da un canal (0…255): los colores posibles son la superficie de una esfera dentro del cubo
  RGB. Los objetivos no se sortean como RGB: se sortea una orientación y se pasa por la misma función
  del firmware. Todo objetivo es alcanzable al 100 %.
- **Inclinación máxima.** La cara 6 es la inferior y por ahí sale el cable de alimentación. Los
  objetivos nunca piden inclinar el cubo más de 110° desde el reposo (`maxTiltDeg`).
- **293 LEDs.** Seis caras de 7 × 7; la cara 6 no tiene LED en el centro (fila 4), por el cable.
  El cubo 3D dibuja ese agujero.
- **Color en pantalla y LEDs.** Pantalla y LEDs son fuentes de luz distintas. Por eso el objetivo y
  tu color se comparan en el mismo monitor, uno al lado del otro, sobre fondo oscuro neutro. La
  precisión compara los valores RGB, no es una medición colorimétrica de los LEDs.

## Precisión y puntaje

```
ΔE       = distancia euclídea en OKLab entre el color del cubo y el objetivo
accuracy = 100 · max(0, 1 − max(0, ΔE − 0,005) / 0,35)
```

- 100 % con valores iguales; la tolerancia de 0,005 absorbe el ruido del sensor y el redondeo a 8 bits.
- Lineal en ΔE, determinista, sin saltos. 95 % equivale a ΔE ≈ 0,0225, unos 5° de error de inclinación.
- El rango se calibró midiendo el espacio de colores real del cubo: un objetivo típico arranca cerca
  del 14 %.
- Puntos: Precision = precisión × 100 (97,32 % → 9732). Modos por tiempo = 10 000 × (1 − tiempo /
  límite). Los puntos nunca contradicen el orden del ranking.
- Solo entran al ranking las partidas ganadas o capturadas. Tiempo agotado (en modos por tiempo),
  desconexión o pérdida de señal anulan el intento.

## Arquitectura

```
src/
├── core/                    lógica pura, sin React ni Bluetooth (todo con pruebas)
│   ├── color/               port exacto de color_map.cpp y hsv2rgb_rainbow, OKLab, precisión, objetivos
│   ├── protocol/            UUID del firmware, comandos, parser de mensajes, reensamblado de líneas BLE
│   ├── orientation/         marcos sensor ↔ Three.js, cuaterniones, caras y cara de arriba, calibración
│   ├── leds/                espejo de las animaciones y los 14 efectos del ESP32 (idéntico a anim.cpp)
│   ├── audio/               bandas, ganancia automática, beat y BPM (con tests de señales sintéticas)
│   ├── game/                modos, reglas, máquina de estados de la partida, puntaje, cuenta regresiva
│   └── leaderboard/         interfaz de repositorio + implementación en localStorage
├── audio/                   AudioEngine: micrófono o captura de pestaña → analizador
├── spotify/                 login PKCE, canción actual, píxeles de la tapa
├── transport/               CubeTransport: RealCubeTransport (Web Bluetooth) y MockCubeTransport
│   └── cubeLink.ts          handshake, capacidades del firmware, espejo de LEDs, datos viejos
├── store/                   Zustand: navegación, cubo, partida, ajustes, ranking, luces
└── ui/                      pantallas, componentes, cubo 3D (React Three Fiber + shader de LEDs)
```

- **Máquinas de estados explícitas.** La partida (`core/game/session.ts`) es una función pura
  `(estado, evento) → estado`: cuenta regresiva → jugando → terminada, con eventos de reloj, muestra,
  captura y aborto. La navegación (`store/appStore.ts`) solo permite las transiciones de una tabla.
- **Transporte intercambiable.** El juego no sabe si del otro lado hay un ESP32 o el simulador. El
  simulador reproduce el firmware: misma calibración, mismo filtro de gravedad y mismos paquetes JSON,
  que pasan por el mismo parser.
- **Capacidades.** Al conectar, la app pregunta `INFO`. Solo usa lo que el firmware declara: con el
  firmware original no manda animaciones y deshabilita Physical Target, en vez de fallar.
- **Cuenta regresiva sincronizada.** La app manda `ANIM COUNT` con escritura con respuesta y arranca su
  cuenta cuando el cubo confirma. El ESP32 corre 3-2-1-GO localmente con los mismos tiempos
  (`core/game/timing.ts` = `anim.h`). El desfase es la latencia de un paquete BLE y no se acumula.
- **Espejo de LEDs.** El cubo 3D dibuja los 6 × 7 × 7 píxeles con el mismo modelo que el ESP32. Con
  el cubo real muestra lo que el cubo está mostrando; `npm run parity` verifica que coincidan.
- **Ranking.** `LeaderboardRepository` es asíncrona. Para rankings compartidos alcanza con una
  implementación nueva (por ejemplo Supabase) en `store/leaderboardStore.ts`. Las partidas simuladas
  se marcan `sim`.

Stack: React 19, TypeScript estricto, Vite 7, Tailwind 4, Motion, Three.js + React Three Fiber,
Zustand, Vitest, Playwright. Sin otras dependencias.

## Accesibilidad

Todo se juega con teclado: `Enter` confirma, `Esc` vuelve, flechas para elegir modo, para cambiar de
ranking y para girar el cubo simulado, y `SPACE` para confirmar el color. El foco es visible. Ajustes
→ Accesibilidad reduce las animaciones: respeta la preferencia del sistema por defecto, apaga el
confeti y el giro de presentación.

## Pendiente

- **Probar con el cubo real.** El firmware v2 compila y su dibujo coincide píxel a píxel con la web,
  pero la conexión Web Bluetooth todavía no se probó con el ESP32.
- **Identificar caras en el cubo real.** Physical Target necesita saber qué eje del sensor apunta a
  cada cara (Ajustes → Identificar caras). Hasta hacerlo, el modo queda deshabilitado con el cubo real.
- Versión móvil: la arquitectura la permite (núcleo y transporte sin UI), pero no está hecha.
