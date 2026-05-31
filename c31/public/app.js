const socket = io();

const CURSOR_COLORS = [
  '#ff4757', '#2ed573', '#1e90ff', '#ffa502', '#ff6b81',
  '#7bed9f', '#70a1ff', '#ff6348', '#2ed573', '#ff4757'
];

const THROTTLE_MS = 33;

function getRandomColor() {
  return CURSOR_COLORS[Math.floor(Math.random() * CURSOR_COLORS.length)];
}

function throttle(fn, delay) {
  let lastCall = 0;
  let timeoutId = null;
  return function(...args) {
    const now = Date.now();
    const remaining = delay - (now - lastCall);
    if (remaining <= 0) {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      lastCall = now;
      fn.apply(this, args);
    } else if (!timeoutId) {
      timeoutId = setTimeout(() => {
        lastCall = Date.now();
        timeoutId = null;
        fn.apply(this, args);
      }, remaining);
    }
  };
}

let currentRoomId = null;
let currentNickname = null;
let currentTool = 'free';
let strokeColor = '#000000';
let strokeWidth = 3;
let isDrawing = false;
let startX = 0;
let startY = 0;
let freehandPath = [];
let tempCanvas = null;
let tempCtx = null;
let myCursorColor = getRandomColor();
let remoteCursors = new Map();
let users = new Map();

let lastMouseX = 0;
let lastMouseY = 0;
let serverTimeOffset = 0;
const cursorUpdateQueue = new Map();

const drawingsById = new Map();
const myDrawingIds = new Set();
const comments = new Map();

let selectionStartX = 0;
let selectionStartY = 0;
let selectionEndX = 0;
let selectionEndY = 0;
let isSelecting = false;
let currentSelection = null;

const loginScreen = document.getElementById('loginScreen');
const whiteboardScreen = document.getElementById('whiteboardScreen');
const createTab = document.getElementById('createTab');
const joinTab = document.getElementById('joinTab');
const createForm = document.getElementById('createForm');
const joinForm = document.getElementById('joinForm');
const createRoomBtn = document.getElementById('createRoomBtn');
const joinRoomBtn = document.getElementById('joinRoomBtn');
const errorMessage = document.getElementById('errorMessage');
const roomIdDisplay = document.getElementById('roomIdDisplay');
const copyRoomIdBtn = document.getElementById('copyRoomId');
const leaveRoomBtn = document.getElementById('leaveRoom');
const canvas = document.getElementById('whiteboard');
const ctx = canvas.getContext('2d');
const cursorLayer = document.getElementById('cursorLayer');
const selectionLayer = document.getElementById('selectionLayer');
const commentsLayer = document.getElementById('commentsLayer');
const commentModal = document.getElementById('commentModal');
const commentPreview = document.getElementById('commentPreview');
const commentText = document.getElementById('commentText');
const cancelCommentBtn = document.getElementById('cancelComment');
const submitCommentBtn = document.getElementById('submitComment');
const zoomOverlay = document.getElementById('zoomOverlay');
const zoomImage = document.getElementById('zoomImage');
const closeZoomBtn = document.getElementById('closeZoom');
const deleteCommentBtn = document.getElementById('deleteComment');
const textInputContainer = document.getElementById('textInputContainer');
const textInput = document.getElementById('textInput');
const confirmTextBtn = document.getElementById('confirmText');
const cancelTextBtn = document.getElementById('cancelText');
const usersList = document.getElementById('usersList');

function showError(msg) {
  errorMessage.textContent = msg;
  errorMessage.classList.remove('hidden');
  setTimeout(() => errorMessage.classList.add('hidden'), 4000);
}

function hideError() {
  errorMessage.classList.add('hidden');
}

createTab.addEventListener('click', () => {
  createTab.classList.add('active');
  joinTab.classList.remove('active');
  createForm.classList.remove('hidden');
  joinForm.classList.add('hidden');
  hideError();
});

