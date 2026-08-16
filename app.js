// ======================
// Firebase Config
// ======================
const firebaseConfig = {
  apiKey: "AIzaSyB19tVRkcTjgjHbsOa49LjPBmwRqoR65Vo",
  authDomain: "date-night-eb68a.firebaseapp.com",
  databaseURL: "https://date-night-eb68a-default-rtdb.firebaseio.com", // update if your URL is different
  projectId: "date-night-eb68a",
  storageBucket: "date-night-eb68a.firebasestorage.app",
  messagingSenderId: "1002805026528",
  appId: "1:1002805026528:web:c6c7e62bbc0e2c1f237a85",
  measurementId: "G-Q44YDBMZPZ"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.database();

// ======================
// Game State
// ======================
let playerId = localStorage.getItem("dnd_playerId");
if (!playerId) {
  playerId = "p_" + Math.random().toString(36).slice(2, 10);
  localStorage.setItem("dnd_playerId", playerId);
}

let roomCode = null;
let isDrawer = false;
let roomRef = null;
let strokesRef = null;
let currentStrokeId = null;
let isDrawing = false;
let lastX = 0, lastY = 0;
let timerInterval = null;
let canvas, ctx;
let canvasRect = null;

// Fun visual prompts (couple / date-night friendly)
const PROMPTS = [
  "a big heart",
  "two people holding hands",
  "a slice of pizza",
  "the New York skyline",
  "a cup of tea or coffee",
  "a cute cat",
  "a flower",
  "fireworks",
  "a smiley face with hearts for eyes",
  "a boat on water",
  "the moon and stars",
  "a pair of sunglasses",
  "a birthday cake",
  "a bicycle",
  "an umbrella in the rain",
  "a mountain",
  "a guitar",
  "ice cream cone",
  "a palm tree",
  "two interlocking rings",
  "a rainbow",
  "a rocket ship",
  "a teddy bear",
  "a camera",
  "a hot air balloon"
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
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
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

  els.canvas.width = width * dpr;
  els.canvas.height = height * dpr;
  els.canvas.style.width = width + "px";
  els.canvas.style.height = height + "px";

  ctx = els.canvas.getContext("2d");
  ctx.scale(dpr, dpr);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  canvasRect = els.canvas.getBoundingClientRect();
  // Redraw existing strokes after resize would require storing them locally.
  // For simplicity we keep it simple — clear happens on new round anyway.
}

function getPos(e) {
  const rect = els.canvas.getBoundingClientRect();
  let clientX, clientY;
  if (e.touches && e.touches[0]) {
    clientX = e.touches[0].clientX;
    clientY = e.touches[0].clientY;
  } else {
    clientX = e.clientX;
    clientY = e.clientY;
  }
  return {
    x: clientX - rect.left,
    y: clientY - rect.top
  };
}

function drawLine(x0, y0, x1, y1, color, width) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
}

function clearLocalCanvas() {
  const dpr = window.devicePixelRatio || 1;
  ctx.clearRect(0, 0, els.canvas.width / dpr, els.canvas.height / dpr);
}

// ======================
// Room logic
// ======================
async function createRoom() {
  els.lobbyStatus.textContent = "Creating room…";
  roomCode = generateRoomCode();

  roomRef = db.ref("rooms/" + roomCode);
  await roomRef.set({
    createdAt: Date.now(),
    players: {
      [playerId]: { joinedAt: Date.now(), role: null }
    },
    status: "waiting",
    prompt: null,
    drawerId: null,
    timerEnd: null
  });

  els.roomCodeDisplay.textContent = roomCode;
  showScreen("waiting");
  listenToRoom();
}

