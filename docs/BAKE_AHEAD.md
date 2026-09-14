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
PLAYBACK MUST NOT WAIT FOR ANALYSIS CPU
```

El análisis produce un artefacto derivado reproducible: el **bake**.

```text
BakeKey = analyzer_version + source_sha256 + sensitivity
```

Si la misma fuente se vuelve a cargar con la misma configuración, el mapa de eventos puede recuperarse de IndexedDB sin repetir el análisis.

## Estados

```text
IMPORT
↓
DECODING + HASHING
↓
REFERENCE READY
├── cache hit  ─→ READY · CACHE
└── cache miss ─→ BAKING IN BACKGROUND ─→ READY · BAKED
```

## Invariantes

1. El archivo fuente nunca se modifica.
2. El `AudioBuffer` usado por playback no se transfiere ni se destruye.
3. El worker recibe copias PCM independientes.
4. El mismo PCM + configuración debe producir el mismo mapa.
5. Cambiar sensibilidad genera otro `BakeKey`.
6. Un bake viejo no puede reemplazar el resultado de una generación de análisis más nueva.
7. El Gamepad loop permanece en el hilo principal y no ejecuta análisis de audio pesado.

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
→ onset event map
→ IndexedDB bake cache
→ sequential Xbox performance
```

## Siguiente evolución

El mismo carril de bake debe ampliarse sin tocar el contrato de playback:

```text
PCM COPY
↓
ONSET
↓
PITCH
↓
DURATION
↓
ARTICULATION
↓
PHRASE
↓
MusicalEvent[]
↓
BAKED SONG MAP
```

Después puede convertirse en un sistema progresivo por bloques:

```text
PLAYHEAD
██████░░░░░░░░░░░░░░
      └──── BAKE AHEAD WINDOW ────→
```

El agente analiza siempre por delante del punto de reproducción y deja preparados los bloques antes de que el músico llegue a ellos.

Ese será el paso natural para canciones completas, stems, pitch tracking y modelos más pesados.