joinTab.addEventListener('click', () => {
  joinTab.classList.add('active');
  createTab.classList.remove('active');
  joinForm.classList.remove('hidden');
  createForm.classList.add('hidden');
  hideError();
});

createRoomBtn.addEventListener('click', () => {
  const nickname = document.getElementById('createNickname').value.trim();
  if (!nickname) {
    showError('请输入昵称');
    return;
  }
  currentNickname = nickname;
  socket.emit('createRoom', { nickname }, (response) => {
    if (response.success) {
      currentRoomId = response.roomId;
      enterWhiteboard();
    } else {
      showError(response.error);
    }
  });
});

joinRoomBtn.addEventListener('click', () => {
  const roomId = document.getElementById('joinRoomId').value.trim();
  const nickname = document.getElementById('joinNickname').value.trim();
  
  if (!roomId) {
    showError('请输入房间号');
    return;
  }
  if (!/^\d{6}$/.test(roomId)) {
    showError('房间号必须是6位数字');
    return;
  }
  if (!nickname) {
    showError('请输入昵称');
    return;
  }
  
  currentNickname = nickname;
  socket.emit('joinRoom', { roomId, nickname }, (response) => {
    if (response.success) {
      currentRoomId = roomId;
      enterWhiteboard();
      if (response.operations && response.operations.length > 0) {
        replayOperations(response.operations);
      }
      if (response.comments && response.comments.length > 0) {
        response.comments.forEach(comment => {
          comments.set(comment.id, comment);
        });
        renderCommentBubbles();
      }
    } else {
      showError(response.error);
    }
  });
});

function enterWhiteboard() {
  loginScreen.classList.add('hidden');
  whiteboardScreen.classList.remove('hidden');
  roomIdDisplay.textContent = currentRoomId;
  document.getElementById('createNickname').value = '';
  document.getElementById('joinRoomId').value = '';
  document.getElementById('joinNickname').value = '';
  initCanvas();
  updateUsersList();
  setupCommentEvents();
}

copyRoomIdBtn.addEventListener('click', () => {
  navigator.clipboard.writeText(currentRoomId).then(() => {
    copyRoomIdBtn.textContent = '已复制!';
    setTimeout(() => copyRoomIdBtn.textContent = '复制', 1500);
  });
});

leaveRoomBtn.addEventListener('click', () => {
  socket.disconnect();
  window.location.reload();
});

document.querySelectorAll('.tool-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentTool = btn.dataset.tool;
    hideTextInput();
  });
});

document.getElementById('strokeColor').addEventListener('input', (e) => {
  strokeColor = e.target.value;
});

document.getElementById('strokeWidth').addEventListener('input', (e) => {
  strokeWidth = parseInt(e.target.value);
});

function initCanvas() {
  tempCanvas = document.createElement('canvas');
  tempCanvas.width = canvas.width;
  tempCanvas.height = canvas.height;
  tempCtx = tempCanvas.getContext('2d');
  
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function getCanvasCoords(e) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left) * (canvas.width / rect.width),
    y: (e.clientY - rect.top) * (canvas.height / rect.height)
  };
}

canvas.addEventListener('mousedown', (e) => {
  if (currentTool === 'text') {
    const coords = getCanvasCoords(e);
    showTextInput(coords.x, coords.y);
    return;
  }
  
  isDrawing = true;
  const coords = getCanvasCoords(e);
  startX = coords.x;
  startY = coords.y;
  
  if (currentTool === 'free') {
    freehandPath = [{ x: startX, y: startY }];
  } else {
    tempCtx.clearRect(0, 0, tempCanvas.width, tempCanvas.height);
    tempCtx.drawImage(canvas, 0, 0);
  }
});

