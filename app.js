// ======================
// Firebase Config
// ======================
const firebaseConfig = {
  apiKey: "AIzaSyB19tVRkcTjgjHbsOa49LjPBmwRqoR65Vo",
  authDomain: "date-night-eb68a.firebaseapp.com",
  databaseURL: "https://date-night-eb68a-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "date-night-eb68a",
  storageBucket: "date-night-eb68a.firebasestorage.app",
  messagingSenderId: "1002805026528",
  appId: "1:1002805026528:web:c6c7e62bbc0e2c1f237a85",
  measurementId: "G-Q44YDBMZPZ"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.database();

db.ref(".info/connected").on("value", snap => {
  console.log("%cFirebase connected: " + snap.val(), "color:lime;font-weight:bold");
});

// ======================
// State
// ======================
let playerId = localStorage.getItem("dnd_playerId");
if (!playerId) {
  playerId = "p_" + Math.random().toString(36).slice(2, 10);
  localStorage.setItem("dnd_playerId", playerId);
}
console.log("playerId:", playerId);

let roomCode = null;
let isDrawer = false;
let roomRef = null;
let isDrawing = false;
let lastX = 0, lastY = 0;
let timerInterval = null;
let ctx = null;
let currentStatus = "";

const PROMPTS = [
  "a big heart", "two people holding hands", "a slice of pizza",
  "the New York skyline", "a cup of tea or coffee", "a cute cat",
  "a flower", "fireworks", "a smiley face with hearts for eyes",
  "a boat on water", "the moon and stars", "a pair of sunglasses",
  "a birthday cake", "a bicycle", "an umbrella in the rain",
  "a mountain", "a guitar", "ice cream cone", "a palm tree",
  "two interlocking rings", "a rainbow", "a rocket ship",
  "a teddy bear", "a camera", "a hot air balloon"
];

const ROUND_SECONDS = 75;

// ======================
// DOM
// ======================
const screens = {
  lobby: document.getElementById("lobby"),
  waiting: document.getElementById("waiting"),
  game: document.getElementById("game")
};

const els = {
  btnCreate: document.getElementById("btn-create"),
  btnJoin: document.getElementById("btn-join"),
  joinCode: document.getElementById("join-code"),
  lobbyStatus: document.getElementById("lobby-status"),
  roomCodeDisplay: document.getElementById("room-code-display"),
  waitingStatus: document.getElementById("waiting-status"),
  btnLeaveWaiting: document.getElementById("btn-leave-waiting"),
  roleBadge: document.getElementById("role-badge"),
  timer: document.getElementById("timer"),
  roomLabel: document.getElementById("room-label"),
  promptBox: document.getElementById("prompt-box"),
  promptText: document.getElementById("prompt-text"),
  revealBox: document.getElementById("reveal-box"),
  revealText: document.getElementById("reveal-text"),
  canvas: document.getElementById("draw-canvas"),
  colorPicker: document.getElementById("color-picker"),
  brushSize: document.getElementById("brush-size"),
  btnClear: document.getElementById("btn-clear"),
  drawingTools: document.getElementById("drawing-tools"),
  btnStartRound: document.getElementById("btn-start-round"),
  btnSwap: document.getElementById("btn-swap"),
  btnLeaveGame: document.getElementById("btn-leave-game")
};

// ======================
// Helpers
// ======================
function showScreen(name) {
  Object.values(screens).forEach(s => s.classList.add("hidden"));
  screens[name].classList.remove("hidden");
}

function generateRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function randomPrompt() {
  return PROMPTS[Math.floor(Math.random() * PROMPTS.length)];
}

function resizeCanvas() {
  const wrapper = els.canvas.parentElement;
  if (!wrapper) return;

  const dpr = window.devicePixelRatio || 1;
  const width = wrapper.clientWidth || 300;
  const height = wrapper.clientHeight || 400;

  els.canvas.width = Math.floor(width * dpr);
  els.canvas.height = Math.floor(height * dpr);
  els.canvas.style.width = width + "px";
  els.canvas.style.height = height + "px";

  ctx = els.canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // Draw a test cross so we know the canvas is alive
  ctx.strokeStyle = "#ddd";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(width/2 - 20, height/2);
  ctx.lineTo(width/2 + 20, height/2);
  ctx.moveTo(width/2, height/2 - 20);
  ctx.lineTo(width/2, height/2 + 20);
  ctx.stroke();

  console.log("Canvas ready:", width, "x", height);
}

function getPos(e) {
  const rect = els.canvas.getBoundingClientRect();
  const clientX = (e.touches && e.touches[0]) ? e.touches[0].clientX : e.clientX;
  const clientY = (e.touches && e.touches[0]) ? e.touches[0].clientY : e.clientY;
  return {
    x: clientX - rect.left,
    y: clientY - rect.top
  };
}

function drawSegment(x0, y0, x1, y1, color, width) {
  if (!ctx) {
    console.warn("No ctx");
    return;
  }
  ctx.strokeStyle = color || "#e91e63";
  ctx.lineWidth = width || 6;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
}

function clearLocalCanvas() {
  if (!ctx) return;
  const dpr = window.devicePixelRatio || 1;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, els.canvas.width, els.canvas.height);
  ctx.restore();
  // restore scale
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function withTimeout(p, ms, msg) {
  return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(msg)), ms))]);
}

