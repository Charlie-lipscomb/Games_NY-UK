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

db.ref(".info/connected").on("value", (snap) => {
  console.log("%c Firebase connected: " + snap.val(), "color: lime; font-weight: bold");
});

// ======================
// Game State
// ======================
let playerId = localStorage.getItem("dnd_playerId");
if (!playerId) {
  playerId = "p_" + Math.random().toString(36).slice(2, 10);
  localStorage.setItem("dnd_playerId", playerId);
}
console.log("My playerId:", playerId);

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
  const dpr = window.devicePixelRatio || 1;
  const width = wrapper.clientWidth;
  const height = wrapper.clientHeight;

  els.canvas.width = Math.floor(width * dpr);
  els.canvas.height = Math.floor(height * dpr);
  els.canvas.style.width = width + "px";
  els.canvas.style.height = height + "px";

  ctx = els.canvas.getContext("2d");
  ctx.setTransform(1, 0, 0, 1, 0, 0); // reset
  ctx.scale(dpr, dpr);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
}

function getPos(e) {
  const rect = els.canvas.getBoundingClientRect();
  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  const clientY = e.touches ? e.touches[0].clientY : e.clientY;
  return {
    x: clientX - rect.left,
    y: clientY - rect.top
  };
}

function drawSegment(x0, y0, x1, y1, color, width) {
  if (!ctx) return;
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
}

function withTimeout(promise, ms, msg) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(msg)), ms))
  ]);
}

function updateDebug() {
  // Small on-screen debug so we can see state without console
  let debug = document.getElementById("debug-info");
  if (!debug) {
    debug = document.createElement("div");
    debug.id = "debug-info";
    debug.style.cssText = "position:fixed;bottom:4px;left:4px;background:rgba(0,0,0,0.75);color:#0f0;font:11px monospace;padding:4px 8px;border-radius:4px;z-index:9999;max-width:90vw;";
    document.body.appendChild(debug);
  }
  debug.textContent = `status: ${currentStatus} | drawer: ${isDrawer} | me: ${playerId.slice(-4)}`;
}

// ======================
// Room logic
// ======================
async function createRoom() {
  els.lobbyStatus.textContent = "Creating room…";
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
    }), 8000, "Timeout creating room");

    els.roomCodeDisplay.textContent = roomCode;
    showScreen("waiting");
    listenToRoom();
  } catch (err) {
    console.error(err);
    els.lobbyStatus.style.color = "#e57373";
    els.lobbyStatus.textContent = "Error: " + err.message;
  } finally {
    els.btnCreate.disabled = false;
  }
}

async function joinRoom() {
  const code = els.joinCode.value.trim().toUpperCase();
  if (code.length < 4) {
    els.lobbyStatus.textContent = "Enter a valid code";
    return;
  }
  els.lobbyStatus.textContent = "Joining…";
  els.btnJoin.disabled = true;
  try {
    roomCode = code;
    roomRef = db.ref("rooms/" + roomCode);
    const snap = await withTimeout(roomRef.once("value"), 8000, "Timeout joining");
    if (!snap.exists()) {
      els.lobbyStatus.textContent = "Room not found";
      return;
    }
    const data = snap.val();
    const count = data.players ? Object.keys(data.players).length : 0;
    if (count >= 2 && !data.players[playerId]) {
      els.lobbyStatus.textContent = "Room full";
      return;
    }
    await roomRef.child("players/" + playerId).set({ joinedAt: Date.now() });
    showScreen("waiting");
    els.roomCodeDisplay.textContent = roomCode;
    listenToRoom();
  } catch (err) {
    console.error(err);
    els.lobbyStatus.style.color = "#e57373";
    els.lobbyStatus.textContent = "Error: " + err.message;
  } finally {
    els.btnJoin.disabled = false;
  }
}