canvas.addEventListener('mousedown', (e) => {
  const coords = getCanvasCoords(e);
  
  if (currentTool === 'text') {
    showTextInput(coords.x, coords.y);
    return;
  }
  
  if (currentTool === 'eraser') {
    eraseAtPoint(coords.x, coords.y);
    return;
  }
  
  if (currentTool === 'select') {
    isSelecting = true;
    selectionStartX = coords.x;
    selectionStartY = coords.y;
    selectionEndX = coords.x;
    selectionEndY = coords.y;
    selectionLayer.classList.remove('hidden');
    updateSelectionVisual();
    return;
  }
  
  isDrawing = true;
  startX = coords.x;
  startY = coords.y;
  
  if (currentTool === 'free') {
    freehandPath = [{ x: startX, y: startY }];
  } else {
    tempCtx.clearRect(0, 0, tempCanvas.width, tempCanvas.height);
    tempCtx.drawImage(canvas, 0, 0);
  }
});

const emitCursorMove = throttle((coords) => {
  const dx = coords.x - lastMouseX;
  const dy = coords.y - lastMouseY;
  if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
    lastMouseX = coords.x;
    lastMouseY = coords.y;
    socket.emit('cursorMove', { 
      x: coords.x, 
      y: coords.y,
      t: Date.now()
    });
  }
}, THROTTLE_MS);

canvas.addEventListener('mousemove', (e) => {
  const coords = getCanvasCoords(e);
  emitCursorMove(coords);
  
  if (isSelecting) {
    selectionEndX = coords.x;
    selectionEndY = coords.y;
    updateSelectionVisual();
    return;
  }
  
  if (currentTool === 'eraser' && e.buttons === 1) {
    eraseAtPoint(coords.x, coords.y);
    return;
  }
  
  if (!isDrawing) return;
  
  if (currentTool === 'free') {
    freehandPath.push({ x: coords.x, y: coords.y });
    drawFreehandOnCanvas(ctx, freehandPath.slice(-2), strokeColor, strokeWidth);
  } else if (currentTool === 'rect' || currentTool === 'circle') {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(tempCanvas, 0, 0);
    
    if (currentTool === 'rect') {
      drawRectOnCanvas(ctx, startX, startY, coords.x, coords.y, strokeColor, strokeWidth);
    } else {
      drawCircleOnCanvas(ctx, startX, startY, coords.x, coords.y, strokeColor, strokeWidth);
    }
  }
});

canvas.addEventListener('mouseup', (e) => {
  if (isSelecting) {
    isSelecting = false;
    const x1 = Math.min(selectionStartX, selectionEndX);
    const y1 = Math.min(selectionStartY, selectionEndY);
    const x2 = Math.max(selectionStartX, selectionEndX);
    const y2 = Math.max(selectionStartY, selectionEndY);
    
    if (x2 - x1 > 10 && y2 - y1 > 10) {
      currentSelection = { x1, y1, x2, y2 };
      showCommentModalForSelection();
    }
    selectionLayer.classList.add('hidden');
    return;
  }
  
  if (!isDrawing) return;
  isDrawing = false;
  
  const coords = getCanvasCoords(e);
  let operation = null;
  
  if (currentTool === 'free' && freehandPath.length > 1) {
    operation = {
      type: 'free',
      path: [...freehandPath],
      color: strokeColor,
      width: strokeWidth
    };
    freehandPath = [];
  } else if (currentTool === 'rect') {
    operation = {
      type: 'rect',
      startX,
      startY,
      endX: coords.x,
      endY: coords.y,
      color: strokeColor,
      width: strokeWidth
    };
  } else if (currentTool === 'circle') {
    operation = {
      type: 'circle',
      startX,
      startY,
      endX: coords.x,
      endY: coords.y,
      color: strokeColor,
      width: strokeWidth
    };
  }
  
  if (operation) {
    socket.emit('draw', operation);
  }
});

canvas.addEventListener('mouseleave', () => {
  isDrawing = false;
  isSelecting = false;
  selectionLayer.classList.add('hidden');
});

