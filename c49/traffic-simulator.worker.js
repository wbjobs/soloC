const COLORS = [0xff5252, 0x4fc3f7, 0x81c784, 0xffb74d, 0xba68c8, 0xe57373];

const LIGHT_STATE = {
    RED: 0,
    YELLOW: 1,
    GREEN: 2
};

let roadNetwork = null;
let vehicles = [];
let trafficLights = [];
let isPaused = false;
let simulationSpeed = 1.0;
let vehicleCount = 50;
let lastUpdateTime = 0;
let adjacencyList = {};
const MIN_DISTANCE = 12;
const MAX_VEHICLES = 500;
const INTERSECTION_RADIUS = 25;
const CELL_SIZE = 50;
const STOP_LINE_DISTANCE = 18;

self.onmessage = function(e) {
    switch(e.data.type) {
        case 'init':
            initSimulation(e.data.roadNetwork);
            break;
        case 'start':
            startSimulation();
            break;
        case 'pause':
            isPaused = !isPaused;
            break;
        case 'reset':
            resetSimulation();
            break;
        case 'setVehicleCount':
            vehicleCount = Math.min(e.data.count, MAX_VEHICLES);
            adjustVehicleCount();
            break;
        case 'setSpeed':
            simulationSpeed = e.data.speed;
            break;
        case 'addTrafficLight':
            addTrafficLight(e.data.nodeId, e.data.phaseDuration);
            break;
        case 'removeTrafficLight':
            removeTrafficLight(e.data.lightId);
            break;
    }
};

function initSimulation(network) {
    roadNetwork = network;
    buildAdjacencyList();
    createVehicles(vehicleCount);
    lastUpdateTime = performance.now();
    self.postMessage({ type: 'initialized' });
}

function buildAdjacencyList() {
    adjacencyList = {};
    roadNetwork.nodes.forEach(node => {
        adjacencyList[node.id] = [];
    });
    roadNetwork.edges.forEach(edge => {
        adjacencyList[edge.from].push(edge);
    });
}

function createVehicles(count) {
    for (let i = 0; i < count; i++) {
        vehicles.push(createVehicle(i));
    }
}

function createVehicle(id) {
    let attempts = 0;
    let startNode;
    
    while (attempts < 100) {
        startNode = roadNetwork.nodes[Math.floor(Math.random() * roadNetwork.nodes.length)];
        const availableEdges = adjacencyList[startNode.id];
        
        if (availableEdges && availableEdges.length > 0) {
            let isSafe = true;
            for (const v of vehicles) {
                const dx = startNode.x - v.x;
                const dz = startNode.z - v.z;
                if (Math.sqrt(dx * dx + dz * dz) < MIN_DISTANCE * 2) {
                    isSafe = false;
                    break;
                }
            }
            
            if (isSafe) {
                const edge = availableEdges[Math.floor(Math.random() * availableEdges.length)];
                return {
                    id: id,
                    x: startNode.x,
                    z: startNode.z,
                    currentEdge: edge,
                    progress: 0,
                    speed: (Math.random() * 0.4 + 0.6) * (edge.speedLimit / 60),
                    colorIndex: Math.floor(Math.random() * COLORS.length),
                    targetNode: edge.to,
                    isStopped: false,
                    stopTimer: 0,
                    waitCount: 0,
                    waitingForLight: false
                };
            }
        }
        attempts++;
    }
    
    const node = roadNetwork.nodes[id % roadNetwork.nodes.length];
    const edge = adjacencyList[node.id][0];
    return {
        id: id,
        x: node.x,
        z: node.z,
        currentEdge: edge,
        progress: 0,
        speed: (Math.random() * 0.4 + 0.6) * (edge.speedLimit / 60),
        colorIndex: Math.floor(Math.random() * COLORS.length),
        targetNode: edge.to,
        isStopped: false,
        stopTimer: 0,
        waitCount: 0,
        waitingForLight: false
    };
}

function adjustVehicleCount() {
    while (vehicles.length < vehicleCount) {
        vehicles.push(createVehicle(vehicles.length));
    }
    while (vehicles.length > vehicleCount) {
        vehicles.pop();
    }
}

function resetSimulation() {
    vehicles = [];
    createVehicles(vehicleCount);
    isPaused = false;
}

