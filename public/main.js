// --- Socket.IO: Connects client to server for real-time communication ---
const socket = io();
const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const colorPicker = document.getElementById('color');
const roomInput = document.getElementById('room-input');
const joinBtn = document.getElementById('join-btn');
const createBtn = document.getElementById('create-btn');
const roomInfo = document.getElementById('room-info');
const toolbar = document.getElementById('toolbar');
const roomControls = document.getElementById('room-controls');
const roomCodeDisplay = document.getElementById('room-code-display');
const leaveBtn = document.getElementById('leave-btn');
const leaveRoomBar = document.getElementById('leave-room-bar');

let drawing = false;
let current = { color: colorPicker.value };
let joinedRoom = null;

function setRoomUI(joined, code) {
  if (joined) {
    roomControls.style.display = 'none';
    canvas.style.display = '';
    toolbar.style.display = '';
    roomInfo.textContent = '';
    roomCodeDisplay.style.display = '';
    roomCodeDisplay.textContent = `Room code: ${code}`;
    leaveRoomBar.style.display = '';
  } else {
    roomControls.style.display = '';
    canvas.style.display = 'none';
    toolbar.style.display = 'none';
    roomInfo.textContent = '';
    roomCodeDisplay.style.display = 'none';
    roomCodeDisplay.textContent = '';
    leaveRoomBar.style.display = 'none';
  }
}
// Leave Room button logic
leaveBtn.addEventListener('click', () => {
  localStorage.removeItem('lastRoom');
  setRoomUI(false);
  joinedRoom = null;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  socket.emit('leaveRoom');
});

// Join Room button logic
joinBtn.addEventListener('click', () => {
  const code = roomInput.value.trim();
  if (!code) {
    roomInfo.textContent = 'Please enter a room code to join.';
    roomInfo.style.color = '#f44';
    return;
  }
  socket.emit('joinRoom', { code, userId });
});

// Create Room button logic
createBtn.addEventListener('click', () => {
  // No code provided, server will generate a new room
  socket.emit('joinRoom', { code: '', userId });
});



// --- Persistent userId per browser (localStorage) ---
let userId = localStorage.getItem('userId');
if (!userId) {
  userId = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : Math.random().toString(36).substr(2, 12);
  localStorage.setItem('userId', userId);
}

// --- Send userId to server immediately on connect ---
socket.on('connect', () => {
  socket.emit('registerUser', userId);
});

joinBtn.addEventListener('click', () => {
  const code = roomInput.value.trim();
  // --- Socket.IO: Emit joinRoom event to server, with userId ---
  socket.emit('joinRoom', { code, userId });
});

// --- Socket.IO: Listen for roomJoined event from server ---
socket.on('roomJoined', (code) => {
  joinedRoom = code;
  setRoomUI(true, code);
  // Clear the canvas when joining a new room
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  // Store the room code persistently with expiration (e.g., 24 hours)
  const expireMs = 24 * 60 * 60 * 1000; // 24 hours
  const lastRoomData = { code, expires: Date.now() + expireMs };
  localStorage.setItem('lastRoom', JSON.stringify(lastRoomData));
});

// Receive and replay drawing history
// --- Socket.IO: Listen for drawingHistory event from server ---
socket.on('drawingHistory', (history) => {
  if (Array.isArray(history)) {
    history.forEach(data => {
      drawLine(data.x0, data.y0, data.x1, data.y1, data.color, false);
    });
  }
});

// --- Socket.IO: Listen for roomError event from server ---
socket.on('roomError', (msg) => {
  roomInfo.textContent = msg;
  roomInfo.style.color = '#f44';
});

// Drawing logic (only enabled after joining a room)
canvas.addEventListener('mousedown', (e) => {
  if (!joinedRoom) return;
  drawing = true;
  current.x = e.offsetX;
  current.y = e.offsetY;
});

canvas.addEventListener('mouseup', () => {
  drawing = false;
});

canvas.addEventListener('mouseout', () => {
  drawing = false;
});

canvas.addEventListener('mousemove', (e) => {
  if (!drawing || !joinedRoom) return;
  drawLine(current.x, current.y, e.offsetX, e.offsetY, current.color, true);
  current.x = e.offsetX;
  current.y = e.offsetY;
});

colorPicker.addEventListener('change', (e) => {
  current.color = e.target.value;
});

function drawLine(x0, y0, x1, y1, color, emit) {
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.closePath();

  if (!emit || !joinedRoom) return;
  // --- Socket.IO: Emit drawing event to server ---
  socket.emit('drawing', { x0, y0, x1, y1, color, room: joinedRoom });
}

// --- Socket.IO: Listen for drawing event from server ---
socket.on('drawing', (data) => {
  drawLine(data.x0, data.y0, data.x1, data.y1, data.color, false);
});

// On load, check for lastRoom and auto-join if not expired
let autoJoined = false;
try {
  const lastRoomRaw = localStorage.getItem('lastRoom');
  if (lastRoomRaw) {
    const lastRoomData = JSON.parse(lastRoomRaw);
    if (lastRoomData.code && lastRoomData.expires && Date.now() < lastRoomData.expires) {
      // Auto-join the last room
      socket.emit('joinRoom', { code: lastRoomData.code, userId });
      autoJoined = true;
    } else {
      // Expired, remove from storage
      localStorage.removeItem('lastRoom');
    }
  }
} catch (e) {
  localStorage.removeItem('lastRoom');
}
if (!autoJoined) {
  setRoomUI(false);
}