function updateSelectionVisual() {
  const x1 = Math.min(selectionStartX, selectionEndX);
  const y1 = Math.min(selectionStartY, selectionEndY);
  const x2 = Math.max(selectionStartX, selectionEndX);
  const y2 = Math.max(selectionStartY, selectionEndY);
  
  selectionLayer.style.left = `${x1}px`;
  selectionLayer.style.top = `${y1}px`;
  selectionLayer.style.width = `${x2 - x1}px`;
  selectionLayer.style.height = `${y2 - y1}px`;
}

function eraseAtPoint(x, y) {
  const eraseRadius = strokeWidth * 3;
  const toErase = [];
  
  myDrawingIds.forEach(id => {
    const drawing = drawingsById.get(id);
    if (drawing && isDrawingAtPoint(drawing, x, y, eraseRadius)) {
      toErase.push(id);
    }
  });
  
  if (toErase.length > 0) {
    socket.emit('erase', { drawingIds: toErase });
    toErase.forEach(id => {
      drawingsById.delete(id);
      myDrawingIds.delete(id);
    });
    redrawAll();
  }
}

function isDrawingAtPoint(drawing, x, y, radius) {
  if (drawing.type === 'free') {
    return drawing.path.some(p => {
      const dx = p.x - x;
      const dy = p.y - y;
      return Math.sqrt(dx * dx + dy * dy) < radius;
    });
  } else if (drawing.type === 'rect') {
    const minX = Math.min(drawing.startX, drawing.endX);
    const maxX = Math.max(drawing.startX, drawing.endX);
    const minY = Math.min(drawing.startY, drawing.endY);
    const maxY = Math.max(drawing.startY, drawing.endY);
    return x >= minX - radius && x <= maxX + radius && 
           y >= minY - radius && y <= maxY + radius;
  } else if (drawing.type === 'circle') {
    const cx = (drawing.startX + drawing.endX) / 2;
    const cy = (drawing.startY + drawing.endY) / 2;
    const rx = Math.abs(drawing.endX - drawing.startX) / 2;
    const ry = Math.abs(drawing.endY - drawing.startY) / 2;
    const dx = (x - cx) / (rx + radius);
    const dy = (y - cy) / (ry + radius);
    return dx * dx + dy * dy <= 1;
  } else if (drawing.type === 'text') {
    return Math.abs(x - drawing.x) < 50 && 
           Math.abs(y - drawing.y) < 30;
  }
  return false;
}

function redrawAll() {
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  drawingsById.forEach(drawing => {
    drawOperation(drawing);
  });
}

function drawFreehandOnCanvas(context, path, color, width) {
  if (path.length < 2) return;
  context.beginPath();
  context.strokeStyle = color;
  context.lineWidth = width;
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.moveTo(path[0].x, path[0].y);
  for (let i = 1; i < path.length; i++) {
    context.lineTo(path[i].x, path[i].y);
  }
  context.stroke();
}

function drawRectOnCanvas(context, x1, y1, x2, y2, color, width) {
  context.beginPath();
  context.strokeStyle = color;
  context.lineWidth = width;
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.rect(x1, y1, x2 - x1, y2 - y1);
  context.stroke();
}

function drawCircleOnCanvas(context, x1, y1, x2, y2, color, width) {
  const centerX = (x1 + x2) / 2;
  const centerY = (y1 + y2) / 2;
  const radiusX = Math.abs(x2 - x1) / 2;
  const radiusY = Math.abs(y2 - y1) / 2;
  
  context.beginPath();
  context.strokeStyle = color;
  context.lineWidth = width;
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, 2 * Math.PI);
  context.stroke();
}

function drawTextOnCanvas(context, x, y, text, color, size) {
  context.fillStyle = color;
  context.font = `${size}px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`;
  context.textBaseline = 'top';
  context.fillText(text, x, y);
}