function addTrafficLight(nodeId, phaseDuration = 5000) {
    const node = roadNetwork.nodes.find(n => n.id === nodeId);
    if (!node) return;
    
    const existingLight = trafficLights.find(l => l.nodeId === nodeId);
    if (existingLight) return;
    
    const incomingEdges = roadNetwork.edges.filter(e => e.to === nodeId);
    const directions = [];
    
    incomingEdges.forEach(edge => {
        const fromNode = roadNetwork.nodes.find(n => n.id === edge.from);
        if (fromNode) {
            const dx = node.x - fromNode.x;
            const dz = node.z - fromNode.z;
            const angle = Math.atan2(dx, dz);
            directions.push({
                edge: edge,
                fromNode: fromNode,
                angle: angle,
                phase: directions.length % 2
            });
        }
    });
    
    const light = {
        id: trafficLights.length,
        nodeId: nodeId,
        x: node.x,
        z: node.z,
        phaseDuration: phaseDuration,
        yellowDuration: 1000,
        currentPhase: 0,
        phaseTimer: 0,
        isYellow: false,
        directions: directions,
        state: LIGHT_STATE.GREEN
    };
    
    trafficLights.push(light);
    
    self.postMessage({
        type: 'trafficLightAdded',
        light: {
            id: light.id,
            nodeId: light.nodeId,
            x: light.x,
            z: light.z,
            state: light.state,
            phase: light.currentPhase
        }
    });
}

function removeTrafficLight(lightId) {
    const index = trafficLights.findIndex(l => l.id === lightId);
    if (index >= 0) {
        trafficLights.splice(index, 1);
        self.postMessage({
            type: 'trafficLightRemoved',
            lightId: lightId
        });
    }
}

function updateTrafficLights(deltaTime) {
    trafficLights.forEach(light => {
        light.phaseTimer += deltaTime;
        
        if (!light.isYellow && light.phaseTimer >= light.phaseDuration) {
            light.isYellow = true;
            light.phaseTimer = 0;
            light.state = LIGHT_STATE.YELLOW;
        } else if (light.isYellow && light.phaseTimer >= light.yellowDuration) {
            light.isYellow = false;
            light.phaseTimer = 0;
            light.currentPhase = (light.currentPhase + 1) % 2;
            light.state = LIGHT_STATE.GREEN;
        }
        
        light.directions.forEach(dir => {
            if (dir.phase === light.currentPhase) {
                dir.state = light.isYellow ? LIGHT_STATE.YELLOW : LIGHT_STATE.GREEN;
            } else {
                dir.state = LIGHT_STATE.RED;
            }
        });
    });
    
    if (trafficLights.length > 0) {
        self.postMessage({
            type: 'trafficLightsUpdate',
            lights: trafficLights.map(l => ({
                id: l.id,
                x: l.x,
                z: l.z,
                state: l.state,
                phase: l.currentPhase,
                directions: l.directions.map(d => ({
                    state: d.state,
                    angle: d.angle,
                    edgeFrom: d.edge.from
                }))
            }))
        });
    }
}

function shouldStopForTrafficLight(vehicle, nextX, nextZ) {
    if (!vehicle.currentEdge) return false;
    
    const targetNodeId = vehicle.targetNode;
    
    for (const light of trafficLights) {
        if (light.nodeId !== targetNodeId) continue;
        
        const targetNode = roadNetwork.nodes.find(n => n.id === targetNodeId);
        if (!targetNode) continue;
        
        const distToIntersection = Math.sqrt(
            Math.pow(targetNode.x - nextX, 2) + 
            Math.pow(targetNode.z - nextZ, 2)
        );
        
        if (distToIntersection > STOP_LINE_DISTANCE * 1.5) continue;
        
        const direction = light.directions.find(d => 
            d.edge.from === vehicle.currentEdge.from
        );
        
        if (!direction) continue;
        
        if (direction.state === LIGHT_STATE.RED || direction.state === LIGHT_STATE.YELLOW) {
            if (distToIntersection < STOP_LINE_DISTANCE) {
                return true;
            }
        }
    }
    
    return false;
}

function startSimulation() {
    requestAnimationFrame(update);
}

function update(currentTime) {
    if (!isPaused) {
        const deltaTime = Math.min((currentTime - lastUpdateTime) * simulationSpeed, 50);
        lastUpdateTime = currentTime;
        
        updateTrafficLights(deltaTime);
        updateVehicles(deltaTime);
        
        const vehicleData = new Float32Array(vehicles.length * 5);
        vehicles.forEach((v, i) => {
            vehicleData[i * 5] = v.id;
            vehicleData[i * 5 + 1] = v.x;
            vehicleData[i * 5 + 2] = v.z;
            vehicleData[i * 5 + 3] = v.colorIndex;
            vehicleData[i * 5 + 4] = getVehicleRotation(v);
        });
        
        self.postMessage({
            type: 'update',
            vehicles: vehicleData,
            stats: {
                totalVehicles: vehicles.length,
                avgSpeed: calculateAvgSpeed()
            }
        }, [vehicleData.buffer]);
    } else {
        lastUpdateTime = currentTime;
    }
    
    requestAnimationFrame(update);
}

