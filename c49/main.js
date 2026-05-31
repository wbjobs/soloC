import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const LIGHT_STATE = {
    RED: 0,
    YELLOW: 1,
    GREEN: 2
};

let scene, camera, renderer, controls;
let roadNetwork = null;
let vehicleMeshes = [];
let trafficLightMeshes = new Map();
let worker = null;
let isPaused = false;
let frameCount = 0;
let lastFpsUpdate = 0;
const MAX_VEHICLES = 500;
const dummy = new THREE.Object3D();
let selectedNode = null;
let nodeMarkers = [];
let placeLightMode = false;

const container = document.getElementById('canvas-container');
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

const vehicleColors = [
    new THREE.Color(0xff5252),
    new THREE.Color(0x4fc3f7),
    new THREE.Color(0x81c784),
    new THREE.Color(0xffb74d),
    new THREE.Color(0xba68c8),
    new THREE.Color(0xe57373)
];

const lightColors = [
    new THREE.Color(0xff0000),
    new THREE.Color(0xffff00),
    new THREE.Color(0x00ff00)
];

async function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0a1a);
    scene.fog = new THREE.Fog(0x0a0a1a, 300, 800);

    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 400, 400);
    camera.lookAt(0, 0, 0);

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.maxPolarAngle = Math.PI / 2.1;
    controls.minDistance = 100;
    controls.maxDistance = 700;

    setupLighting();
    createGround();

    try {
        const response = await fetch('road-network.json');
        roadNetwork = await response.json();
        createRoadNetwork();
        createNodeMarkers();
        initVehicleMeshes();
        initWorker();
        setupEventListeners();
    } catch (error) {
        console.error('加载路网数据失败:', error);
    }

    window.addEventListener('resize', onWindowResize);
    setupUIControls();
    
    document.getElementById('loading').style.display = 'none';
    
    animate();
}

function setupLighting() {
    const ambientLight = new THREE.AmbientLight(0x404060, 0.6);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.2);
    directionalLight.position.set(100, 200, 100);
    directionalLight.castShadow = true;
    directionalLight.shadow.mapSize.width = 1024;
    directionalLight.shadow.mapSize.height = 1024;
    directionalLight.shadow.camera.near = 0.5;
    directionalLight.shadow.camera.far = 600;
    directionalLight.shadow.camera.left = -300;
    directionalLight.shadow.camera.right = 300;
    directionalLight.shadow.camera.top = 300;
    directionalLight.shadow.camera.bottom = -300;
    scene.add(directionalLight);

    const hemisphereLight = new THREE.HemisphereLight(0x87ceeb, 0x362d1c, 0.4);
    scene.add(hemisphereLight);
}

function createGround() {
    const groundGeometry = new THREE.PlaneGeometry(1000, 1000);
    const groundMaterial = new THREE.MeshStandardMaterial({
        color: 0x1a1a2e,
        roughness: 0.9,
        metalness: 0.1
    });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    const gridHelper = new THREE.GridHelper(1000, 50, 0x2a2a4e, 0x1a1a3e);
    gridHelper.position.y = 0.01;
    scene.add(gridHelper);
}

function createRoadNetwork() {
    const roadMaterial = new THREE.MeshStandardMaterial({
        color: 0x2d2d2d,
        roughness: 0.8,
        metalness: 0.2
    });

    const edgeMaterial = new THREE.LineBasicMaterial({ color: 0x4a4a6a, linewidth: 2 });

    roadNetwork.edges.forEach(edge => {
        const fromNode = roadNetwork.nodes.find(n => n.id === edge.from);
        const toNode = roadNetwork.nodes.find(n => n.id === edge.to);

        if (fromNode && toNode) {
            const points = [];
            points.push(new THREE.Vector3(fromNode.x, 0.1, fromNode.z));
            points.push(new THREE.Vector3(toNode.x, 0.1, toNode.z));

            const lineGeometry = new THREE.BufferGeometry().setFromPoints(points);
            const line = new THREE.Line(lineGeometry, edgeMaterial);
            scene.add(line);

            const roadWidth = 6 + edge.lanes * 3;
            const dx = toNode.x - fromNode.x;
            const dz = toNode.z - fromNode.z;
            const length = Math.sqrt(dx * dx + dz * dz);
            const angle = Math.atan2(dx, dz);

            const roadGeometry = new THREE.PlaneGeometry(roadWidth, length);
            const road = new THREE.Mesh(roadGeometry, roadMaterial);
            road.rotation.x = -Math.PI / 2;
            road.rotation.z = angle;
            road.position.set(
                (fromNode.x + toNode.x) / 2,
                0.05,
                (fromNode.z + toNode.z) / 2
            );
            road.receiveShadow = true;
            scene.add(road);
        }
    });

    roadNetwork.nodes.forEach(node => {
        const intersectionGeometry = new THREE.CylinderGeometry(12, 12, 0.1, 32);
        const intersectionMaterial = new THREE.MeshStandardMaterial({
            color: 0x3d3d3d,
            roughness: 0.7
        });
        const intersection = new THREE.Mesh(intersectionGeometry, intersectionMaterial);
        intersection.position.set(node.x, 0.05, node.z);
        intersection.receiveShadow = true;
        scene.add(intersection);
    });

    createBuildings();
}

