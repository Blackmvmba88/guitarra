import { PickGestureDetector } from "./core/gesture.js";
import { SlicePlayer } from "./core/player.js";
import {
  getBakedMap,
  hashArrayBuffer,
  makeBakeKey,
  putBakedMap
} from "./core/bake-cache.js";

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
  agentLeadValue: document.querySelector("#agentLeadValue"),
  controllerState: document.querySelector("#controllerState"),
  statusText: document.querySelector("#statusText"),
  timeline: document.querySelector("#timeline")
};

let audioContext = null;
let player = null;
let audioBuffer = null;
let sourceHash = null;
let slices = [];
let currentEvent = 0;
let activeGamepadIndex = null;
let octave = 0;
let position = { label: "A", semitones: 0 };
let previousButtons = [];
let bakeWorker = null;
let bakeGeneration = 0;
let bakedThrough = 0;
let bakeComplete = false;

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
  if (audioBuffer) els.analyzeButton.textContent = "REBAKE";
});

els.audioFile.addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;

  try {
    stopBakeWorker();
    slices = [];
    currentEvent = 0;
    sourceHash = null;
    bakedThrough = 0;
    bakeComplete = false;
    els.statusText.textContent = "DECODING + HASHING";
    els.eventCount.textContent = "0 EVENTS";
    els.pickIndex.textContent = "0 / 0";
    els.resetButton.disabled = true;
    updateAgentLead();

    await ensureAudio();
    const bytes = await file.arrayBuffer();

    const [hash, decoded] = await Promise.all([
      hashArrayBuffer(bytes),
      audioContext.decodeAudioData(bytes.slice(0))
    ]);

    sourceHash = hash;
    audioBuffer = decoded;
    player.setBuffer(audioBuffer);

    els.fileMeta.textContent = `${file.name} · ${audioBuffer.duration.toFixed(2)} s`;
    els.analyzeButton.disabled = false;
    els.analyzeButton.textContent = "REBAKE";
    els.statusText.textContent = "REFERENCE READY · BAKING";
    drawTimeline();

    void startBake({ preferCache: true });
  } catch (error) {
    console.error(error);
    els.statusText.textContent = "DECODE ERROR";
  }
});

els.analyzeButton.addEventListener("click", () => {
  void startBake({ preferCache: false });
});