let textInputPos = { x: 0, y: 0 };

function showTextInput(x, y) {
  textInputPos = { x, y };
  const rect = canvas.getBoundingClientRect();
  const scaleX = rect.width / canvas.width;
  const scaleY = rect.height / canvas.height;
  
  textInputContainer.style.left = `${x * scaleX}px`;
  textInputContainer.style.top = `${y * scaleY}px`;
  textInputContainer.classList.remove('hidden');
  textInput.value = '';
  textInput.focus();
}

function hideTextInput() {
  textInputContainer.classList.add('hidden');
}

confirmTextBtn.addEventListener('click', () => {
  const text = textInput.value.trim();
  if (text) {
    const operation = {
      type: 'text',
      x: textInputPos.x,
      y: textInputPos.y,
      text,
      color: strokeColor,
      fontSize: 16 + strokeWidth * 2
    };
    drawTextOnCanvas(ctx, textInputPos.x, textInputPos.y, text, strokeColor, operation.fontSize);
    socket.emit('draw', operation);
  }
  hideTextInput();
});

cancelTextBtn.addEventListener('click', () => {
  hideTextInput();
});

textInput.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    hideTextInput();
  }
});

function replayOperations(operations) {
  if (!operations || operations.length === 0) return;
  
  const sorted = [...operations].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
  
  const batchSize = 50;
  let index = 0;
  
  function drawBatch() {
    const end = Math.min(index + batchSize, sorted.length);
    for (let i = index; i < end; i++) {
      const op = sorted[i];
      if (op.id) {
        drawingsById.set(op.id, op);
        if (op.userId === socket.id) {
          myDrawingIds.add(op.id);
        }
      }
      drawOperation(op);
    }
    index = end;
    
    if (index < sorted.length) {
      requestAnimationFrame(drawBatch);
    }
  }
  
  drawBatch();
}

function drawOperation(op) {
  switch (op.type) {
    case 'free':
      drawFreehandOnCanvas(ctx, op.path, op.color, op.width);
      break;
    case 'rect':
      drawRectOnCanvas(ctx, op.startX, op.startY, op.endX, op.endY, op.color, op.width);
      break;
    case 'circle':
      drawCircleOnCanvas(ctx, op.startX, op.startY, op.endX, op.endY, op.color, op.width);
      break;
    case 'text':
      drawTextOnCanvas(ctx, op.x, op.y, op.text, op.color, op.fontSize);
      break;
  }
}

socket.on('draw', (data) => {
  if (data.id) {
    drawingsById.set(data.id, data);
    if (data.userId === socket.id) {
      myDrawingIds.add(data.id);
    }
  }
  drawOperation(data);
});

socket.on('erased', (data) => {
  if (data.drawingIds) {
    data.drawingIds.forEach(id => {
      drawingsById.delete(id);
      myDrawingIds.delete(id);
    });
    redrawAll();
  }
});

socket.on('cursorMove', (data) => {
  queueRemoteCursorUpdate(data);
});

function queueRemoteCursorUpdate(data) {
  const { userId, x, y, nickname, t } = data;
  const now = Date.now();
  
  let queue = cursorUpdateQueue.get(userId);
  if (!queue) {
    queue = [];
    cursorUpdateQueue.set(userId, queue);
  }
  
  queue.push({ x, y, nickname, t: t || now });
  
  while (queue.length > 3) {
    queue.shift();
  }
  
  processCursorQueue(userId);
}

