let scene, camera, renderer, raycaster, mouse;
let blocks = {};
let blockLocks = {};
let selectedBlock = null;
let currentTool = 'select';
let ws = null;
let userId = null;
let roomId = null;
let userName = null;
let remoteCursors = {};
let userColors = {};
let originalColors = {};

let terrainMesh = null;
let terrainSegments = 50;
let terrainSize = 50;
let brushSize = 3;
let brushStrength = 0.5;
let isSculpting = false;

function generateUserId() {
    return 'user_' + Math.random().toString(36).substr(2, 9);
}

function getUserColor(id) {
    if (!userColors[id]) {
        const hue = Math.abs(id.split('').reduce((a, b) => a + b.charCodeAt(0), 0)) % 360;
        userColors[id] = `hsl(${hue}, 70%, 50%)`;
    }
    return userColors[id];
}

function initThreeJS() {
    const canvas = document.getElementById('scene-canvas');
    
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0a1a);
    
    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(15, 15, 15);
    camera.lookAt(0, 0, 0);
    
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setSize(window.innerWidth - 300, window.innerHeight);
    renderer.shadowMap.enabled = true;
    
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(10, 20, 10);
    directionalLight.castShadow = true;
    scene.add(directionalLight);
    
    raycaster = new THREE.Raycaster();
    mouse = new THREE.Vector2();
    
    canvas.addEventListener('click', onCanvasClick);
    canvas.addEventListener('mousedown', onCanvasMouseDown);
    canvas.addEventListener('mousemove', onCanvasMouseMove);
    canvas.addEventListener('mouseup', onCanvasMouseUp);
    window.addEventListener('resize', onWindowResize);
    document.addEventListener('keydown', onKeyDown);
    
    animate();
}

function createBlockGeometry(type) {
    switch(type) {
        case 'box':
            return new THREE.BoxGeometry(1, 1, 1);
        case 'cylinder':
            return new THREE.CylinderGeometry(0.5, 0.5, 1, 32);
        case 'sphere':
            return new THREE.SphereGeometry(0.5, 32, 32);
        default:
            return new THREE.BoxGeometry(1, 1, 1);
    }
}