function listenToRoom() {
  roomRef.on("value", (snap) => {
    const data = snap.val();
    if (!data) { leaveRoom(); return; }

    const playerIds = Object.keys(data.players || {});
    const bothJoined = playerIds.length >= 2;

    if (!screens.waiting.classList.contains("hidden")) {
      if (bothJoined) {
        els.waitingStatus.textContent = "Both connected! Starting…";
        setTimeout(() => enterGame(data), 400);
      } else {
        els.waitingStatus.textContent = "Waiting for someone to join…";
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
    const playerIds = Object.keys(data.players || {});
    roomRef.update({ drawerId: playerIds[0], status: "ready" });
  }

  setupCanvas();
  setupSegmentListener();
  updateGameFromData(data);
}

function updateGameFromData(data) {
  if (!data) return;

  currentStatus = data.status || "";
  isDrawer = data.drawerId === playerId;
  updateDebug();

  els.roleBadge.textContent = isDrawer ? "You draw" : "You watch";
  els.roleBadge.className = "badge " + (isDrawer ? "drawer" : "watcher");

  // Enable tools only for drawer during drawing phase
  const canDraw = isDrawer && data.status === "drawing";
  els.drawingTools.style.opacity = canDraw ? "1" : "0.4";
  els.drawingTools.style.pointerEvents = canDraw ? "auto" : "none";

  // Prompt
  if (isDrawer && data.status === "drawing" && data.prompt) {
    els.promptBox.classList.remove("hidden");
    els.promptText.textContent = data.prompt;
  } else {
    els.promptBox.classList.add("hidden");
  }

  // Reveal
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
    els.timer.classList.remove("warning");
  }
}

function startLocalTimer(endTs) {
  stopLocalTimer();
  const tick = () => {
    const left = Math.max(0, Math.ceil((endTs - Date.now()) / 1000));
    els.timer.textContent = left + "s";
    els.timer.classList.toggle("warning", left <= 10);
    if (left <= 0) {
      stopLocalTimer();
      if (isDrawer) roomRef.update({ status: "reveal" });
    }
  };
  tick();
  timerInterval = setInterval(tick, 250);
}

function stopLocalTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

// ======================
// Segment-based drawing (very reliable)
// ======================
function setupSegmentListener() {
  // Listen for new line segments from either player
  roomRef.child("segments").on("child_added", (snap) => {
    const seg = snap.val();
    if (seg) {
      drawSegment(seg.x0, seg.y0, seg.x1, seg.y1, seg.color, seg.width);
    }
  });

  // Clear signal
  roomRef.child("clearAt").on("value", (snap) => {
    if (snap.val()) clearLocalCanvas();
  });
}

async function startRound() {
  if (!roomRef) return;
  try {
    clearLocalCanvas();
    await roomRef.child("segments").remove();
    await roomRef.child("clearAt").set(Date.now());

    const prompt = randomPrompt();
    await roomRef.update({
      status: "drawing",
      prompt: prompt,
      timerEnd: Date.now() + ROUND_SECONDS * 1000
    });
  } catch (err) {
    console.error("startRound error", err);
  }
}

async function swapRoles() {
  if (!roomRef) return;
  try {
    const snap = await roomRef.once("value");
    const data = snap.val();
    if (!data) return;

    const playerIds = Object.keys(data.players || {});
    const other = playerIds.find(id => id !== data.drawerId) || playerIds[0];

    clearLocalCanvas();
    await roomRef.child("segments").remove();

    await roomRef.update({
      drawerId: other,
      status: "ready",
      prompt: null,
      timerEnd: null
    });
  } catch (err) {
    console.error("swap error", err);
  }
}

function leaveRoom() {
  stopLocalTimer();
  if (roomRef) {
    roomRef.off();
    roomRef.child("players/" + playerId).remove().catch(() => {});
  }
  roomRef = null;
  roomCode = null;
  isDrawer = false;
  currentStatus = "";
  showScreen("lobby");
  els.lobbyStatus.textContent = "";
  els.joinCode.value = "";
  const dbg = document.getElementById("debug-info");
  if (dbg) dbg.remove();
}

// ======================
// Pointer / Drawing
// ======================
function setupCanvas() {
  resizeCanvas();
  window.addEventListener("resize", resizeCanvas);

  // Use both mouse and touch with preventDefault
  els.canvas.addEventListener("mousedown", handleStart);
  els.canvas.addEventListener("mousemove", handleMove);
  window.addEventListener("mouseup", handleEnd);

  els.canvas.addEventListener("touchstart", handleStart, { passive: false });
  els.canvas.addEventListener("touchmove", handleMove, { passive: false });
  els.canvas.addEventListener("touchend", handleEnd);
  els.canvas.addEventListener("touchcancel", handleEnd);
}

function handleStart(e) {
  e.preventDefault();
  console.log("pointer down – isDrawer:", isDrawer, "status:", currentStatus);

  if (!isDrawer || currentStatus !== "drawing") {
    console.log("Not allowed to draw right now");
    return;
  }

  isDrawing = true;
  const pos = getPos(e);
  lastX = pos.x;
  lastY = pos.y;
}

function handleMove(e) {
  e.preventDefault();
  if (!isDrawing || !isDrawer) return;

  const pos = getPos(e);
  const x = pos.x;
  const y = pos.y;

  // Draw locally right away (feels instant)
  drawSegment(lastX, lastY, x, y, els.colorPicker.value, Number(els.brushSize.value));

  // Send the tiny segment to Firebase so the other person sees it
  if (roomRef) {
    roomRef.child("segments").push({
      x0: Math.round(lastX),
      y0: Math.round(lastY),
      x1: Math.round(x),
      y1: Math.round(y),
      color: els.colorPicker.value,
      width: Number(els.brushSize.value)
    });
  }

  lastX = x;
  lastY = y;
}

function handleEnd(e) {
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