function createNodeMarkers() {
    roadNetwork.nodes.forEach(node => {
        const markerGeometry = new THREE.CylinderGeometry(5, 5, 0.5, 16);
        const markerMaterial = new THREE.MeshStandardMaterial({
            color: 0x4a90d9,
            transparent: true,
            opacity: 0.6
        });
        const marker = new THREE.Mesh(markerGeometry, markerMaterial);
        marker.position.set(node.x, 0.25, node.z);
        marker.userData.nodeId = node.id;
        marker.visible = false;
        scene.add(marker);
        nodeMarkers.push(marker);
    });
}

function createBuildings() {
    const buildingColors = [0x16213e, 0x0f3460, 0x1a1a2e, 0x1e3a5f];
    const maxBuildings = 20;
    
    for (let i = 0; i < maxBuildings; i++) {
        const gridX = Math.floor(Math.random() * 5) - 2;
        const gridZ = Math.floor(Math.random() * 5) - 2;
        const offsetX = (Math.random() - 0.5) * 60;
        const offsetZ = (Math.random() - 0.5) * 60;
        
        const x = gridX * 100 + offsetX;
        const z = gridZ * 100 + offsetZ;
        
        if (Math.abs(x % 100) < 20 && Math.abs(z % 100) < 20) continue;
        
        const width = 15 + Math.random() * 25;
        const depth = 15 + Math.random() * 25;
        const height = 20 + Math.random() * 50;
        
        const buildingGeometry = new THREE.BoxGeometry(width, height, depth);
        const buildingMaterial = new THREE.MeshStandardMaterial({
            color: buildingColors[Math.floor(Math.random() * buildingColors.length)],
            roughness: 0.7,
            metalness: 0.3
        });
        
        const building = new THREE.Mesh(buildingGeometry, buildingMaterial);
        building.position.set(x, height / 2, z);
        building.castShadow = true;
        building.receiveShadow = true;
        scene.add(building);
        
        const windowRows = Math.floor(height / 25);
        const windowCols = Math.floor(width / 20);
        for (let row = 0; row < windowRows; row++) {
            for (let col = 0; col < windowCols; col++) {
                if (Math.random() > 0.6) {
                    const windowGeometry = new THREE.PlaneGeometry(5, 8);
                    const windowMaterial = new THREE.MeshBasicMaterial({
                        color: Math.random() > 0.5 ? 0xffe082 : 0x1a1a2e
                    });
                    
                    const window1 = new THREE.Mesh(windowGeometry, windowMaterial);
                    window1.position.set(
                        x - width / 2 + 10 + col * 20,
                        15 + row * 25,
                        z + depth / 2 + 0.1
                    );
                    scene.add(window1);
                    
                    const window2 = new THREE.Mesh(windowGeometry, windowMaterial);
                    window2.position.set(
                        x + width / 2 - 0.1,
                        15 + row * 25,
                        z - depth / 2 + 10 + col * 20
                    );
                    window2.rotation.y = Math.PI / 2;
                    scene.add(window2);
                }
            }
        }
    }
}