async function joinRoom() {
  const code = els.joinCode.value.trim().toUpperCase();
  if (code.length < 4) {
    els.lobbyStatus.textContent = "Please enter a valid code";
    return;
  }

  els.lobbyStatus.textContent = "Joining…";
  roomCode = code;
  roomRef = db.ref("rooms/" + roomCode);

  const snap = await roomRef.once("value");
  if (!snap.exists()) {
    els.lobbyStatus.textContent = "Room not found";
    return;
  }

  const data = snap.val();
  const playerCount = data.players ? Object.keys(data.players).length : 0;
  if (playerCount >= 2 && !data.players[playerId]) {
    els.lobbyStatus.textContent = "Room is full";
    return;
  }

  await roomRef.child("players/" + playerId).set({
    joinedAt: Date.now(),
    role: null
  });

  showScreen("waiting");
  els.roomCodeDisplay.textContent = roomCode;
  listenToRoom();
}

function listenToRoom() {
  if (!roomRef) return;

  roomRef.on("value", (snap) => {
    const data = snap.val();
    if (!data) {
      leaveRoom();
      return;
    }

    const players = data.players || {};
    const playerIds = Object.keys(players);
    const bothJoined = playerIds.length >= 2;

    if (screens.waiting.classList.contains("hidden") === false) {
      // still on waiting screen
      if (bothJoined) {
        els.waitingStatus.textContent = "Both connected! Starting…";
        // Move to game after a short moment
        setTimeout(() => enterGame(data), 600);
      } else {
        els.waitingStatus.textContent = "Waiting for someone to join…";
      }
    } else {
      // already in game — update state
      updateGameFromData(data);
    }
  });
}

function enterGame(data) {
  showScreen("game");
  els.roomLabel.textContent = roomCode;

  // Assign roles if not yet assigned
  if (!data.drawerId) {
    // First player who joined becomes drawer, or random
    const playerIds = Object.keys(data.players || {});
    const drawer = playerIds[0]; // simple: creator draws first
    roomRef.update({
      drawerId: drawer,
      status: "ready"
    });
  }

  setupCanvas();
  updateGameFromData(data);
}

function updateGameFromData(data) {
  if (!data) return;

  isDrawer = data.drawerId === playerId;

  // Role badge
  els.roleBadge.textContent = isDrawer ? "You draw" : "You watch";
  els.roleBadge.className = "badge " + (isDrawer ? "drawer" : "watcher");

  // Tools only for drawer while drawing
  const canDraw = isDrawer && data.status === "drawing";
  els.drawingTools.style.opacity = canDraw ? "1" : "0.35";
  els.drawingTools.style.pointerEvents = canDraw ? "auto" : "none";

  // Prompt visibility
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

  // Buttons
  els.btnStartRound.classList.toggle("hidden", !(data.status === "ready" || data.status === "reveal"));
  els.btnSwap.classList.toggle("hidden", data.status !== "reveal");

  // Only the non-drawer (or either) can start? Let's let either start the next round.
  // Timer
  if (data.status === "drawing" && data.timerEnd) {
    startLocalTimer(data.timerEnd);
  } else {
    stopLocalTimer();
    els.timer.textContent = data.status === "ready" ? "Ready" : "--";
    els.timer.classList.remove("warning");
  }

  // Strokes listener
  if (!strokesRef) {
    strokesRef = roomRef.child("strokes");
    strokesRef.on("child_added", (s) => {
      const stroke = s.val();
      if (stroke && stroke.points && stroke.points.length > 1) {
        for (let i = 1; i < stroke.points.length; i++) {
          drawLine(
            stroke.points[i - 1].x, stroke.points[i - 1].y,
            stroke.points[i].x, stroke.points[i].y,
            stroke.color || "#e91e63",
            stroke.width || 6
          );
        }
      }
    });

    // Also listen for clear
    roomRef.child("clearAt").on("value", (s) => {
      if (s.val()) clearLocalCanvas();
    });
  }
}

