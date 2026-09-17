import { performance } from "node:perf_hooks";

let socket;
let nextId = 1;
const pending = new Map();
const startBinding = `__FLOW_SCREENCAST_START_${process.pid}`;
const heartbeatKey = `__FLOW_SCREENCAST_HEARTBEAT_${process.pid}`;
let rendererOffsetMs = 0;
let rendererTimeOriginMs = 0;
let armed;
let completionTimer;
let completing = false;

function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
}

function reportError(error) {
  process.send?.({ type: "error", message: error instanceof Error ? error.message : String(error) });
}

async function connect({ port, targetId }) {
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const target = targets.find((candidate) => candidate.id === targetId);
  if (!target?.webSocketDebuggerUrl) throw new Error(`Chrome target ${targetId} is unavailable on port ${port}`);
  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", () => reject(new Error("Could not open the compositor CDP socket")), { once: true });
  });
  socket.addEventListener("message", ({ data }) => {
    const message = JSON.parse(String(data));
    if (!message.id) {
      if (message.method === "Runtime.bindingCalled" && message.params?.name === startBinding && armed && armed.startedAt === undefined) {
        armed.startedAt = Number(message.params.payload);
      } else if (message.method === "Page.screencastFrame") {
        void onScreencastFrame(message.params).catch(reportError);
      }
      return;
    }
    const request = pending.get(message.id);
    if (!request) return;
    pending.delete(message.id);
    if (message.error) request.reject(new Error(message.error.message));
    else request.resolve(message.result);
  });
  await send("Page.enable");
  await send("Runtime.addBinding", { name: startBinding });
  const before = performance.now();
  const result = await send("Runtime.evaluate", {
    expression: "({ now: performance.now(), timeOrigin: performance.timeOrigin })",
    returnByValue: true,
  });
  const after = performance.now();
  rendererOffsetMs = Number(result.result.value.now) - (before + after) / 2;
  rendererTimeOriginMs = Number(result.result.value.timeOrigin);
  return { uncertaintyMs: (after - before) / 2, rendererTimeOriginMs };
}

function selectFrames() {
  if (!armed || armed.startedAt === undefined) return [];
  const used = new Set();
  return armed.checkpoints.map(({ checkpoint, offsetMs, toleranceMs }) => {
    const target = armed.startedAt + offsetMs;
    const frame = armed.frames
      .filter((candidate) => !used.has(candidate.captureNativeMs) && Math.abs(candidate.captureNativeMs - target) <= toleranceMs)
      .sort((left, right) => Math.abs(left.captureNativeMs - target) - Math.abs(right.captureNativeMs - target))[0];
    if (!frame) return undefined;
    used.add(frame.captureNativeMs);
    return { ...frame, checkpoint };
  });
}

async function takeAudits() {
  const result = await send("Runtime.evaluate", {
    expression: `window[${JSON.stringify(heartbeatKey)}]?.take?.() ?? []`,
    returnByValue: true,
  });
  return result.result.value ?? [];
}

async function cleanupCapture() {
  clearTimeout(completionTimer);
  completionTimer = undefined;
  await send("Page.stopScreencast").catch(() => undefined);
  await send("Runtime.evaluate", {
    expression: `window[${JSON.stringify(heartbeatKey)}]?.stop?.(); delete window[${JSON.stringify(heartbeatKey)}]`,
  }).catch(() => undefined);
}

async function finishCapture() {
  if (!armed || completing) return;
  completing = true;
  const current = armed;
  try {
    const selected = selectFrames();
    if (selected.length !== current.checkpoints.length || selected.some((frame) => !frame)) {
      const observed = current.frames.map(({ captureNativeMs }) => Math.round((captureNativeMs - (current.startedAt ?? 0)) * 10) / 10);
      throw new Error(`metadata-timestamped screencast coverage missing; observed elapsed frames [${observed.join(", ")}]`);
    }
    const states = await takeAudits();
    await cleanupCapture();
    armed = undefined;
    process.send?.({
      type: "captured",
      startedAt: current.startedAt,
      frames: selected,
      states,
      rawFrameCount: current.frames.length,
      rendererTimeOriginMs,
    });
  } catch (error) {
    await cleanupCapture();
    armed = undefined;
    reportError(error);
  } finally {
    completing = false;
  }
}

