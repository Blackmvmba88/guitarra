const WebSocket = require("ws");

class SwitchRuntimeClient {
  constructor(options = {}) {
    this.url = options.url || process.env.BLACKMAMBA_SWITCH_URL || "ws://127.0.0.1:8137/live";
    this.onFrame = options.onFrame || (() => {});
    this.onHello = options.onHello || (() => {});
    this.onStatus = options.onStatus || (() => {});
    this.onError = options.onError || (() => {});
    this.socket = null;
    this.heartbeat = null;
  }

  connect() {
    if (this.socket) return this.socket;

    const socket = new WebSocket(this.url);
    this.socket = socket;

    socket.on("open", () => {
      this.onStatus({ state: "connected", url: this.url });
      this._sendHeartbeat();
      this.heartbeat = setInterval(() => this._sendHeartbeat(), 5000);
    });

    socket.on("message", (data) => {
      let message;
      try {
        message = JSON.parse(data.toString("utf8"));
      } catch (error) {
        this.onError(error);
        return;
      }

      if (message.type === "hello") {
        this.onHello(message);
        return;
      }

      if (message.type === "semantic-frame" && message.frame) {
        this.onFrame(message.frame, message);
      }
    });

    socket.on("close", () => {
      this._cleanup();
      this.onStatus({ state: "closed", url: this.url });
    });

    socket.on("error", (error) => {
      this.onError(error);
    });

    return socket;
  }

  close() {
    if (this.socket) this.socket.close();
    this._cleanup();
  }

  _sendHeartbeat() {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
    this.socket.send(JSON.stringify({
      type: "heartbeat",
      at: new Date().toISOString(),
      consumer: "blackmamba-guitarra"
    }));
  }

  _cleanup() {
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = null;
    this.socket = null;
  }
}

module.exports = { SwitchRuntimeClient };