els.resetButton.addEventListener("click", () => {
  currentEvent = 0;
  gestureDetector.resetState();
  els.pickIndex.textContent = `0 / ${slices.length}`;
  els.pickDirection.textContent = "●";
  els.strengthValue.textContent = "0.00";
  els.statusText.textContent = slices.length
    ? bakeComplete
      ? "READY · FULLY BAKED"
      : `READY · ${bakedThrough.toFixed(1)} s BAKED`
    : "NO EVENTS";
  updateAgentLead();
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

async function startBake({ preferCache }) {
  if (!audioBuffer || !sourceHash) return;

  const generation = ++bakeGeneration;
  stopBakeWorker();
  slices = [];
  currentEvent = 0;
  bakedThrough = 0;
  bakeComplete = false;
  gestureDetector.resetState();
  els.pickIndex.textContent = "0 / 0";
  els.resetButton.disabled = true;
  updateAgentLead();

  const sensitivity = Number(els.sensitivity.value);
  const bakeKey = makeBakeKey(sourceHash, sensitivity);

  if (preferCache) {
    els.statusText.textContent = "CHECKING BAKE";
    try {
      const cached = await getBakedMap(bakeKey);
      if (generation !== bakeGeneration) return;
      if (cached?.slices?.length) {
        applyFinalMap(cached.slices, "CACHE");
        return;
      }
    } catch (error) {
      console.warn("Bake cache unavailable", error);
    }
  }

  els.statusText.textContent = "BAKING AHEAD";
  els.eventCount.textContent = "AGENT STARTING…";

  const channels = [];
  for (let channel = 0; channel < audioBuffer.numberOfChannels; channel += 1) {
    channels.push(audioBuffer.getChannelData(channel).slice().buffer);
  }

  bakeWorker = new Worker("./workers/bake-worker.js", { type: "module" });

  bakeWorker.onmessage = async (event) => {
    const message = event.data;
    if (!message || message.generation !== bakeGeneration) return;

    if (message.type === "ERROR") {
      els.statusText.textContent = `BAKE ERROR · ${message.error}`;
      stopBakeWorker();
      return;
    }

    if (message.type === "BAKE_PROGRESS") {
      applyProgressMap(message);
      return;
    }

    if (message.type !== "BAKED") return;

    applyFinalMap(message.slices, `BAKED ${message.elapsedMs.toFixed(0)} ms`, {
      preservePosition: true
    });
    stopBakeWorker();

    try {
      await putBakedMap(bakeKey, {
        sourceHash,
        sensitivity,
        slices: message.slices,
        duration: audioBuffer.duration
      });
    } catch (error) {
      console.warn("Could not persist bake cache", error);
    }
  };

  bakeWorker.onerror = (error) => {
    console.error(error);
    if (generation === bakeGeneration) els.statusText.textContent = "BAKE WORKER ERROR";
    stopBakeWorker();
  };

  bakeWorker.postMessage(
    {
      type: "BAKE",
      generation,
      sourceHash,
      sensitivity,
      sampleRate: audioBuffer.sampleRate,
      duration: audioBuffer.duration,
      windowSeconds: 12,
      overlapSeconds: 0.35,
      channels
    },
    channels
  );
}

function applyProgressMap(message) {
  const wasWaiting = currentEvent >= slices.length;
  slices = message.slices;
  bakedThrough = message.bakedThrough;
  bakeComplete = false;
  currentEvent = Math.min(currentEvent, slices.length);

  const percent = Math.min(100, Math.max(0, Math.round(message.progress * 100)));
  els.eventCount.textContent = `${slices.length} READY · ${bakedThrough.toFixed(1)} s · ${percent}%`;
  els.pickIndex.textContent = `${currentEvent} / ${slices.length}`;
  els.resetButton.disabled = slices.length === 0;

  if (slices.length === 0) {
    els.statusText.textContent = `BAKING AHEAD · ${percent}%`;
  } else if (wasWaiting && currentEvent < slices.length) {
    els.statusText.textContent = `AGENT AHEAD · ${bakedThrough.toFixed(1)} s READY`;
  } else if (currentEvent >= slices.length) {
    els.statusText.textContent = `WAITING FOR BAKE · ${percent}%`;
  } else {
    els.statusText.textContent = `PLAYABLE · AGENT ${percent}%`;
  }

  updateAgentLead();
  drawTimeline();
}

function applyFinalMap(nextSlices, source, { preservePosition = false } = {}) {
  const previousIndex = preservePosition ? currentEvent : 0;
  slices = nextSlices;
  currentEvent = Math.min(previousIndex, slices.length);
  bakedThrough = audioBuffer?.duration ?? 0;
  bakeComplete = true;
  if (!preservePosition) gestureDetector.resetState();
  els.eventCount.textContent = `${slices.length} EVENTS · ${source}`;
  els.pickIndex.textContent = `${currentEvent} / ${slices.length}`;
  els.resetButton.disabled = slices.length === 0;
  els.statusText.textContent = slices.length
    ? currentEvent >= slices.length
      ? "COMPLETE · FULLY BAKED"
      : `READY · ${source}`
    : "NO EVENTS";
  updateAgentLead();
  drawTimeline();
}

function stopBakeWorker() {
  if (!bakeWorker) return;
  bakeWorker.terminate();
  bakeWorker = null;
}

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
  if (!slices.length || currentEvent >= slices.length) {
    els.statusText.textContent = bakeComplete
      ? "COMPLETE"
      : `WAITING FOR BAKE · ${bakedThrough.toFixed(1)} s READY`;
    updateAgentLead();
    return;
  }

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

  if (currentEvent >= slices.length) {
    els.statusText.textContent = bakeComplete ? "COMPLETE" : "CAUGHT AGENT · BAKING AHEAD";
  } else {
    els.statusText.textContent = bakeComplete
      ? "PLAYING · FULLY BAKED"
      : `PLAYING · ${bakedThrough.toFixed(1)} s READY`;
  }

  updateAgentLead();
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

function updateAgentLead() {
  if (!els.agentLeadValue) return;
  if (bakeComplete && audioBuffer) {
    els.agentLeadValue.textContent = "FULL";
    return;
  }

  const nextTimelineTime = currentEvent < slices.length
    ? slices[currentEvent].start
    : slices.length
      ? slices[slices.length - 1].end
      : 0;
  const leadSeconds = Math.max(0, bakedThrough - nextTimelineTime);
  els.agentLeadValue.textContent = `${leadSeconds.toFixed(1)} s`;
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
  const bakedWidth = Math.min(width, (bakedThrough / duration) * width);
  if (bakedWidth > 0) {
    ctx.fillStyle = "rgba(118,238,184,.055)";
    ctx.fillRect(0, 0, bakedWidth, height);
    if (!bakeComplete) {
      ctx.strokeStyle = "rgba(118,238,184,.7)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(bakedWidth, 0);
      ctx.lineTo(bakedWidth, height);
      ctx.stroke();
    }
  }

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