function createVehicleGeometry() {
    const bodyGeometry = new THREE.BoxGeometry(4, 2, 8);
    const roofGeometry = new THREE.BoxGeometry(3.5, 1.5, 4);
    
    roofGeometry.translate(0, 1.75, -2);
    
    const mergedGeometry = new THREE.BufferGeometry();
    const positions = [];
    const normals = [];
    
    const bodyPos = bodyGeometry.attributes.position;
    const bodyNorm = bodyGeometry.attributes.normal;
    for (let i = 0; i < bodyPos.count; i++) {
        positions.push(bodyPos.getX(i), bodyPos.getY(i), bodyPos.getZ(i));
        normals.push(bodyNorm.getX(i), bodyNorm.getY(i), bodyNorm.getZ(i));
    }
    
    const roofPos = roofGeometry.attributes.position;
    const roofNorm = roofGeometry.attributes.normal;
    for (let i = 0; i < roofPos.count; i++) {
        positions.push(roofPos.getX(i), roofPos.getY(i), roofPos.getZ(i));
        normals.push(roofNorm.getX(i), roofNorm.getY(i), roofNorm.getZ(i));
    }
    
    mergedGeometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    mergedGeometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    mergedGeometry.computeVertexNormals();
    
    return mergedGeometry;
}

function initVehicleMeshes() {
    const vehicleGeometry = createVehicleGeometry();
    const instancesPerColor = Math.ceil(MAX_VEHICLES / vehicleColors.length);
    
    vehicleColors.forEach((color, colorIndex) => {
        const material = new THREE.MeshStandardMaterial({
            color: color,
            roughness: 0.3,
            metalness: 0.7
        });
        
        const instancedMesh = new THREE.InstancedMesh(
            vehicleGeometry,
            material,
            instancesPerColor
        );
        instancedMesh.castShadow = true;
        instancedMesh.receiveShadow = true;
        instancedMesh.count = 0;
        scene.add(instancedMesh);
        vehicleMeshes.push({
            mesh: instancedMesh,
            color: color,
            colorIndex: colorIndex,
            currentCount: 0
        });
    });
}

function createTrafficLightMesh(lightData) {
    const group = new THREE.Group();
    
    const poleGeometry = new THREE.CylinderGeometry(1, 1.5, 25, 8);
    const poleMaterial = new THREE.MeshStandardMaterial({
        color: 0x333333,
        roughness: 0.7
    });
    const pole = new THREE.Mesh(poleGeometry, poleMaterial);
    pole.position.y = 12.5;
    pole.castShadow = true;
    group.add(pole);
    
    const lightHousing = new THREE.BoxGeometry(8, 6, 3);
    const housingMaterial = new THREE.MeshStandardMaterial({
        color: 0x222222,
        roughness: 0.8
    });
    const housing = new THREE.Mesh(lightHousing, housingMaterial);
    housing.position.set(0, 23, 0);
    group.add(housing);
    
    const lightGeometry = new THREE.CylinderGeometry(1.2, 1.2, 0.3, 16);
    
    lightData.directions.forEach((dir, index) => {
        const dirGroup = new THREE.Group();
        const angle = dir.angle;
        
        const offsetX = Math.sin(angle) * 10;
        const offsetZ = Math.cos(angle) * 10;
        
        const dirPoleGeometry = new THREE.CylinderGeometry(0.5, 0.5, 8, 8);
        const dirPole = new THREE.Mesh(dirPoleGeometry, poleMaterial);
        dirPole.position.set(offsetX, 23, offsetZ);
        dirPole.rotation.z = Math.PI / 2 - angle;
        dirGroup.add(dirPole);
        
        const dirHousing = new THREE.BoxGeometry(4, 8, 2);
        const dirHousingMesh = new THREE.Mesh(dirHousing, housingMaterial);
        dirHousingMesh.position.set(
            offsetX + Math.sin(angle) * 4,
            23,
            offsetZ + Math.cos(angle) * 4
        );
        dirHousingMesh.rotation.y = angle;
        dirGroup.add(dirHousingMesh);
        
        const redLight = new THREE.Mesh(lightGeometry, new THREE.MeshBasicMaterial({
            color: 0x440000
        }));
        redLight.position.set(
            offsetX + Math.sin(angle) * 5,
            25,
            offsetZ + Math.cos(angle) * 5
        );
        redLight.rotation.x = Math.PI / 2;
        redLight.userData.lightType = 'red';
        dirGroup.add(redLight);
        
        const yellowLight = new THREE.Mesh(lightGeometry, new THREE.MeshBasicMaterial({
            color: 0x444400
        }));
        yellowLight.position.set(
            offsetX + Math.sin(angle) * 5,
            23,
            offsetZ + Math.cos(angle) * 5
        );
        yellowLight.rotation.x = Math.PI / 2;
        yellowLight.userData.lightType = 'yellow';
        dirGroup.add(yellowLight);
        
        const greenLight = new THREE.Mesh(lightGeometry, new THREE.MeshBasicMaterial({
            color: 0x004400
        }));
        greenLight.position.set(
            offsetX + Math.sin(angle) * 5,
            21,
            offsetZ + Math.cos(angle) * 5
        );
        greenLight.rotation.x = Math.PI / 2;
        greenLight.userData.lightType = 'green';
        dirGroup.add(greenLight);
        
        dirGroup.userData.directionIndex = index;
        dirGroup.userData.edgeFrom = dir.edgeFrom;
        group.add(dirGroup);
    });
    
    group.position.set(lightData.x, 0, lightData.z);
    group.userData.lightId = lightData.id;
    group.userData.nodeId = lightData.nodeId;
    
    scene.add(group);
    trafficLightMeshes.set(lightData.id, group);
    
    const markerIndex = nodeMarkers.findIndex(m => m.userData.nodeId === lightData.nodeId);
    if (markerIndex >= 0) {
        nodeMarkers[markerIndex].material.color.setHex(0x44aa44);
        nodeMarkers[markerIndex].material.opacity = 0.8;
    }
}