function processCursorQueue(userId) {
  const queue = cursorUpdateQueue.get(userId);
  if (!queue || queue.length === 0) return;
  
  const now = Date.now();
  let target = queue[queue.length - 1];
  
  if (queue.length >= 2) {
    const prev = queue[0];
    const next = queue[1];
    const totalDuration = next.t - prev.t;
    
    if (totalDuration > 0) {
      const elapsed = now - prev.t;
      const progress = Math.min(Math.max(elapsed / THROTTLE_MS, 0), 1);
      
      const interpolatedX = prev.x + (next.x - prev.x) * progress;
      const interpolatedY = prev.y + (next.y - prev.y) * progress;
      
      updateRemoteCursor(userId, interpolatedX, interpolatedY, target.nickname);
      
      if (progress >= 1) {
        queue.shift();
      }
    } else {
      updateRemoteCursor(userId, target.x, target.y, target.nickname);
      queue.shift();
    }
  } else {
    updateRemoteCursor(userId, target.x, target.y, target.nickname);
    queue.shift();
  }
  
  if (queue.length > 0) {
    requestAnimationFrame(() => processCursorQueue(userId));
  }
}

function updateRemoteCursor(userId, x, y, nickname) {
  let cursor = remoteCursors.get(userId);
  
  if (!cursor) {
    cursor = document.createElement('div');
    cursor.className = 'remote-cursor';
    cursor.innerHTML = `
      <div class="remote-cursor-dot" style="background: ${getCursorColor(userId)}"></div>
      <div class="remote-cursor-name">${nickname || '用户'}</div>
    `;
    cursorLayer.appendChild(cursor);
    remoteCursors.set(userId, cursor);
  }
  
  const rect = canvas.getBoundingClientRect();
  const scaleX = rect.width / canvas.width;
  const scaleY = rect.height / canvas.height;
  
  cursor.style.left = `${x * scaleX}px`;
  cursor.style.top = `${y * scaleY}px`;
}

function getCursorColor(userId) {
  if (!users.has(userId)) {
    users.set(userId, getRandomColor());
  }
  return users.get(userId);
}

socket.on('userJoined', (data) => {
  users.set(data.id, getRandomColor());
  updateUsersList();
});

socket.on('userLeft', (data) => {
  users.delete(data.id);
  const cursor = remoteCursors.get(data.id);
  if (cursor) {
    cursor.remove();
    remoteCursors.delete(data.id);
  }
  updateUsersList();
});

socket.on('roomUsers', (data) => {
  data.users.forEach(user => {
    if (!users.has(user.id)) {
      users.set(user.id, getRandomColor());
    }
  });
  updateUsersList();
});

function updateUsersList() {
  usersList.innerHTML = '';
  const userEntries = Array.from(users.entries());
  if (userEntries.length === 0) {
    usersList.innerHTML = '<div style="color: #999; font-size: 14px;">暂无用户</div>';
    return;
  }
  
  userEntries.forEach(([id, color]) => {
    const item = document.createElement('div');
    item.className = 'user-item';
    item.innerHTML = `
      <div class="user-color" style="background: ${color}"></div>
      <span class="user-name">${id === socket.id ? currentNickname + ' (我)' : '其他用户'}</span>
    `;
    usersList.appendChild(item);
  });
}

window.addEventListener('resize', () => {
  remoteCursors.forEach((cursor, userId) => {
    const saved = cursor.dataset;
    if (saved.lastX !== undefined && saved.lastY !== undefined) {
      updateRemoteCursor(userId, parseFloat(saved.lastX), parseFloat(saved.lastY), saved.lastName);
    }
  });
});

function showCommentModalForSelection() {
  if (!currentSelection) return;
  
  const { x1, y1, x2, y2 } = currentSelection;
  const thumbnailCanvas = document.createElement('canvas');
  const thumbCtx = thumbnailCanvas.getContext('2d');
  
  const width = x2 - x1;
  const height = y2 - y1;
  thumbnailCanvas.width = Math.min(200, width);
  thumbnailCanvas.height = Math.min(150, height);
  
  thumbCtx.drawImage(
    canvas,
    x1, y1, width, height,
    0, 0, thumbnailCanvas.width, thumbnailCanvas.height
  );
  
  commentPreview.src = thumbnailCanvas.toDataURL('image/png');
  commentText.value = '';
  commentModal.classList.remove('hidden');
}