function createBlock(data) {
    const geometry = createBlockGeometry(data.type);
    const material = new THREE.MeshLambertMaterial({ color: data.color });
    const mesh = new THREE.Mesh(geometry, material);
    
    mesh.position.set(data.position.x, data.position.y, data.position.z);
    mesh.scale.set(data.scale.x, data.scale.y, data.scale.z);
    mesh.rotation.set(data.rotation.x, data.rotation.y, data.rotation.z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.id = data.id;
    mesh.userData.data = data;
    
    originalColors[data.id] = data.color;
    
    if (data.locked_by && data.locked_by !== userId) {
        mesh.material.color.setHex(0xff0000);
    }
    
    scene.add(mesh);
    blocks[data.id] = mesh;
    
    return mesh;
}

function createTerrain(terrainData) {
    if (terrainMesh) {
        scene.remove(terrainMesh);
        terrainMesh.geometry.dispose();
        terrainMesh.material.dispose();
    }
    
    terrainSize = terrainData.size || 50;
    terrainSegments = terrainData.segments || 50;
    
    const geometry = new THREE.PlaneBufferGeometry(terrainSize, terrainSize, terrainSegments, terrainSegments);
    geometry.rotateX(-Math.PI / 2);
    
    if (terrainData.heights && terrainData.heights.length > 0) {
        const positions = geometry.attributes.position.array;
        for (let i = 0; i < terrainData.heights.length && i * 3 + 1 < positions.length; i++) {
            positions[i * 3 + 1] = terrainData.heights[i];
        }
        geometry.computeVertexNormals();
        geometry.attributes.position.needsUpdate = true;
    }
    
    const material = new THREE.MeshLambertMaterial({ 
        color: 0x4CAF50,
        side: THREE.DoubleSide
    });
    
    terrainMesh = new THREE.Mesh(geometry, material);
    terrainMesh.receiveShadow = true;
    terrainMesh.userData.isTerrain = true;
    scene.add(terrainMesh);
}

function updateTerrainVertices(indices, heights) {
    if (!terrainMesh) return;
    
    const positions = terrainMesh.geometry.attributes.position.array;
    
    for (let i = 0; i < indices.length; i++) {
        const idx = indices[i];
        if (idx * 3 + 1 < positions.length) {
            positions[idx * 3 + 1] = heights[i];
        }
    }
    
    terrainMesh.geometry.computeVertexNormals();
    terrainMesh.geometry.attributes.position.needsUpdate = true;
}

function getVertexIndexFromWorldPosition(x, z) {
    const halfSize = terrainSize / 2;
    const segmentSize = terrainSize / terrainSegments;
    
    const col = Math.round((x + halfSize) / segmentSize);
    const row = Math.round((z + halfSize) / segmentSize);
    
    if (col < 0 || col > terrainSegments || row < 0 || row > terrainSegments) {
        return -1;
    }
    
    return row * (terrainSegments + 1) + col;
}

function sculptTerrain(intersect, type) {
    if (!terrainMesh) return;
    
    const point = intersect.point;
    const centerIdx = getVertexIndexFromWorldPosition(point.x, point.z);
    
    if (centerIdx < 0) return;
    
    if (type === 'terrain_smooth') {
        sendTerrainSmooth(centerIdx, brushSize, brushStrength);
    } else {
        const affectedIndices = [];
        const newHeights = [];
        const positions = terrainMesh.geometry.attributes.position.array;
        const n = terrainSegments + 1;
        
        const centerRow = Math.floor(centerIdx / n);
        const centerCol = centerIdx % n;
        
        for (let i = -brushSize; i <= brushSize; i++) {
            for (let j = -brushSize; j <= brushSize; j++) {
                const row = centerRow + i;
                const col = centerCol + j;
                
                if (row >= 0 && row < n && col >= 0 && col < n) {
                    const idx = row * n + col;
                    const dist = Math.sqrt(i * i + j * j);
                    
                    if (dist <= brushSize) {
                        const falloff = 1 - (dist / brushSize);
                        const posIdx = idx * 3 + 1;
                        
                        if (posIdx < positions.length) {
                            const delta = type === 'terrain_raise' ? brushStrength : -brushStrength;
                            const newHeight = positions[posIdx] + delta * falloff;
                            
                            affectedIndices.push(idx);
                            newHeights.push(newHeight);
                        }
                    }
                }
            }
        }
        
        if (affectedIndices.length > 0) {
            sendTerrainUpdate(affectedIndices, newHeights);
        }
    }
}

function sendTerrainUpdate(indices, heights) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            type: 'terrain_update',
            indices: indices,
            heights: heights
        }));
    }
}

function sendTerrainSmooth(centerIdx, radius, strength) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            type: 'terrain_smooth',
            center_idx: centerIdx,
            radius: radius,
            strength: strength
        }));
    }
}

function updateBlockVisualState(blockId) {
    const block = blocks[blockId];
    if (!block) return;
    
    const lockHolder = blockLocks[blockId];
    if (lockHolder && lockHolder !== userId) {
        block.material.color.setHex(0xff0000);
    } else {
        block.material.color.set(originalColors[blockId] || block.userData.data.color);
    }
    
    if (selectedBlock && selectedBlock.userData.id === blockId) {
        selectedBlock.material.emissive.setHex(0x333333);
    }
}

function updateBlock(id, data) {
    const block = blocks[id];
    if (block) {
        block.position.set(data.position.x, data.position.y, data.position.z);
        block.scale.set(data.scale.x, data.scale.y, data.scale.z);
        block.rotation.set(data.rotation.x, data.rotation.y, data.rotation.z);
        block.userData.data = data;
        updateBlockVisualState(id);
    }
}

function deleteBlock(id) {
    const block = blocks[id];
    if (block) {
        scene.remove(block);
        block.geometry.dispose();
        block.material.dispose();
        delete blocks[id];
        delete originalColors[id];
        delete blockLocks[id];
    }
}

function clearAllBlocks() {
    for (const id in blocks) {
        deleteBlock(id);
    }
    selectedBlock = null;
    blockLocks = {};
    updateTransformPanel();
}

function sendLockRequest(blockId) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            type: 'lock_block',
            block_id: blockId
        }));
    }
}

function sendUnlockRequest(blockId) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            type: 'unlock_block',
            block_id: blockId
        }));
    }
}