async function onScreencastFrame(params) {
  // Ack immediately. Callback arrival may be arbitrarily late under host load;
  // acceptance uses only Chrome's compositor metadata timestamp.
  void send("Page.screencastFrameAck", { sessionId: params.sessionId }).catch(reportError);
  if (!armed || !Number.isFinite(params.metadata?.timestamp)) return;
  const captureNativeMs = Number(params.metadata.timestamp) * 1_000 - rendererTimeOriginMs;
  const receivedNativeMs = performance.now() + rendererOffsetMs;
  armed.frames.push({
    data: params.data,
    metadataTimestamp: Number(params.metadata.timestamp),
    captureNativeMs,
    receivedNativeMs,
    arrivalLagMs: receivedNativeMs - captureNativeMs,
    sessionId: params.sessionId,
    metadata: params.metadata,
  });
  if (armed.startedAt === undefined) return;
  const last = armed.checkpoints.at(-1);
  if (!last) return;
  const crossedLastWindow = captureNativeMs >= armed.startedAt + last.offsetMs + last.toleranceMs;
  if (crossedLastWindow) await finishCapture();
}

async function armCapture(message) {
  if (armed) throw new Error("Screencast capture is already armed");
  armed = { ...message, startedAt: undefined, frames: [] };
  const screencastOptions = {
    format: "png",
    everyNthFrame: 1,
    maxWidth: message.viewport?.width,
    maxHeight: message.viewport?.height,
  };
  await send("Page.startScreencast", screencastOptions);
  // This 4px test-only marker has both a native rAF paint tick and an
  // independently composited WAAPI pulse. It is excluded from semantic pixel
  // fingerprints. Together they keep the screencast damage stream alive even
  // while product transaction work occupies the renderer main thread.
  await send("Runtime.evaluate", {
    expression: `(() => {
      const key = ${JSON.stringify(heartbeatKey)};
      window[key]?.stop?.();
      const marker = document.createElement("i");
      marker.setAttribute("aria-hidden", "true");
      marker.setAttribute("data-flow-screencast-heartbeat", "true");
      Object.assign(marker.style, {
        position: "fixed", left: "0", top: "0", width: "4px", height: "4px",
        background: "#000", opacity: "1", pointerEvents: "none",
        contain: "strict", willChange: "transform", zIndex: "2147483647"
      });
      document.documentElement.append(marker);
      const pulse = marker.animate([
        { transform: "translate3d(0,0,0)" },
        { transform: "translate3d(4px,0,0)" }
      ], { duration: 32, iterations: Infinity, easing: "steps(2, end)" });
      const audits = [];
      let frame = 0;
      let raf = 0;
      const tick = () => {
        frame += 1;
        marker.style.backgroundColor = frame % 2 ? "#000" : "#fff";
        try {
          audits.push(${message.stateExpression});
          if (audits.length > 240) audits.shift();
        } catch { /* the test fails later if no paired audit exists */ }
        raf = requestAnimationFrame(tick);
      };
      window[key] = {
        take: () => audits.slice(),
        stop: () => { cancelAnimationFrame(raf); pulse.cancel(); marker.remove(); }
      };
      raf = requestAnimationFrame(tick);
    })()`,
  });
  const startExpression = message.startKind === "reward"
    ? `(() => {
        const starts = window.__FLOW_CAPTURE_WORKER_STARTS__ ??= [];
        starts.push(window[${JSON.stringify(startBinding)}]);
      })()`
    : `(() => {
        const binding = window[${JSON.stringify(startBinding)}];
        const inspect = () => {
          const animation = [...document.querySelectorAll(${JSON.stringify(message.selector)})]
            .flatMap((element) => element.getAnimations())
            .find((candidate) => candidate.effect?.getComputedTiming().duration === ${message.durationMs});
          if (typeof animation?.startTime !== "number") return false;
          binding(String(animation.startTime));
          observer.disconnect();
          return true;
        };
        const observer = new MutationObserver(inspect);
        observer.observe(document.documentElement, { attributes: true, childList: true, subtree: true });
        inspect();
      })()`;
  await send("Runtime.evaluate", { expression: startExpression });
  completionTimer = setTimeout(() => finishCapture(), 15_000);
}

process.on("message", async (message) => {
  try {
    if (message.type === "initialize") {
      const calibration = await connect(message);
      process.send?.({ type: "ready", ...calibration });
    } else if (message.type === "arm") {
      await armCapture(message);
      process.send?.({ type: "armed" });
    } else if (message.type === "shutdown") {
      await cleanupCapture();
      socket?.close();
      process.exit(0);
    }
  } catch (error) {
    reportError(error);
  }
});
