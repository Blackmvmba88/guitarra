# BLACKMAMBA PICK — BAKE AHEAD

## Idea

La reproducción y el análisis no deben competir por el mismo hilo ni obligar al músico a esperar a que termine el procesamiento completo.

```text
SOURCE FILE
    │
    ├── REFERENCE LANE ──→ AudioBuffer ──→ PLAY / LISTEN / SLICE OUTPUT
    │
    └── BAKE LANE ───────→ PCM COPY ─────→ Web Worker ─→ EVENT MAP ─→ CACHE
```

El `AudioBuffer` de referencia permanece disponible para reproducción. El worker recibe copias transferibles de los canales PCM y realiza el análisis fuera del hilo principal.

## Principio

```text
PLAYBACK MUST NOT WAIT FOR FULL-SONG ANALYSIS
```

El análisis produce un artefacto derivado reproducible: el **bake**.

```text
BakeKey = analyzer_version + source_sha256 + sensitivity
```

Si la misma fuente se vuelve a cargar con la misma configuración, el mapa final puede recuperarse de IndexedDB sin repetir el análisis.

## Arquitectura progresiva actual

El agente ya no espera a terminar la canción completa para publicar resultados.

```text
REFERENCE AUDIO ───────────────────────────────→ PLAY
        │
        └── PCM COPY → WORKER
                         │
                         ├── window 0 → safe events → UI
                         ├── window 1 → safe events → UI
                         ├── window 2 → safe events → UI
                         └── final map → CACHE
```

Parámetros MVP:

```text
ownership window = 12.00 s
context overlap  =  0.35 s por lado
```

Cada ventana tiene dos regiones conceptuales:

```text
CONTEXT START      OWNED REGION       CONTEXT END
      ├──────────────┼────────────────────┤
      context only   events belong here   context only
```

El solapamiento permite que el detector vea suficiente audio alrededor de una frontera. Sólo la región propietaria puede aportar eventos a ese bloque.

## Ejemplo

```text
WINDOW 0
context:  0.00 → 12.35
owns:     0.00 → 12.00

WINDOW 1
context: 11.65 → 24.35
owns:    12.00 → 24.00
```

Un ataque en `11.95 s` pertenece a `WINDOW 0`.

Un ataque en `12.02 s` puede ser observado por ambas ventanas gracias al contexto, pero sólo `WINDOW 1` tiene derecho a publicarlo.

Esto evita dobles eventos en fronteras.

## Safe events

Mientras el bake continúa, el último onset conocido puede no conocer todavía dónde empieza el siguiente evento.

Por eso el worker publica sólo eventos **seguros**.

```text
known onsets:   A  B  C  D
safe events:    A  B  C
provisional:             D
```

Cuando aparece el siguiente onset, `D` adquiere un final estable y se vuelve reproducible.

Al terminar la canción todos los eventos son seguros.

## Estados

```text
IMPORT
↓
DECODING + HASHING
↓
REFERENCE READY
├── cache hit  ─→ READY · CACHE
└── cache miss ─→ BAKING AHEAD
                    ↓
                 PLAYABLE
                    ↓
             AGENT KEEPS BAKING
                    ↓
              FULLY BAKED
                    ↓
                  CACHE
```

El jugador puede empezar en `PLAYABLE`; no necesita esperar `FULLY BAKED`.

## Si el jugador alcanza al agente

No se inventan eventos y no se dispara un slice provisional.

```text
PLAYER INDEX == READY EVENTS
        ↓
WAITING FOR BAKE
        ↓
worker publishes next safe block
        ↓
PLAYABLE AGAIN
```

Con analizadores ligeros el agente normalmente terminará la canción mucho antes de que el intérprete lo alcance. La regla existe para soportar etapas futuras más pesadas.

## Invariantes

1. El archivo fuente nunca se modifica.
2. El `AudioBuffer` usado por playback no se transfiere ni se destruye.
3. El worker recibe copias PCM independientes.
4. Misma fuente + versión + configuración produce un bake determinista.
5. Cambiar sensibilidad genera otro `BakeKey`.
6. Un bake viejo no puede reemplazar una generación nueva.
7. El Gamepad loop no ejecuta análisis pesado.
8. Una frontera de ventana no puede duplicar un MusicalEvent.
9. Un evento provisional no puede consumirse como evento seguro.
10. El mapa final es el único artefacto persistido como bake completo.

## Concurrencia

Cada análisis tiene un `generation` monotónico.

```text
generation N     worker running
user rebakes
      ↓
generation N+1
      ↓
worker N terminated / ignored
```

Esto evita condiciones de carrera cuando el usuario cambia archivo o configuración durante un análisis.

## Estado actual

MVP0 implementa:

```text
source audio
→ SHA-256
→ AudioBuffer reference
→ copied channel PCM
→ module Web Worker
→ progressive 12 s windows
→ 350 ms context overlap
→ onset ownership reconciliation
→ safe event publication
→ playable-before-complete
→ final event map
→ IndexedDB bake cache
→ sequential Xbox performance
```

## Escalado del agente

El mismo carril puede incorporar analizadores sin tocar el contrato de playback:

```text
PCM WINDOW
↓
ONSET
↓
PITCH
↓
DURATION
↓
ARTICULATION
↓
BEND / VIBRATO
↓
PHRASE
↓
MusicalEvent[]
↓
BAKED SONG MAP
```

La regla permanece:

> **No analices lo que el músico necesita ahora. Déjalo horneado antes de que llegue ahí.**
