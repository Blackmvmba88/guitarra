# Switch → Guitarra bridge

`guitarra` does **not** read HID devices directly. The hardware boundary belongs to [`Blackmvmba88/switch`](https://github.com/Blackmvmba88/switch).

## Contract

```text
controller
  ↓
switch / BCR
  ↓
blackmamba.runtime.frame.v0
  ↓
ws://127.0.0.1:8137/live
  ↓
guitarra SwitchRuntimeClient
  ↓
PickDetector (RX / RY)
  ↓
blackmamba.guitarra.pick.v0
  ↓
MusicalEvent
```

The guitar engine consumes semantic axes (`RX`, `RY`). It must never depend on raw physical indices such as `A2`, `A3`, `B0`, etc.

## Pick gesture v0

A pick is a horizontal right-stick flick that:

1. starts from the neutral/rearmed state;
2. crosses `triggerThreshold` on `RX`;
3. stays inside the configured vertical limit;
4. emits exactly one event;
5. cannot retrigger until the stick returns near center.

Default thresholds:

```text
trigger = 0.68
reset   = 0.24
minimum interval = 35 ms
```

Output example:

```json
{
  "protocol": "blackmamba.guitarra.pick.v0",
  "type": "pick",
  "timestampMs": 12438,
  "direction": "right",
  "strength": 0.91,
  "speed": 8.42,
  "acceleration": 31.8,
  "axes": {
    "RX": 0.91,
    "RY": 0.04
  }
}
```

## Local validation

Both repositories must be present locally.

### 1. Start Switch live monitor

From the `switch` repository:

```bash
./start-live-monitor.sh
```

Expected endpoint:

```text
ws://127.0.0.1:8137/live
```

### 2. Publish the physical controller frames

Open:

```text
switch/gamepad-test/index.html
```

Connect the Xbox controller, click **Connect live monitor**, and confirm that the page is sending frames.

This step matters because the live monitor is the semantic server; `gamepad-test` is the browser Gamepad API producer that sends `browser-frame` samples into it.

`switch` must use a normalized profile that exposes semantic `RX` and `RY` for the connected controller. If the Xbox pad is new to the runtime, calibrate/import its profile in `switch`; do not hardcode physical axis indices in `guitarra`.

### 3. Install Guitarra dependencies

From the `guitarra` repository on branch `feat/switch-runtime-bridge`:

```bash
npm install
```

### 4. Run offline tests

```bash
npm test
```

### 5. Live pick diagnostic

```bash
npm run pick
```

Move the right stick left/right and return it to center after each strike.

Expected output:

```text
PICK RIGHT strength=0.91 speed=8.42
PICK LEFT  strength=0.88 speed=7.97
```

### 6. Consume a known phrase

```bash
npm run pick -- --sequence examples/phrase.json
```

Expected behavior:

```text
PICK RIGHT strength=0.91 speed=8.42 → E4
PICK LEFT  strength=0.88 speed=7.97 → G4
PICK RIGHT strength=0.93 speed=9.03 → A4
```

At this stage there is intentionally **no audio output**. The acceptance criterion is deterministic controller → semantic frame → pick → next musical event behavior.

## Acceptance gate before audio

The bridge is ready for the audio layer only when:

- one physical flick produces exactly one pick;
- neutral return reliably rearms the detector;
- no picks occur while the stick rests near center;
- left/right direction is correct;
- the example sequence advances exactly once per pick;
- the semantic stream remains stable during a short performance.

Once this gate passes, the next layer is `PickEvent → MusicalEvent → audio/MIDI/stem slice`.