function startLocalTimer(endTs) {
  stopLocalTimer();
  function tick() {
    const left = Math.max(0, Math.ceil((endTs - Date.now()) / 1000));
    els.timer.textContent = left + "s";
    els.timer.classList.toggle("warning", left <= 10);
    if (left <= 0) {
      stopLocalTimer();
      // Drawer can trigger reveal, but both will see via listener
      if (isDrawer) {
        roomRef.update({ status: "reveal" });
      }
    }
  }
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
// Round controls
// ======================
async function startRound() {
  if (!roomRef) return;

  clearLocalCanvas();
  await roomRef.child("strokes").remove();
  await roomRef.child("clearAt").set(Date.now());

  const prompt = randomPrompt();
  const timerEnd = Date.now() + ROUND_SECONDS * 1000;

  await roomRef.update({
    status: "drawing",
    prompt: prompt,
    timerEnd: timerEnd
  });
}

async function swapRoles() {
  if (!roomRef) return;
  const snap = await roomRef.once("value");
  const data = snap.val();
  if (!data) return;

  const playerIds = Object.keys(data.players || {});
  const other = playerIds.find(id => id !== data.drawerId) || playerIds[0];

  clearLocalCanvas();
  await roomRef.child("strokes").remove();

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
    if (strokesRef) strokesRef.off();
    roomRef.child("players/" + playerId).remove();
  }
  roomRef = null;
  strokesRef = null;
  roomCode = null;
  isDrawer = false;
  showScreen("lobby");
  els.lobbyStatus.textContent = "";
  els.joinCode.value = "";
}

// ======================
// Drawing
// ======================
function setupCanvas() {
  resizeCanvas();
  window.addEventListener("resize", resizeCanvas);

  // Mouse
  els.canvas.addEventListener("mousedown", onPointerDown);
  els.canvas.addEventListener("mousemove", onPointerMove);
  window.addEventListener("mouseup", onPointerUp);

  // Touch
  els.canvas.addEventListener("touchstart", onPointerDown, { passive: false });
  els.canvas.addEventListener("touchmove", onPointerMove, { passive: false });
  els.canvas.addEventListener("touchend", onPointerUp);
  els.canvas.addEventListener("touchcancel", onPointerUp);
}

function onPointerDown(e) {
  if (!isDrawer) return;
  // Check current status via a quick flag — we rely on tools being disabled
  e.preventDefault();
  isDrawing = true;
  const pos = getPos(e);
  lastX = pos.x;
  lastY = pos.y;

  currentStrokeId = "s_" + Date.now() + "_" + Math.random().toString(36).slice(2, 6);
  // Start the stroke in Firebase
  if (roomRef) {
    roomRef.child("strokes/" + currentStrokeId).set({
      color: els.colorPicker.value,
      width: Number(els.brushSize.value),
      points: [{ x: pos.x, y: pos.y }]
    });
  }
}

function onPointerMove(e) {
  if (!isDrawing || !isDrawer) return;
  e.preventDefault();
  const pos = getPos(e);

  // Local draw for immediate feedback
  drawLine(lastX, lastY, pos.x, pos.y, els.colorPicker.value, Number(els.brushSize.value));

  // Push point to Firebase
  if (roomRef && currentStrokeId) {
    roomRef.child("strokes/" + currentStrokeId + "/points").push({
      x: Math.round(pos.x),
      y: Math.round(pos.y)
    });
  }

  lastX = pos.x;
  lastY = pos.y;
}

function onPointerUp(e) {
  if (!isDrawing) return;
  isDrawing = false;
  currentStrokeId = null;
}

// Clear button
els.btnClear.addEventListener("click", async () => {
  if (!isDrawer || !roomRef) return;
  clearLocalCanvas();
  await roomRef.child("strokes").remove();
  await roomRef.child("clearAt").set(Date.now());
});

// ======================
// Event listeners
// ======================
els.btnCreate.addEventListener("click", createRoom);
els.btnJoin.addEventListener("click", joinRoom);
els.joinCode.addEventListener("keydown", (e) => {
  if (e.key === "Enter") joinRoom();
});
els.btnLeaveWaiting.addEventListener("click", leaveRoom);
els.btnLeaveGame.addEventListener("click", leaveRoom);
els.btnStartRound.addEventListener("click", startRound);
els.btnSwap.addEventListener("click", swapRoles);

// Auto uppercase the join code
els.joinCode.addEventListener("input", () => {
  els.joinCode.value = els.joinCode.value.toUpperCase();
});