function updateDebug() {
  let d = document.getElementById("debug-info");
  if (!d) {
    d = document.createElement("div");
    d.id = "debug-info";
    d.style.cssText = "position:fixed;bottom:6px;left:6px;background:#000c;color:#0f0;font:12px monospace;padding:6px 10px;border-radius:6px;z-index:99999;";
    document.body.appendChild(d);
  }
  d.innerHTML = `status: <b>${currentStatus}</b> | drawer: <b>${isDrawer}</b> | id: ${playerId.slice(-5)}`;
}

// ======================
// Room
// ======================
async function createRoom() {
  els.lobbyStatus.textContent = "Creating…";
  els.btnCreate.disabled = true;
  try {
    roomCode = generateRoomCode();
    roomRef = db.ref("rooms/" + roomCode);
    await withTimeout(roomRef.set({
      createdAt: Date.now(),
      players: { [playerId]: { joinedAt: Date.now() } },
      status: "waiting",
      prompt: null,
      drawerId: null,
      timerEnd: null
    }), 8000, "Timeout");
    els.roomCodeDisplay.textContent = roomCode;
    showScreen("waiting");
    listenToRoom();
  } catch (e) {
    els.lobbyStatus.style.color = "#e57373";
    els.lobbyStatus.textContent = e.message;
  } finally {
    els.btnCreate.disabled = false;
  }
}

async function joinRoom() {
  const code = els.joinCode.value.trim().toUpperCase();
  if (code.length < 4) return els.lobbyStatus.textContent = "Bad code";
  els.lobbyStatus.textContent = "Joining…";
  els.btnJoin.disabled = true;
  try {
    roomCode = code;
    roomRef = db.ref("rooms/" + roomCode);
    const snap = await withTimeout(roomRef.once("value"), 8000, "Timeout");
    if (!snap.exists()) {
      els.lobbyStatus.textContent = "Room not found";
      return;
    }
    const data = snap.val();
    const count = Object.keys(data.players || {}).length;
    if (count >= 2 && !data.players[playerId]) {
      els.lobbyStatus.textContent = "Full";
      return;
    }
    await roomRef.child("players/" + playerId).set({ joinedAt: Date.now() });
    showScreen("waiting");
    els.roomCodeDisplay.textContent = roomCode;
    listenToRoom();
  } catch (e) {
    els.lobbyStatus.style.color = "#e57373";
    els.lobbyStatus.textContent = e.message;
  } finally {
    els.btnJoin.disabled = false;
  }
}

