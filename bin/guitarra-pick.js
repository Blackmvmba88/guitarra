#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const { PickDetector } = require("../src/pick-detector");
const { SwitchRuntimeClient } = require("../src/switch-runtime-client");

function argValue(name, fallback = "") {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function loadSequence(file) {
  if (!file) return [];
  const resolved = path.resolve(file);
  const data = JSON.parse(fs.readFileSync(resolved, "utf8"));
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.events)) return data.events;
  throw new Error("Sequence must be an array or an object with events[]");
}

const url = argValue("--url", process.env.BLACKMAMBA_SWITCH_URL || "ws://127.0.0.1:8137/live");
const sequencePath = argValue("--sequence", "");
const jsonOutput = hasFlag("--json");
const sequence = loadSequence(sequencePath);
let cursor = 0;

const detector = new PickDetector({
  triggerThreshold: Number(argValue("--trigger", "0.68")),
  resetThreshold: Number(argValue("--reset", "0.24")),
  minIntervalMs: Number(argValue("--min-interval", "35"))
});

function emitPick(pick) {
  const musicalEvent = sequence.length ? sequence[cursor % sequence.length] : null;
  if (musicalEvent) cursor += 1;

  const output = {
    ...pick,
    musicalEvent,
    sequenceIndex: musicalEvent ? cursor - 1 : null
  };

  if (jsonOutput) {
    console.log(JSON.stringify(output));
    return;
  }

  const note = musicalEvent?.note || musicalEvent?.pitch?.note || "—";
  const label = musicalEvent ? ` → ${note}` : "";
  console.log(
    `PICK ${pick.direction.toUpperCase().padEnd(5)} strength=${pick.strength.toFixed(2)} speed=${pick.speed.toFixed(2)}${label}`
  );
}

const client = new SwitchRuntimeClient({
  url,
  onStatus(status) {
    if (!jsonOutput) console.log(`[switch] ${status.state}: ${status.url}`);
  },
  onHello(message) {
    if (!jsonOutput) {
      console.log(`[switch] protocol=${message.protocol} device=${message.profile?.name || message.profile?.id || "semantic-device"}`);
      console.log("[guitarra] mueve el stick derecho izquierda/derecha y vuelve al centro entre golpes");
    }
  },
  onFrame(frame) {
    const pick = detector.push(frame);
    if (pick) emitPick(pick);
  },
  onError(error) {
    console.error(`[guitarra] ${error.message}`);
  }
});

client.connect();

process.on("SIGINT", () => {
  client.close();
  process.exit(0);
});
