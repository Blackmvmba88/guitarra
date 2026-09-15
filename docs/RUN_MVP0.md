# BLACKMAMBA PICK — MVP 0 Runbook

## Objetivo

Validar físicamente el loop mínimo:

```text
AUDIO → ONSETS → EVENTS → RIGHT STICK → SLICE PLAYBACK
```

La pregunta de esta prueba es una sola:

> ¿Mover el stick se siente como atacar una punteada?

## Requisitos

- macOS / Windows / Linux con navegador moderno.
- Control Xbox visible para el sistema.
- Python 3 para servir archivos estáticos.
- Una canción o fragmento WAV/MP3 con punteada clara.

No hay dependencias npm para ejecutar el prototipo.

## Arranque

Desde la raíz del repositorio:

```bash
npm run serve
```

Equivalente:

```bash
python3 -m http.server 8080 -d web
```

Abrir:

```text
http://localhost:8080
```

## Secuencia de prueba

1. Conecta el control Xbox.
2. Presiona un botón si el navegador todavía no lo expone.
3. En `IMPORT`, carga un WAV o MP3.
4. En `ANALYZE`, comienza con sensibilidad `1.6`.
5. Pulsa `ANALYZE`.
6. Confirma que `EVENTS` muestre ataques detectados.
7. Mueve el stick derecho alternativamente izquierda/derecha.
8. Cada excursión completa debe consumir exactamente un evento.
9. `LB/RB` cambia octava.
10. `A/B/X/Y` cambia la posición experimental.
11. `RESET` regresa al primer evento.

## Mapeo MVP 0

```text
RIGHT STICK LEFT/RIGHT = PICK
LB                     = OCTAVE -1
RB                     = OCTAVE +1
A                      = POSITION 0
B                      = POSITION +2 semitones
X                      = POSITION +4 semitones
Y                      = POSITION +7 semitones
```

La transposición de este MVP usa `playbackRate`. Es intencionalmente simple y **no** es todavía el motor final de pitch-preserving resynthesis.

## Detector de gesto

Valores iniciales:

```text
deadzone          = 0.15
trigger threshold = 0.65
reset threshold   = 0.25
```

Invariante obligatorio:

```text
1 excursion = maximum 1 note trigger
```

El sistema no se rearma hasta que el stick vuelve por debajo del umbral de reset.

## Detector de ataques

El prototipo calcula energía RMS por ventanas, obtiene novedad positiva y aplica un umbral adaptativo local.

Parámetros actuales:

```text
frame = 1024 samples
hop   = 512 samples
minimum event gap ≈ 55 ms
```

La sensibilidad de la interfaz modifica el multiplicador del umbral adaptativo.

## Latencia mostrada

`LATENCY` en esta versión mide aproximadamente:

```text
controller gesture detection → audio scheduling
```

No debe interpretarse todavía como latencia acústica end-to-end. La certificación posterior deberá medir además buffer, dispositivo y salida real.

## Criterios PASS

La prueba pasa si:

- no existen dobles disparos al mantener el stick fuera del centro;
- izquierda y derecha disparan de forma consistente;
- la secuencia conserva orden determinista;
- el control se siente inmediato;
- los cortes representan razonablemente los ataques de la frase;
- después de varios golpes aparece sensación de interpretación y no de simple reproducción.

## Criterios FAIL

Registrar si ocurre cualquiera:

- false trigger;
- missed gesture;
- evento duplicado;
- salto de evento;
- latencia perceptible;
- demasiados/faltantes ataques;
- corte audible desagradable;
- control que no se siente musical.

## Después de validar

El siguiente incremento será:

```text
ONSET
+
PITCH TRACKING
+
MUSICAL EVENT
+
ORIGINAL SLICE
```

Después podremos separar claramente:

```text
Musical Layer
Gameplay Layer
```

sin cambiar el contrato físico que se valida en este MVP.