function listenToRoom() {
  roomRef.on("value", snap => {
    const data = snap.val();
    if (!data) return leaveRoom();

    const ids = Object.keys(data.players || {});
    if (!screens.waiting.classList.contains("hidden")) {
      if (ids.length >= 2) {
        els.waitingStatus.textContent = "Both here! Starting…";
        setTimeout(() => enterGame(data), 400);
      } else {
        els.waitingStatus.textContent = "Waiting for partner…";
      }
    } else {
      updateGameFromData(data);
    }
  });
}

function enterGame(data) {
  showScreen("game");
  els.roomLabel.textContent = roomCode;

  if (!data.drawerId) {
    const ids = Object.keys(data.players || {});
    roomRef.update({ drawerId: ids[0], status: "ready" });
  }

  // Important: set up canvas AFTER the game screen is visible
  setTimeout(() => {
    setupCanvas();
    setupSegmentListener();
    updateGameFromData(data);
  }, 100);
}

function updateGameFromData(data) {
  if (!data) return;

  currentStatus = data.status || "";
  isDrawer = (data.drawerId === playerId);
  updateDebug();

  els.roleBadge.textContent = isDrawer ? "YOU DRAW" : "YOU WATCH";
  els.roleBadge.className = "badge " + (isDrawer ? "drawer" : "watcher");

  // Always enable tools for the drawer (we removed the strict lock)
  const canDraw = isDrawer;
  els.drawingTools.style.opacity = canDraw ? "1" : "0.35";
  els.drawingTools.style.pointerEvents = canDraw ? "auto" : "none";

  if (isDrawer && data.prompt && (data.status === "drawing" || data.status === "ready")) {
    els.promptBox.classList.remove("hidden");
    els.promptText.textContent = data.prompt || "(waiting for start)";
  } else {
    els.promptBox.classList.add("hidden");
  }

  if (data.status === "reveal") {
    els.revealBox.classList.remove("hidden");
    els.revealText.textContent = data.prompt || "?";
  } else {
    els.revealBox.classList.add("hidden");
  }

  els.btnStartRound.classList.toggle("hidden", !(data.status === "ready" || data.status === "reveal"));
  els.btnSwap.classList.toggle("hidden", data.status !== "reveal");

  if (data.status === "drawing" && data.timerEnd) {
    startLocalTimer(data.timerEnd);
  } else {
    stopLocalTimer();
    els.timer.textContent = data.status === "ready" ? "Ready" : "--";
  }
}

function startLocalTimer(end) {
  stopLocalTimer();
  const tick = () => {
    const left = Math.max(0, Math.ceil((end - Date.now()) / 1000));
    els.timer.textContent = left + "s";
    els.timer.classList.toggle("warning", left <= 10);
    if (left <= 0) {
      stopLocalTimer();
      if (isDrawer) roomRef.update({ status: "reveal" });
    }
  };
  tick();
  timerInterval = setInterval(tick, 200);
}

function stopLocalTimer() {
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = null;
}

// ======================
// Drawing
// ======================
function setupSegmentListener() {
  roomRef.child("segments").off();
  roomRef.child("segments").on("child_added", snap => {
    const s = snap.val();
    if (s) drawSegment(s.x0, s.y0, s.x1, s.y1, s.color, s.width);
  });

  roomRef.child("clearAt").off();
  roomRef.child("clearAt").on("value", snap => {
    if (snap.val()) clearLocalCanvas();
  });
}

async function startRound() {
  if (!roomRef) return;
  clearLocalCanvas();
  await roomRef.child("segments").remove();
  await roomRef.child("clearAt").set(Date.now());
  await roomRef.update({
    status: "drawing",
    prompt: randomPrompt(),
    timerEnd: Date.now() + ROUND_SECONDS * 1000
  });
}

