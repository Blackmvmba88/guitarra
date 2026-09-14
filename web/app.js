import { detectOnsets } from "./core/onset.js";
import { PickGestureDetector } from "./core/gesture.js";
import { SlicePlayer } from "./core/player.js";

const els = {
  audioFile: document.querySelector("#audioFile"),
  analyzeButton: document.querySelector("#analyzeButton"),
  resetButton: document.querySelector("#resetButton"),
  sensitivity: document.querySelector("#sensitivity"),
  sensitivityValue: document.querySelector("#sensitivityValue"),
  fileMeta: document.querySelector("#fileMeta"),
  eventCount: document.querySelector("#eventCount"),
  pickDirection: document.querySelector("#pickDirection"),
  pickIndex: document.querySelector("#pickIndex"),
  octaveValue: document.querySelector("#octaveValue"),
  positionValue: document.querySelector("#positionValue"),
  strengthValue: document.querySelector("#strengthValue"),
  latencyValue: document.querySelector("#latencyValue"),
  controllerState: document.querySelector("#controllerState"),
  statusText: document.querySelector("#statusText"),
  timeline: document.querySelector("#timeline")
};

let audioContext = null;
let player = null;
let audioBuffer = null;
let slices = [];
let currentEvent = 0;
let activeGamepadIndex = null;
let octave = 0;
let position = { label: "A", semitones: 0 };
let previousButtons = [];

const gestureDetector = new PickGestureDetector({
  deadzone: 0.15,
  trigger: 0.65,
  reset: 0.25
});

const positions = [
  { button: 0, label: "A", semitones: 0 },
  { button: 1, label: "B", semitones: 2 },
  { button: 2, label: "X", semitones: 4 },
  { button: 3, label: "Y", semitones: 7 }
];

els.sensitivity.addEventListener("input", () => {
  els.sensitivityValue.value = Number(els.sensitivity.value).toFixed(1);
});

els.audioFile.addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;

  try {
    els.statusText.textContent = "DECODING";
    await ensureAudio();
    const bytes = await file.arrayBuffer();
    audioBuffer = await audioContext.decodeAudioData(bytes.slice(0));
    player.setBuffer(audioBuffer);
    slices = [];
    currentEvent = 0;
    els.fileMeta.textContent = `${file.name} · ${audioBuffer.duration.toFixed(2)} s`;
    els.eventCount.textContent = "0 EVENTS";
    els.pickIndex.textContent = "0 / 0";
    els.analyzeButton.disabled = false;
    els.resetButton.disabled = true;
    els.statusText.textContent = "READY TO ANALYZE";
    drawTimeline();
  } catch (error) {
    console.error(error);
    els.statusText.textContent = "DECODE ERROR";
  }
});

els.analyzeButton.addEventListener("click", async () => {
  if (!audioBuffer) return;
  await ensureAudio();
  els.statusText.textContent = "ANALYZING";
  const sensitivity = Number(els.sensitivity.value);
  slices = detectOnsets(audioBuffer, sensitivity);
  currentEvent = 0;
  gestureDetector.resetState();
  els.eventCount.textContent = `${slices.length} EVENTS`;
  els.pickIndex.textContent = `0 / ${slices.length}`;
  els.resetButton.disabled = slices.length === 0;
  els.statusText.textContent = slices.length ? "READY" : "NO EVENTS";
  drawTimeline();
});

els.resetButton.addEventListener("click", () => {
  currentEvent = 0;
  gestureDetector.resetState();
  els.pickIndex.textContent = `0 / ${slices.length}`;
  els.pickDirection.textContent = "●";
  els.strengthValue.textContent = "0.00";
  els.statusText.textContent = "READY";
  drawTimeline();
});

window.addEventListener("gamepadconnected", (event) => {
  activeGamepadIndex = event.gamepad.index;
  previousButtons = [];
  updateControllerBadge(event.gamepad);
});

window.addEventListener("gamepaddisconnected", (event) => {
  if (activeGamepadIndex === event.gamepad.index) {
    activeGamepadIndex = null;
    els.controllerState.textContent = "NO CONTROLLER";
    els.controllerState.classList.remove("online");
  }
});