function onCanvasClick(event) {
    const canvas = document.getElementById('scene-canvas');
    const rect = canvas.getBoundingClientRect();
    
    mouse.x = ((event.clientX - rect.left) / canvas.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / canvas.height) * 2 + 1;
    
    raycaster.setFromCamera(mouse, camera);
    const blockIntersects = raycaster.intersectObjects(Object.values(blocks));
    const terrainIntersects = terrainMesh ? raycaster.intersectObject(terrainMesh) : [];
    
    if (['terrain_raise', 'terrain_lower', 'terrain_smooth'].includes(currentTool)) {
        if (terrainIntersects.length > 0) {
            sculptTerrain(terrainIntersects[0], currentTool);
        }
    } else if (currentTool === 'select') {
        if (blockIntersects.length > 0) {
            const clickedBlock = blockIntersects[0].object;
            const blockId = clickedBlock.userData.id;
            const lockHolder = blockLocks[blockId];
            
            if (lockHolder && lockHolder !== userId) {
                showToast(`物体被 ${lockHolder} 锁定，无法编辑`);
                return;
            }
            
            sendLockRequest(blockId);
            selectBlock(clickedBlock);
        } else {
            if (selectedBlock) {
                const blockId = selectedBlock.userData.id;
                sendUnlockRequest(blockId);
            }
            deselectBlock();
        }
    } else if (currentTool === 'delete') {
        if (blockIntersects.length > 0) {
            const blockId = blockIntersects[0].object.userData.id;
            const lockHolder = blockLocks[blockId];
            
            if (lockHolder && lockHolder !== userId) {
                showToast(`物体被 ${lockHolder} 锁定，无法删除`);
                return;
            }
            
            sendDeleteBlock(blockId);
        }
    } else if (['box', 'cylinder', 'sphere'].includes(currentTool)) {
        const groundIntersects = raycaster.intersectObject(createGroundPlane());
        if (groundIntersects.length > 0) {
            const point = groundIntersects[0].point;
            const newBlock = {
                id: 'block_' + Date.now(),
                type: currentTool,
                position: { x: Math.round(point.x), y: 0.5, z: Math.round(point.z) },
                rotation: { x: 0, y: 0, z: 0 },
                scale: { 
                    x: parseFloat(document.getElementById('scale-x').value) || 1,
                    y: parseFloat(document.getElementById('scale-y').value) || 1,
                    z: parseFloat(document.getElementById('scale-z').value) || 1
                },
                color: document.getElementById('block-color').value,
                timestamp: Date.now(),
                locked_by: null
            };
            sendAddBlock(newBlock);
        }
    }
}

function onCanvasMouseDown(event) {
    isSculpting = true;
}

function onCanvasMouseUp(event) {
    isSculpting = false;
}

function createGroundPlane() {
    const geometry = new THREE.PlaneGeometry(100, 100);
    const material = new THREE.MeshBasicMaterial({ visible: false });
    const plane = new THREE.Mesh(geometry, material);
    plane.rotation.x = -Math.PI / 2;
    return plane;
}

function onCanvasMouseMove(event) {
    const canvas = document.getElementById('scene-canvas');
    const rect = canvas.getBoundingClientRect();
    
    mouse.x = ((event.clientX - rect.left) / canvas.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / canvas.height) * 2 + 1;
    
    raycaster.setFromCamera(mouse, camera);
    const groundPlane = createGroundPlane();
    const groundIntersects = raycaster.intersectObject(groundPlane);
    
    if (groundIntersects.length > 0) {
        const point = groundIntersects[0].point;
        sendCursorUpdate({ x: point.x, y: 0.1, z: point.z });
    }
    
    const isDragging = event.buttons === 1;
    
    if (isDragging && ['terrain_raise', 'terrain_lower', 'terrain_smooth'].includes(currentTool)) {
        const terrainIntersects = terrainMesh ? raycaster.intersectObject(terrainMesh) : [];
        if (terrainIntersects.length > 0) {
            sculptTerrain(terrainIntersects[0], currentTool);
        }
    } else if (isDragging && selectedBlock && currentTool === 'select') {
        const blockId = selectedBlock.userData.id;
        const lockHolder = blockLocks[blockId];
        
        if (lockHolder && lockHolder !== userId) {
            return;
        }
        
        const groundIntersects = raycaster.intersectObject(createGroundPlane());
        if (groundIntersects.length > 0) {
            const point = groundIntersects[0].point;
            const data = selectedBlock.userData.data;
            data.position.x = Math.round(point.x);
            data.position.z = Math.round(point.z);
            data.timestamp = Date.now();
            sendUpdateBlock(data.id, data);
        }
    }
}