function updateTrafficLightMesh(lightData) {
    const mesh = trafficLightMeshes.get(lightData.id);
    if (!mesh) return;
    
    mesh.children.forEach(child => {
        if (child.userData.directionIndex !== undefined) {
            const dirIndex = child.userData.directionIndex;
            const dir = lightData.directions[dirIndex];
            
            child.children.forEach(light => {
                if (light.userData.lightType) {
                    if (light.userData.lightType === 'red') {
                        light.material.color.setHex(dir.state === LIGHT_STATE.RED ? 0xff0000 : 0x440000);
                    } else if (light.userData.lightType === 'yellow') {
                        light.material.color.setHex(dir.state === LIGHT_STATE.YELLOW ? 0xffff00 : 0x444400);
                    } else if (light.userData.lightType === 'green') {
                        light.material.color.setHex(dir.state === LIGHT_STATE.GREEN ? 0x00ff00 : 0x004400);
                    }
                }
            });
        }
    });
}

function removeTrafficLightMesh(lightId) {
    const mesh = trafficLightMeshes.get(lightId);
    if (mesh) {
        const nodeId = mesh.userData.nodeId;
        const markerIndex = nodeMarkers.findIndex(m => m.userData.nodeId === nodeId);
        if (markerIndex >= 0) {
            nodeMarkers[markerIndex].material.color.setHex(0x4a90d9);
            nodeMarkers[markerIndex].material.opacity = 0.6;
        }
        
        scene.remove(mesh);
        trafficLightMeshes.delete(lightId);
    }
}

function initWorker() {
    worker = new Worker('traffic-simulator.worker.js');
    
    worker.onmessage = function(e) {
        switch(e.data.type) {
            case 'initialized':
                worker.postMessage({ type: 'start' });
                break;
            case 'update':
                updateVehicles(e.data.vehicles);
                updateStats(e.data.stats);
                break;
            case 'trafficLightAdded':
                createTrafficLightMesh(e.data.light);
                break;
            case 'trafficLightRemoved':
                removeTrafficLightMesh(e.data.lightId);
                break;
            case 'trafficLightsUpdate':
                e.data.lights.forEach(lightData => {
                    updateTrafficLightMesh(lightData);
                });
                break;
        }
    };
    
    worker.postMessage({
        type: 'init',
        roadNetwork: roadNetwork
    });
}

function updateVehicles(vehicleData) {
    const vehicleCount = vehicleData.length / 5;
    
    vehicleMeshes.forEach(vm => {
        vm.currentCount = 0;
    });
    
    for (let i = 0; i < vehicleCount; i++) {
        const baseIndex = i * 5;
        const colorIndex = Math.floor(vehicleData[baseIndex + 3]);
        const x = vehicleData[baseIndex + 1];
        const z = vehicleData[baseIndex + 2];
        const rotation = vehicleData[baseIndex + 4];
        
        const safeColorIndex = Math.min(Math.max(colorIndex, 0), vehicleMeshes.length - 1);
        const vm = vehicleMeshes[safeColorIndex];
        
        dummy.position.set(x, 0, z);
        dummy.rotation.y = rotation;
        dummy.updateMatrix();
        
        vm.mesh.setMatrixAt(vm.currentCount, dummy.matrix);
        vm.currentCount++;
    }
    
    vehicleMeshes.forEach(vm => {
        vm.mesh.count = vm.currentCount;
        vm.mesh.instanceMatrix.needsUpdate = true;
    });
}