function pollGamepad() {
  const gamepads = navigator.getGamepads?.() ?? [];
  let gamepad = activeGamepadIndex != null ? gamepads[activeGamepadIndex] : null;

  if (!gamepad) {
    gamepad = Array.from(gamepads).find(Boolean) ?? null;
    if (gamepad) {
      activeGamepadIndex = gamepad.index;
      updateControllerBadge(gamepad);
    }
  }

  if (gamepad) {
    handleButtons(gamepad);
    const rightStickX = Number(gamepad.axes?.[2] ?? 0);
    const gesture = gestureDetector.update(rightStickX, performance.now());
    if (gesture) handlePick(gesture);
  }

  requestAnimationFrame(pollGamepad);
}

async function handlePick(gesture) {
  if (!slices.length || currentEvent >= slices.length) return;

  await ensureAudio();
  const event = slices[currentEvent];
  const semitones = octave * 12 + position.semitones;
  player.playSlice(event, { strength: gesture.strength, semitones });

  const schedulingLatency = Math.max(0, performance.now() - gesture.timestamp);
  currentEvent += 1;

  els.pickDirection.textContent = gesture.direction === "RIGHT" ? "→" : "←";
  els.pickDirection.classList.remove("hit");
  void els.pickDirection.offsetWidth;
  els.pickDirection.classList.add("hit");
  els.strengthValue.textContent = gesture.strength.toFixed(2);
  els.latencyValue.textContent = `${schedulingLatency.toFixed(1)} ms`;
  els.pickIndex.textContent = `${currentEvent} / ${slices.length}`;
  els.statusText.textContent = currentEvent >= slices.length ? "COMPLETE" : "PLAYING";
  drawTimeline();
}

function handleButtons(gamepad) {
  const pressed = gamepad.buttons.map((button) => Boolean(button.pressed));
  const edge = (index) => pressed[index] && !previousButtons[index];

  if (edge(4)) {
    octave = Math.max(-2, octave - 1);
    els.octaveValue.textContent = signed(octave);
  }

  if (edge(5)) {
    octave = Math.min(2, octave + 1);
    els.octaveValue.textContent = signed(octave);
  }

  for (const candidate of positions) {
    if (edge(candidate.button)) {
      position = candidate;
      els.positionValue.textContent = `${position.label} · ${signed(position.semitones)}`;
    }
  }

  previousButtons = pressed;
}

async function ensureAudio() {
  if (!audioContext) {
    audioContext = new AudioContext({ latencyHint: "interactive" });
    player = new SlicePlayer(audioContext);
  }
  if (audioContext.state === "suspended") await audioContext.resume();
  return audioContext;
}

function updateControllerBadge(gamepad) {
  const name = gamepad.id.length > 32 ? `${gamepad.id.slice(0, 29)}…` : gamepad.id;
  els.controllerState.textContent = name || "CONTROLLER";
  els.controllerState.classList.add("online");
}

function drawTimeline() {
  const canvas = els.timeline;
  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  ctx.clearRect(0, 0, width, height);

  ctx.fillStyle = "rgba(255,255,255,.035)";
  ctx.fillRect(0, 0, width, height);

  if (!audioBuffer) return;

  const duration = audioBuffer.duration || 1;
  ctx.strokeStyle = "rgba(255,255,255,.12)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, height * 0.72);
  ctx.lineTo(width, height * 0.72);
  ctx.stroke();

  slices.forEach((slice, index) => {
    const x = (slice.start / duration) * width;
    const nextX = (slice.end / duration) * width;
    const eventWidth = Math.max(2, nextX - x);
    const isPlayed = index < currentEvent;
    const isNext = index === currentEvent;
    ctx.fillStyle = isNext
      ? "rgba(255,255,255,.92)"
      : isPlayed
        ? "rgba(118,238,184,.48)"
        : "rgba(143,128,255,.42)";
    ctx.fillRect(x, height * 0.22, eventWidth, height * 0.5);
  });
}

function signed(value) {
  if (value > 0) return `+${value}`;
  return String(value);
}

pollGamepad();