function selectBlock(block) {
    if (selectedBlock) {
        selectedBlock.material.emissive.setHex(0x000000);
    }
    selectedBlock = block;
    block.material.emissive.setHex(0x333333);
    updateTransformPanel();
}

function deselectBlock() {
    if (selectedBlock) {
        selectedBlock.material.emissive.setHex(0x000000);
        selectedBlock = null;
        updateTransformPanel();
    }
}

function updateTransformPanel() {
    if (selectedBlock) {
        const data = selectedBlock.userData.data;
        document.getElementById('pos-x').value = data.position.x.toFixed(1);
        document.getElementById('pos-y').value = data.position.y.toFixed(1);
        document.getElementById('pos-z').value = data.position.z.toFixed(1);
        document.getElementById('scale-x').value = data.scale.x.toFixed(1);
        document.getElementById('scale-y').value = data.scale.y.toFixed(1);
        document.getElementById('scale-z').value = data.scale.z.toFixed(1);
    } else {
        document.getElementById('pos-x').value = '';
        document.getElementById('pos-y').value = '';
        document.getElementById('pos-z').value = '';
    }
}

function onWindowResize() {
    const canvas = document.getElementById('scene-canvas');
    camera.aspect = (window.innerWidth - 300) / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth - 300, window.innerHeight);
}

function onKeyDown(event) {
    if (selectedBlock && currentTool === 'select') {
        const blockId = selectedBlock.userData.id;
        const lockHolder = blockLocks[blockId];
        
        if (lockHolder && lockHolder !== userId) {
            showToast(`物体被 ${lockHolder} 锁定，无法编辑`);
            return;
        }
        
        const data = selectedBlock.userData.data;
        const step = 0.5;
        
        switch(event.key) {
            case 'ArrowUp':
                data.position.z -= step;
                break;
            case 'ArrowDown':
                data.position.z += step;
                break;
            case 'ArrowLeft':
                data.position.x -= step;
                break;
            case 'ArrowRight':
                data.position.x += step;
                break;
            case 'PageUp':
                data.position.y += step;
                break;
            case 'PageDown':
                data.position.y = Math.max(0, data.position.y - step);
                break;
            case 'Delete':
                sendDeleteBlock(data.id);
                return;
            default:
                return;
        }
        data.timestamp = Date.now();
        sendUpdateBlock(data.id, data);
    }
}

function animate() {
    requestAnimationFrame(animate);
    
    const time = Date.now() * 0.0005;
    camera.position.x = 15 * Math.cos(time);
    camera.position.z = 15 * Math.sin(time);
    camera.lookAt(0, 0, 0);
    
    renderer.render(scene, camera);
}

function connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/${roomId}/${userId}`;
    ws = new WebSocket(wsUrl);
    
    ws.onopen = () => {
        ws.send(JSON.stringify({
            type: 'join',
            user_name: userName
        }));
    };
    
    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        handleWebSocketMessage(data);
    };
    
    ws.onclose = () => {
        console.log('WebSocket disconnected');
    };
    
    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
    };
}

function handleWebSocketMessage(data) {
    switch(data.type) {
        case 'init':
            if (data.terrain) {
                createTerrain(data.terrain);
            }
            data.blocks.forEach(block => createBlock(block));
            blockLocks = data.block_locks || {};
            for (const blockId in blockLocks) {
                updateBlockVisualState(blockId);
            }
            updateUserList(data.users);
            break;
        case 'add_block':
            createBlock(data.block);
            break;
        case 'update_block':
            if (blocks[data.block_id]) {
                const localBlock = blocks[data.block_id].userData.data;
                const remoteBlock = data.block;
                
                if (remoteBlock.timestamp >= localBlock.timestamp) {
                    updateBlock(data.block_id, data.block);
                }
            }
            break;
        case 'delete_block':
            deleteBlock(data.block_id);
            break;
        case 'user_joined':
        case 'user_left':
            updateUserList(data.users);
            break;
        case 'cursor_update':
            if (data.user_id !== userId) {
                updateRemoteCursor(data.user_id, data.cursor);
            }
            break;
        case 'terrain_update':
            updateTerrainVertices(data.indices, data.heights);
            break;
        case 'clear_scene':
            clearAllBlocks();
            if (data.reset_terrain) {
                createTerrain({ size: terrainSize, segments: terrainSegments, heights: [] });
            }
            break;
        case 'load_template':
            clearAllBlocks();
            data.blocks.forEach(block => createBlock(block));
            break;
        case 'scene_saved':
            downloadScene(data.data);
            break;
        case 'block_locked':
            blockLocks[data.block_id] = data.locked_by;
            updateBlockVisualState(data.block_id);
            break;
        case 'block_unlocked':
            delete blockLocks[data.block_id];
            updateBlockVisualState(data.block_id);
            break;
        case 'lock_denied':
            showToast(`无法锁定物体，已被 ${data.locked_by} 占用`);
            break;
        case 'update_denied':
            showToast(`更新被拒绝，物体被 ${data.locked_by} 锁定`);
            if (data.current_block && blocks[data.block_id]) {
                updateBlock(data.block_id, data.current_block);
            }
            break;
        case 'delete_denied':
            showToast(`删除被拒绝，物体被 ${data.locked_by} 锁定`);
            break;
        case 'clear_denied':
        case 'load_denied':
            showToast(data.message);
            break;
        case 'all_unlocked_by':
            for (const blockId in blockLocks) {
                if (blockLocks[blockId] === data.user_id) {
                    delete blockLocks[blockId];
                    updateBlockVisualState(blockId);
                }
            }
            break;
    }
}

function sendAddBlock(block) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            type: 'add_block',
            block: block
        }));
    }
}

function sendUpdateBlock(blockId, block) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            type: 'update_block',
            block_id: blockId,
            block: block
        }));
    }
}

function sendDeleteBlock(blockId) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            type: 'delete_block',
            block_id: blockId
        }));
    }
}

function sendCursorUpdate(position) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            type: 'cursor_update',
            cursor: position
        }));
    }
}

function updateRemoteCursor(userId, position) {
    let cursorEl = remoteCursors[userId];
    if (!cursorEl) {
        cursorEl = document.createElement('div');
        cursorEl.className = 'remote-cursor';
        cursorEl.innerHTML = `
            <div class="remote-cursor-dot" style="background-color: ${getUserColor(userId)}"></div>
            <div class="remote-cursor-label" style="background-color: ${getUserColor(userId)}">${userId}</div>
        `;
        document.getElementById('cursor-overlays').appendChild(cursorEl);
        remoteCursors[userId] = cursorEl;
    }
    
    const vector = new THREE.Vector3(position.x, position.y, position.z);
    vector.project(camera);
    
    const canvas = document.getElementById('scene-canvas');
    const x = (vector.x * 0.5 + 0.5) * canvas.width;
    const y = (-vector.y * 0.5 + 0.5) * canvas.height;
    
    cursorEl.style.left = (x - 8) + 'px';
    cursorEl.style.top = (y - 8) + 'px';
}

function updateUserList(users) {
    const listEl = document.getElementById('users');
    listEl.innerHTML = '';
    
    users.forEach(user => {
        const li = document.createElement('li');
        li.innerHTML = `
            <span class="user-cursor-dot" style="background-color: ${getUserColor(user.id)}"></span>
            ${user.name}
        `;
        listEl.appendChild(li);
    });
}

function downloadScene(sceneData) {
    const dataStr = JSON.stringify(sceneData, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `scene_${roomId}_${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(url);
}

function showToast(message) {
    let toast = document.getElementById('toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'toast';
        toast.style.cssText = `
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: linear-gradient(135deg, #ff6b6b, #ee5a24);
            color: white;
            padding: 12px 24px;
            border-radius: 8px;
            font-size: 14px;
            font-weight: 500;
            z-index: 10000;
            box-shadow: 0 4px 15px rgba(0,0,0,0.3);
            opacity: 0;
            transition: opacity 0.3s;
        `;
        document.body.appendChild(toast);
    }
    
    toast.textContent = message;
    toast.style.opacity = '1';
    
    setTimeout(() => {
        toast.style.opacity = '0';
    }, 3000);
}