function buildSpatialGrid() {
    const grid = new Map();
    
    vehicles.forEach(vehicle => {
        const cellX = Math.floor(vehicle.x / CELL_SIZE);
        const cellZ = Math.floor(vehicle.z / CELL_SIZE);
        const key = `${cellX},${cellZ}`;
        
        if (!grid.has(key)) {
            grid.set(key, []);
        }
        grid.get(key).push(vehicle);
    });
    
    return grid;
}

function checkCollision(currentVehicle, nextX, nextZ, spatialGrid) {
    const cellX = Math.floor(nextX / CELL_SIZE);
    const cellZ = Math.floor(nextZ / CELL_SIZE);
    
    for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
            const key = `${cellX + dx},${cellZ + dz}`;
            const cell = spatialGrid.get(key);
            
            if (cell) {
                for (const otherVehicle of cell) {
                    if (otherVehicle.id === currentVehicle.id) continue;
                    
                    const distX = nextX - otherVehicle.x;
                    const distZ = nextZ - otherVehicle.z;
                    const distance = Math.sqrt(distX * distX + distZ * distZ);
                    
                    if (distance < MIN_DISTANCE) {
                        if (shouldYield(currentVehicle, otherVehicle, nextX, nextZ)) {
                            return true;
                        }
                    }
                }
            }
        }
    }
    
    return false;
}

function shouldYield(currentVehicle, otherVehicle, nextX, nextZ) {
    if (!currentVehicle.currentEdge || !otherVehicle.currentEdge) {
        return currentVehicle.id > otherVehicle.id;
    }
    
    const fromNode = getNodeById(currentVehicle.currentEdge.from);
    const toNode = getNodeById(currentVehicle.currentEdge.to);
    
    if (!fromNode || !toNode) return true;
    
    const distToIntersection = Math.sqrt(
        Math.pow(toNode.x - nextX, 2) + Math.pow(toNode.z - nextZ, 2)
    );
    
    const otherDistToIntersection = Math.sqrt(
        Math.pow(toNode.x - otherVehicle.x, 2) + Math.pow(toNode.z - otherVehicle.z, 2)
    );
    
    const nearIntersection = distToIntersection < INTERSECTION_RADIUS;
    
    if (nearIntersection) {
        const currentDirX = toNode.x - fromNode.x;
        const currentDirZ = toNode.z - fromNode.z;
        const currentMag = Math.sqrt(currentDirX * currentDirX + currentDirZ * currentDirZ);
        
        const otherFrom = getNodeById(otherVehicle.currentEdge.from);
        const otherTo = getNodeById(otherVehicle.currentEdge.to);
        
        if (otherFrom && otherTo) {
            const otherDirX = otherTo.x - otherFrom.x;
            const otherDirZ = otherTo.z - otherFrom.z;
            const otherMag = Math.sqrt(otherDirX * otherDirX + otherDirZ * otherDirZ);
            
            const dotProduct = currentDirX * otherDirX + currentDirZ * otherDirZ;
            const cosAngle = dotProduct / (currentMag * otherMag);
            
            if (cosAngle > 0.7) {
                return distToIntersection > otherDistToIntersection;
            } else if (Math.abs(cosAngle) < 0.3) {
                return currentVehicle.id > otherVehicle.id;
            }
        }
    }
    
    const currentDirX = toNode.x - fromNode.x;
    const currentDirZ = toNode.z - fromNode.z;
    const currentMag = Math.sqrt(currentDirX * currentDirX + currentDirZ * currentDirZ);
    
    if (currentMag > 0) {
        const toOtherX = otherVehicle.x - nextX;
        const toOtherZ = otherVehicle.z - nextZ;
        const dotForward = toOtherX * (currentDirX / currentMag) + toOtherZ * (currentDirZ / currentMag);
        
        if (dotForward > 0 && dotForward < 30) {
            return true;
        }
    }
    
    return false;
}