async function swapRoles() {
  if (!roomRef) return;
  const snap = await roomRef.once("value");
  const data = snap.val();
  if (!data) return;
  const ids = Object.keys(data.players || {});
  const other = ids.find(id => id !== data.drawerId) || ids[0];
  clearLocalCanvas();
  await roomRef.child("segments").remove();
  await roomRef.update({
    drawerId: other,
    status: "ready",
    prompt: null,
    timerEnd: null
  });
}

function leaveRoom() {
  stopLocalTimer();
  if (roomRef) {
    roomRef.off();
    roomRef.child("players/" + playerId).remove().catch(()=>{});
  }
  roomRef = null;
  roomCode = null;
  isDrawer = false;
  showScreen("lobby");
  els.lobbyStatus.textContent = "";
  const d = document.getElementById("debug-info");
  if (d) d.remove();
}

// ======================
// Pointer handlers
// ======================
function setupCanvas() {
  resizeCanvas();

  // Remove old listeners by cloning the canvas (cleanest way)
  const newCanvas = els.canvas.cloneNode(true);
  els.canvas.parentNode.replaceChild(newCanvas, els.canvas);
  els.canvas = newCanvas;

  // Re-get context after clone
  resizeCanvas();

  els.canvas.addEventListener("mousedown", onStart);
  els.canvas.addEventListener("mousemove", onMove);
  window.addEventListener("mouseup", onEnd);

  els.canvas.addEventListener("touchstart", onStart, { passive: false });
  els.canvas.addEventListener("touchmove", onMove, { passive: false });
  els.canvas.addEventListener("touchend", onEnd);
  els.canvas.addEventListener("touchcancel", onEnd);

  console.log("Canvas event listeners attached");
}

function onStart(e) {
  e.preventDefault();
  e.stopPropagation();

  console.log("START – isDrawer:", isDrawer);

  // TEMP: allow drawer to draw even if status is not perfect
  if (!isDrawer) {
    console.log("Blocked – you are not the drawer");
    return;
  }

  isDrawing = true;
  const pos = getPos(e);
  lastX = pos.x;
  lastY = pos.y;

  // Tiny dot so user sees something immediately
  drawSegment(lastX, lastY, lastX + 0.1, lastY + 0.1, els.colorPicker.value, Number(els.brushSize.value));
}

function onMove(e) {
  e.preventDefault();
  if (!isDrawing || !isDrawer) return;

  const pos = getPos(e);
  const x = pos.x;
  const y = pos.y;

  // Local draw
  drawSegment(lastX, lastY, x, y, els.colorPicker.value, Number(els.brushSize.value));

  // Send to Firebase
  if (roomRef) {
    roomRef.child("segments").push({
      x0: Math.round(lastX * 10) / 10,
      y0: Math.round(lastY * 10) / 10,
      x1: Math.round(x * 10) / 10,
      y1: Math.round(y * 10) / 10,
      color: els.colorPicker.value,
      width: Number(els.brushSize.value)
    });
  }

  lastX = x;
  lastY = y;
}

function onEnd(e) {
  isDrawing = false;
}

els.btnClear.addEventListener("click", async () => {
  if (!isDrawer || !roomRef) return;
  clearLocalCanvas();
  await roomRef.child("segments").remove();
  await roomRef.child("clearAt").set(Date.now());
});

// ======================
// Buttons
// ======================
els.btnCreate.addEventListener("click", createRoom);
els.btnJoin.addEventListener("click", joinRoom);
els.joinCode.addEventListener("keydown", e => { if (e.key === "Enter") joinRoom(); });
els.btnLeaveWaiting.addEventListener("click", leaveRoom);
els.btnLeaveGame.addEventListener("click", leaveRoom);
els.btnStartRound.addEventListener("click", startRound);
els.btnSwap.addEventListener("click", swapRoles);
els.joinCode.addEventListener("input", () => {
  els.joinCode.value = els.joinCode.value.toUpperCase();
});