function hideCommentModal() {
  commentModal.classList.add('hidden');
  currentSelection = null;
}

function submitComment() {
  const text = commentText.value.trim();
  if (!text || !currentSelection) return;
  
  const { x1, y1, x2, y2 } = currentSelection;
  const thumbnailCanvas = document.createElement('canvas');
  const thumbCtx = thumbnailCanvas.getContext('2d');
  
  const width = x2 - x1;
  const height = y2 - y1;
  thumbnailCanvas.width = Math.min(200, width);
  thumbnailCanvas.height = Math.min(150, height);
  
  thumbCtx.drawImage(
    canvas,
    x1, y1, width, height,
    0, 0, thumbnailCanvas.width, thumbnailCanvas.height
  );
  
  const thumbnail = thumbnailCanvas.toDataURL('image/png');
  
  const commentData = {
    text,
    thumbnail,
    selection: currentSelection
  };
  
  socket.emit('addComment', commentData, (response) => {
    if (response.success) {
      comments.set(response.comment.id, response.comment);
      renderCommentBubbles();
    }
  });
  
  hideCommentModal();
}

function renderCommentBubbles() {
  commentsLayer.innerHTML = '';
  
  comments.forEach((comment, id) => {
    const bubble = document.createElement('div');
    bubble.className = 'comment-bubble';
    if (comment.userId === socket.id) {
      bubble.classList.add('has-mine');
    }
    
    const x = (comment.selection.x1 + comment.selection.x2) / 2;
    const y = (comment.selection.y1 + comment.selection.y2) / 2;
    bubble.style.left = `${x - 16}px`;
    bubble.style.top = `${y - 16}px`;
    
    bubble.addEventListener('click', () => showCommentZoom(comment));
    commentsLayer.appendChild(bubble);
  });
}

let currentZoomedComment = null;

function showCommentZoom(comment) {
  currentZoomedComment = comment;
  
  const zoomContainer = zoomOverlay.querySelector('.zoom-container');
  zoomImage.src = comment.thumbnail;
  
  const authorEl = zoomOverlay.querySelector('.comment-author');
  const textEl = zoomOverlay.querySelector('.comment-text');
  const timeEl = zoomOverlay.querySelector('.comment-time');
  
  authorEl.textContent = comment.userName || '未知用户';
  textEl.textContent = comment.text;
  
  const date = new Date(comment.timestamp);
  timeEl.textContent = date.toLocaleString('zh-CN');
  
  if (comment.userId === socket.id) {
    deleteCommentBtn.classList.remove('hidden');
  } else {
    deleteCommentBtn.classList.add('hidden');
  }
  
  zoomOverlay.classList.remove('hidden');
}

function hideZoomOverlay() {
  zoomOverlay.classList.add('hidden');
  currentZoomedComment = null;
}

function deleteCurrentComment() {
  if (!currentZoomedComment || currentZoomedComment.userId !== socket.id) return;
  
  socket.emit('deleteComment', { commentId: currentZoomedComment.id });
  comments.delete(currentZoomedComment.id);
  renderCommentBubbles();
  hideZoomOverlay();
}

function setupCommentEvents() {
  cancelCommentBtn.addEventListener('click', hideCommentModal);
  submitCommentBtn.addEventListener('click', submitComment);
  closeZoomBtn.addEventListener('click', hideZoomOverlay);
  deleteCommentBtn.addEventListener('click', deleteCurrentComment);
  
  zoomOverlay.addEventListener('click', (e) => {
    if (e.target === zoomOverlay) {
      hideZoomOverlay();
    }
  });
}

socket.on('commentAdded', (comment) => {
  comments.set(comment.id, comment);
  renderCommentBubbles();
});

socket.on('commentDeleted', (data) => {
  if (data.commentId) {
    comments.delete(data.commentId);
    renderCommentBubbles();
  }
});