function findNewEdge(vehicle, spatialGrid) {
    const currentNodeId = vehicle.targetNode;
    const availableEdges = adjacencyList[currentNodeId];
    
    if (availableEdges && availableEdges.length > 0) {
        const currentNode = getNodeById(currentNodeId);
        if (!currentNode) {
            vehicle.currentEdge = availableEdges[Math.floor(Math.random() * availableEdges.length)];
            return;
        }
        
        let bestEdge = null;
        let bestScore = -Infinity;
        
        for (const edge of availableEdges) {
            let score = Math.random();
            
            if (isEdgeClear(vehicle, edge, currentNode, spatialGrid)) {
                score += 2;
            }
            
            if (vehicle.currentEdge && edge.to === vehicle.currentEdge.from) {
                score -= 1.5;
            }
            
            if (score > bestScore) {
                bestScore = score;
                bestEdge = edge;
            }
        }
        
        if (bestEdge) {
            vehicle.currentEdge = bestEdge;
            vehicle.targetNode = bestEdge.to;
            vehicle.speed = (Math.random() * 0.4 + 0.6) * (bestEdge.speedLimit / 60);
            vehicle.progress = 0;
        }
    }
}

function isEdgeClear(vehicle, edge, fromNode, spatialGrid) {
    const toNode = getNodeById(edge.to);
    if (!toNode) return false;
    
    const checkX = fromNode.x + (toNode.x - fromNode.x) * 0.3;
    const checkZ = fromNode.z + (toNode.z - fromNode.z) * 0.3;
    
    const cellX = Math.floor(checkX / CELL_SIZE);
    const cellZ = Math.floor(checkZ / CELL_SIZE);
    
    for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
            const key = `${cellX + dx},${cellZ + dz}`;
            const cell = spatialGrid.get(key);
            
            if (cell) {
                for (const other of cell) {
                    if (other.id === vehicle.id) continue;
                    
                    const dxDist = checkX - other.x;
                    const dzDist = checkZ - other.z;
                    const distance = Math.sqrt(dxDist * dxDist + dzDist * dzDist);
                    
                    if (distance < MIN_DISTANCE * 1.5) {
                        return false;
                    }
                }
            }
        }
    }
    
    return true;
}

function updateVehicles(deltaTime) {
    const spatialGrid = buildSpatialGrid();
    
    vehicles.forEach(vehicle => {
        if (!vehicle.currentEdge) {
            findNewEdge(vehicle, spatialGrid);
            return;
        }
        
        const fromNode = getNodeById(vehicle.currentEdge.from);
        const toNode = getNodeById(vehicle.currentEdge.to);
        
        if (!fromNode || !toNode) return;
        
        const dx = toNode.x - fromNode.x;
        const dz = toNode.z - fromNode.z;
        const distance = Math.sqrt(dx * dx + dz * dz);
        
        const nextProgress = vehicle.progress + (vehicle.speed * deltaTime * 0.05) / distance;
        const nextX = fromNode.x + dx * Math.min(nextProgress, 1);
        const nextZ = fromNode.z + dz * Math.min(nextProgress, 1);
        
        const shouldStopCollision = checkCollision(vehicle, nextX, nextZ, spatialGrid);
        const shouldStopLight = shouldStopForTrafficLight(vehicle, nextX, nextZ);
        
        if (shouldStopCollision || shouldStopLight) {
            vehicle.isStopped = true;
            vehicle.waitingForLight = shouldStopLight;
            vehicle.stopTimer += deltaTime;
            vehicle.waitCount++;
            
            if (vehicle.stopTimer > 5000 || vehicle.waitCount > 150) {
                vehicle.stopTimer = 0;
                vehicle.waitCount = 0;
                findNewEdge(vehicle, spatialGrid);
            }
            return;
        }
        
        vehicle.isStopped = false;
        vehicle.waitingForLight = false;
        vehicle.stopTimer = 0;
        vehicle.waitCount = 0;
        vehicle.progress = nextProgress;
        
        if (vehicle.progress >= 1) {
            vehicle.progress = 0;
            vehicle.x = toNode.x;
            vehicle.z = toNode.z;
            findNewEdge(vehicle, spatialGrid);
        } else {
            vehicle.x = nextX;
            vehicle.z = nextZ;
        }
    });
}

function getNodeById(id) {
    return roadNetwork.nodes.find(n => n.id === id);
}

function getVehicleRotation(vehicle) {
    if (!vehicle.currentEdge) return 0;
    
    const fromNode = getNodeById(vehicle.currentEdge.from);
    const toNode = getNodeById(vehicle.currentEdge.to);
    
    if (!fromNode || !toNode) return 0;
    
    const dx = toNode.x - fromNode.x;
    const dz = toNode.z - fromNode.z;
    
    return Math.atan2(dx, dz);
}

function calculateAvgSpeed() {
    if (vehicles.length === 0) return 0;
    const movingVehicles = vehicles.filter(v => !v.isStopped);
    if (movingVehicles.length === 0) return 0;
    const totalSpeed = movingVehicles.reduce((sum, v) => sum + v.speed * 3.6, 0);
    return Math.round(totalSpeed / movingVehicles.length);
}