function loadTemplates() {
    fetch('/templates')
        .then(res => res.json())
        .then(data => {
            const select = document.getElementById('template-select');
            data.templates.forEach(template => {
                const option = document.createElement('option');
                option.value = template;
                option.textContent = template;
                select.appendChild(option);
            });
        });
}

function loadRoomList() {
    fetch('/rooms')
        .then(res => res.json())
        .then(data => {
            const listEl = document.getElementById('rooms');
            listEl.innerHTML = '';
            
            if (data.rooms.length === 0) {
                const li = document.createElement('li');
                li.textContent = '暂无房间';
                listEl.appendChild(li);
            } else {
                data.rooms.forEach(room => {
                    const li = document.createElement('li');
                    li.innerHTML = `
                        <span>${room.id}</span>
                        <span class="user-count">${room.user_count} 用户</span>
                    `;
                    li.onclick = () => {
                        document.getElementById('room-id').value = room.id;
                    };
                    listEl.appendChild(li);
                });
            }
        });
}

function initUI() {
    document.querySelectorAll('.tool-btn').forEach(btn => {
        btn.onclick = () => {
            document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentTool = btn.dataset.tool;
        };
    });
    document.querySelector('.tool-btn[data-tool="select"]').classList.add('active');
    
    document.getElementById('brush-size').addEventListener('input', (e) => {
        brushSize = parseInt(e.target.value);
        document.getElementById('brush-size-value').textContent = brushSize;
    });
    
    document.getElementById('brush-strength').addEventListener('input', (e) => {
        brushStrength = parseFloat(e.target.value);
        document.getElementById('brush-strength-value').textContent = brushStrength.toFixed(1);
    });
    
    ['pos-x', 'pos-y', 'pos-z', 'scale-x', 'scale-y', 'scale-z'].forEach(id => {
        document.getElementById(id).addEventListener('change', () => {
            if (selectedBlock) {
                const blockId = selectedBlock.userData.id;
                const lockHolder = blockLocks[blockId];
                
                if (lockHolder && lockHolder !== userId) {
                    showToast(`物体被 ${lockHolder} 锁定，无法编辑`);
                    updateTransformPanel();
                    return;
                }
                
                const data = selectedBlock.userData.data;
                data.position.x = parseFloat(document.getElementById('pos-x').value) || 0;
                data.position.y = parseFloat(document.getElementById('pos-y').value) || 0;
                data.position.z = parseFloat(document.getElementById('pos-z').value) || 0;
                data.scale.x = parseFloat(document.getElementById('scale-x').value) || 1;
                data.scale.y = parseFloat(document.getElementById('scale-y').value) || 1;
                data.scale.z = parseFloat(document.getElementById('scale-z').value) || 1;
                data.timestamp = Date.now();
                sendUpdateBlock(data.id, data);
            }
        });
    });
    
    document.getElementById('load-template').onclick = () => {
        const template = document.getElementById('template-select').value;
        if (template && ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
                type: 'load_template',
                template_name: template
            }));
        }
    };
    
    document.getElementById('save-scene').onclick = () => {
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'save_scene' }));
        }
    };
    
    document.getElementById('clear-scene').onclick = () => {
        if (confirm('确定要清空场景吗？') && ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'clear_scene' }));
        }
    };
    
    document.getElementById('join-btn').onclick = async () => {
        userName = document.getElementById('username').value || '用户';
        let inputRoomId = document.getElementById('room-id').value.trim();
        
        if (!inputRoomId) {
            const res = await fetch('/rooms', { method: 'POST' });
            const data = await res.json();
            roomId = data.room_id;
        } else {
            roomId = inputRoomId;
        }
        
        userId = generateUserId();
        
        document.getElementById('login-modal').classList.add('hidden');
        document.getElementById('app').classList.remove('hidden');
        document.getElementById('current-room').textContent = roomId;
        document.getElementById('current-user').textContent = userName;
        
        initThreeJS();
        connectWebSocket();
    };
    
    loadTemplates();
    loadRoomList();
}

window.onload = initUI;