function updateStats(stats) {
    document.getElementById('vehicle-count').textContent = stats.totalVehicles;
    document.getElementById('avg-speed').textContent = stats.avgSpeed + ' km/h';
}

function setupEventListeners() {
    renderer.domElement.addEventListener('click', onCanvasClick);
    renderer.domElement.addEventListener('mousemove', onCanvasMouseMove);
}

function onCanvasClick(event) {
    if (!placeLightMode) return;
    
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(nodeMarkers);
    
    if (intersects.length > 0) {
        const nodeId = intersects[0].object.userData.nodeId;
        worker.postMessage({
            type: 'addTrafficLight',
            nodeId: nodeId,
            phaseDuration: 5000
        });
    }
}

function onCanvasMouseMove(event) {
    if (!placeLightMode) return;
    
    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(nodeMarkers);
    
    nodeMarkers.forEach(marker => {
        const hasLight = trafficLightMeshes.has(marker.userData.nodeId);
        if (!hasLight) {
            marker.material.color.setHex(0x4a90d9);
            marker.material.opacity = 0.6;
        }
    });
    
    if (intersects.length > 0) {
        const marker = intersects[0].object;
        const hasLight = trafficLightMeshes.has(marker.userData.nodeId);
        if (!hasLight) {
            marker.material.color.setHex(0xffa500);
            marker.material.opacity = 1.0;
        }
    }
}

function setupUIControls() {
    const vehicleSlider = document.getElementById('vehicle-count-slider');
    const speedSlider = document.getElementById('sim-speed-slider');
    const pauseBtn = document.getElementById('btn-pause');
    const resetBtn = document.getElementById('btn-reset');
    const placeLightBtn = document.getElementById('btn-place-light');
    const lightList = document.getElementById('traffic-lights-list');
    
    vehicleSlider.addEventListener('input', (e) => {
        const value = parseInt(e.target.value);
        document.getElementById('vehicle-slider-value').textContent = value;
        if (worker) {
            worker.postMessage({ type: 'setVehicleCount', count: value });
        }
    });
    
    speedSlider.addEventListener('input', (e) => {
        const value = parseFloat(e.target.value);
        document.getElementById('speed-slider-value').textContent = value.toFixed(1);
        if (worker) {
            worker.postMessage({ type: 'setSpeed', speed: value });
        }
    });
    
    pauseBtn.addEventListener('click', () => {
        isPaused = !isPaused;
        pauseBtn.textContent = isPaused ? '继续' : '暂停';
        if (worker) {
            worker.postMessage({ type: 'pause' });
        }
    });
    
    resetBtn.addEventListener('click', () => {
        if (worker) {
            worker.postMessage({ type: 'reset' });
        }
    });
    
    placeLightBtn.addEventListener('click', () => {
        placeLightMode = !placeLightMode;
        placeLightBtn.textContent = placeLightMode ? '取消放置' : '放置信号灯';
        placeLightBtn.style.background = placeLightMode ? '#ff9800' : '#4caf50';
        
        nodeMarkers.forEach(marker => {
            const hasLight = trafficLightMeshes.has(marker.userData.nodeId);
            marker.visible = placeLightMode && !hasLight;
        });
        
        if (placeLightMode) {
            document.body.style.cursor = 'crosshair';
        } else {
            document.body.style.cursor = 'default';
        }
    });
    
    const observer = new MutationObserver(() => {
        updateLightList(lightList);
    });
    
    observer.observe(lightList, { childList: true });
}

function updateLightList(container) {
    while (container.firstChild) {
        container.removeChild(container.firstChild);
    }
    
    trafficLightMeshes.forEach((mesh, lightId) => {
        const item = document.createElement('div');
        item.className = 'light-item';
        item.innerHTML = `
            <span>交叉口 #${mesh.userData.nodeId}</span>
            <button class="btn-remove" data-light-id="${lightId}">移除</button>
        `;
        
        const removeBtn = item.querySelector('.btn-remove');
        removeBtn.addEventListener('click', () => {
            if (worker) {
                worker.postMessage({ type: 'removeTrafficLight', lightId: lightId });
            }
        });
        
        container.appendChild(item);
    });
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
    requestAnimationFrame(animate);
    
    controls.update();
    renderer.render(scene, camera);
    
    frameCount++;
    const now = performance.now();
    if (now - lastFpsUpdate >= 1000) {
        document.getElementById('fps').textContent = frameCount;
        frameCount = 0;
        lastFpsUpdate = now;
    }
}

init();
