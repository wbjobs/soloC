class SpaceGame {
    constructor() {
        this.ws = null;
        this.playerId = null;
        this.playerName = '';
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.drones = {};
        this.debris = {};
        this.obstacles = {};
        this.heatMapCubes = [];
        this.targetMarker = null;
        this.conflictMarkers = {};
        this.conflictLines = {};
        this.gravityBodies = {};
        this.gravityFields = {};
        this.trajectoryPrediction = null;
        this.gravityBodiesData = [];
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        this.controls = null;
        this.gameState = null;
        this.history = [];
        this.isReplaying = false;
        this.replayIndex = 0;
        this.showHeatMap = false;
        this.showPlayers = true;
        
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.initThreeJS();
        this.animate();
    }

    setupEventListeners() {
        document.getElementById('join-btn').addEventListener('click', () => this.joinGame());
        document.getElementById('player-name').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.joinGame();
        });
        
        document.getElementById('show-heatmap').addEventListener('click', () => this.toggleHeatMap());
        document.getElementById('show-players').addEventListener('click', () => this.togglePlayers());
        document.getElementById('replay-btn').addEventListener('click', () => this.showReplayPanel());
        document.getElementById('add-test-drone').addEventListener('click', () => this.addTestDrone());
        document.getElementById('close-replay').addEventListener('click', () => this.hideReplayPanel());
        document.getElementById('play-replay').addEventListener('click', () => this.playReplay());
        document.getElementById('pause-replay').addEventListener('click', () => this.pauseReplay());
        document.getElementById('replay-slider').addEventListener('input', (e) => this.seekReplay(e.target.value));
        
        window.addEventListener('resize', () => this.onWindowResize());
        document.addEventListener('click', (e) => this.onMouseClick(e));
        document.addEventListener('mousemove', (e) => this.onMouseMove(e));
    }

    initThreeJS() {
        const container = document.getElementById('game-canvas');
        
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x0a0a1a);
        this.scene.fog = new THREE.Fog(0x0a0a1a, 500, 1500);

        this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 2000);
        this.camera.position.set(200, 200, 200);

        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        container.appendChild(this.renderer.domElement);

        this.addLighting();
        this.addSpaceEnvironment();
        this.addBase();
        this.addTargetMarker();
        this.setupOrbitControls();
    }

    addLighting() {
        const ambientLight = new THREE.AmbientLight(0x404060, 0.5);
        this.scene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
        directionalLight.position.set(100, 100, 50);
        this.scene.add(directionalLight);

        const pointLight1 = new THREE.PointLight(0x00d4ff, 1, 500);
        pointLight1.position.set(-200, -200, -200);
        this.scene.add(pointLight1);

        const pointLight2 = new THREE.PointLight(0x7b2ff7, 1, 500);
        pointLight2.position.set(200, 200, 200);
        this.scene.add(pointLight2);
    }

    addSpaceEnvironment() {
        const starGeometry = new THREE.BufferGeometry();
        const starCount = 5000;
        const positions = new Float32Array(starCount * 3);
        
        for (let i = 0; i < starCount * 3; i += 3) {
            positions[i] = (Math.random() - 0.5) * 2000;
            positions[i + 1] = (Math.random() - 0.5) * 2000;
            positions[i + 2] = (Math.random() - 0.5) * 2000;
        }
        
        starGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        const starMaterial = new THREE.PointsMaterial({ color: 0xffffff, size: 0.5, transparent: true, opacity: 0.8 });
        const stars = new THREE.Points(starGeometry, starMaterial);
        this.scene.add(stars);

        const gridHelper = new THREE.GridHelper(1000, 50, 0x1a1a3a, 0x1a1a3a);
        this.scene.add(gridHelper);
    }

    addBase() {
        const baseGeometry = new THREE.ConeGeometry(30, 50, 8);
        const baseMaterial = new THREE.MeshPhongMaterial({ 
            color: 0x00d4ff, 
            emissive: 0x00d4ff,
            emissiveIntensity: 0.3,
            transparent: true,
            opacity: 0.8
        });
        const base = new THREE.Mesh(baseGeometry, baseMaterial);
        base.position.set(0, 25, 0);
        this.scene.add(base);

        const ringGeometry = new THREE.TorusGeometry(40, 2, 16, 50);
        const ringMaterial = new THREE.MeshPhongMaterial({ 
            color: 0x7b2ff7, 
            emissive: 0x7b2ff7,
            emissiveIntensity: 0.5,
            side: THREE.DoubleSide
        });
        const ring = new THREE.Mesh(ringGeometry, ringMaterial);
        ring.rotation.x = Math.PI / 2;
        ring.position.y = 5;
        this.scene.add(ring);
    }

    addTargetMarker() {
        const markerGeometry = new THREE.RingGeometry(5, 10, 32);
        const markerMaterial = new THREE.MeshBasicMaterial({ 
            color: 0xff0000, 
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.8
        });
        this.targetMarker = new THREE.Mesh(markerGeometry, markerMaterial);
        this.targetMarker.visible = false;
        this.scene.add(this.targetMarker);
    }

    setupOrbitControls() {
        const _this = this;
        
        let isDragging = false;
        let previousMousePosition = { x: 0, y: 0 };
        let spherical = { theta: Math.PI / 4, phi: Math.PI / 4, radius: 300 };
        let target = new THREE.Vector3(0, 0, 0);

        document.addEventListener('mousedown', (e) => {
            if (e.target.tagName === 'BUTTON' || e.target.tagName === 'INPUT') return;
            isDragging = true;
            previousMousePosition = { x: e.clientX, y: e.clientY };
        });

        document.addEventListener('mouseup', () => {
            isDragging = false;
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            
            const deltaX = e.clientX - previousMousePosition.x;
            const deltaY = e.clientY - previousMousePosition.y;
            
            spherical.theta -= deltaX * 0.01;
            spherical.phi -= deltaY * 0.01;
            spherical.phi = Math.max(0.1, Math.min(Math.PI - 0.1, spherical.phi));
            
            _this.updateCameraPosition(spherical, target);
            previousMousePosition = { x: e.clientX, y: e.clientY };
        });

        document.addEventListener('wheel', (e) => {
            e.preventDefault();
            spherical.radius += e.deltaY * 0.5;
            spherical.radius = Math.max(100, Math.min(800, spherical.radius));
            _this.updateCameraPosition(spherical, target);
        });

        this.updateCameraPosition(spherical, target);
    }

    updateCameraPosition(spherical, target) {
        this.camera.position.x = target.x + spherical.radius * Math.sin(spherical.phi) * Math.cos(spherical.theta);
        this.camera.position.y = target.y + spherical.radius * Math.cos(spherical.phi);
        this.camera.position.z = target.z + spherical.radius * Math.sin(spherical.phi) * Math.sin(spherical.theta);
        this.camera.lookAt(target);
    }

    onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    onMouseMove(event) {
        this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    }

    onMouseClick(event) {
        if (!this.ws || this.isReplaying) return;
        if (event.target.tagName === 'BUTTON' || event.target.tagName === 'INPUT') return;

        this.raycaster.setFromCamera(this.mouse, this.camera);
        const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
        const targetPoint = new THREE.Vector3();
        this.raycaster.ray.intersectPlane(plane, targetPoint);

        if (targetPoint) {
            this.targetMarker.position.copy(targetPoint);
            this.targetMarker.lookAt(this.camera.position);
            this.targetMarker.visible = true;

            this.ws.send(JSON.stringify({
                type: 'move',
                data: { x: targetPoint.x, y: targetPoint.y, z: targetPoint.z }
            }));
        }
    }

    onMouseMove(event) {
        this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    }

    calculateTrajectoryPrediction(startPos, endPos, numSteps = 50) {
        const points = [];
        let currentPos = new THREE.Vector3(startPos.x, startPos.y, startPos.z);
        const direction = new THREE.Vector3(
            endPos.x - startPos.x,
            endPos.y - startPos.y,
            endPos.z - startPos.z
        ).normalize();
        
        for (let i = 0; i < numSteps; i++) {
            points.push(currentPos.clone());
            
            const baseSpeed = 5;
            let totalAcceleration = new THREE.Vector3(0, 0, 0);
            
            for (const body of this.gravityBodiesData) {
                const toBody = new THREE.Vector3(
                    body.Position.x - currentPos.x,
                    body.Position.y - currentPos.y,
                    body.Position.z - currentPos.z
                );
                const dist = toBody.length();
                
                if (dist > body.Radius) {
                    const G = 0.1;
                    const strength = G * body.Mass / (dist * dist);
                    toBody.normalize();
                    totalAcceleration.add(toBody.multiplyScalar(strength * 0.5));
                }
            }
            
            const moveDir = direction.clone().add(totalAcceleration).normalize();
            currentPos.add(moveDir.multiplyScalar(baseSpeed));
        }
        
        return points;
    }

    joinGame() {
        const nameInput = document.getElementById('player-name');
        const name = nameInput.value.trim();
        
        if (!name) {
            alert('请输入你的名字');
            return;
        }

        this.playerName = name;
        this.connectWebSocket();
    }

    connectWebSocket() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws`;
        
        this.ws = new WebSocket(wsUrl);
        
        this.ws.onopen = () => {
            console.log('WebSocket连接成功');
            this.ws.send(JSON.stringify({
                type: 'join',
                data: { name: this.playerName }
            }));
        };

        this.ws.onmessage = (event) => {
            const message = JSON.parse(event.data);
            this.handleMessage(message);
        };

        this.ws.onerror = (error) => {
            console.error('WebSocket错误:', error);
        };

        this.ws.onclose = () => {
            console.log('WebSocket连接关闭');
        };
    }

    handleMessage(message) {
        switch (message.type) {
            case 'joined':
                this.playerId = message.playerId;
                this.showGamePanel();
                break;
            case 'state':
                this.gameState = message.state;
                if (message.gravityBodies) {
                    this.gravityBodiesData = message.gravityBodies;
                }
                this.updateGameState();
                this.updateGravityBodies();
                break;
            case 'heatmap':
                this.updateHeatMap(message.heatmap);
                break;
            case 'history':
                this.history = message.history;
                document.getElementById('replay-slider').max = this.history.length - 1;
                break;
        }
    }

    showGamePanel() {
        document.getElementById('login-panel').classList.add('hidden');
        document.getElementById('game-panel').classList.remove('hidden');
        document.getElementById('player-name-display').textContent = this.playerName;
    }

    updateGameState() {
        if (!this.gameState) return;

        this.updatePlayersUI();
        this.updateDrones();
        this.updateDebris();
        this.updateObstacles();
        this.updatePlayerStats();
        this.updateConflicts();
    }

    updateConflicts() {
        const conflicts = this.gameState?.Conflicts || [];
        const drones = this.gameState?.Drones || {};

        const activeConflictIds = new Set();

        for (const conflict of conflicts) {
            if (conflict.Resolved) continue;
            activeConflictIds.add(conflict.ConflictID);

            if (!this.conflictMarkers[conflict.ConflictID]) {
                this.createConflictMarker(conflict);
            }

            this.updateConflictVisuals(conflict, drones);
        }

        for (const id of Object.keys(this.conflictMarkers)) {
            if (!activeConflictIds.has(id)) {
                this.scene.remove(this.conflictMarkers[id]);
                delete this.conflictMarkers[id];
            }
        }

        for (const id of Object.keys(this.conflictLines)) {
            if (!activeConflictIds.has(id)) {
                this.scene.remove(this.conflictLines[id]);
                delete this.conflictLines[id];
            }
        }
    }

    createConflictMarker(conflict) {
        const group = new THREE.Group();

        const warningGeometry = new THREE.TetrahedronGeometry(15);
        const warningMaterial = new THREE.MeshPhongMaterial({
            color: 0xff0000,
            emissive: 0xff0000,
            emissiveIntensity: 1,
            transparent: true,
            opacity: 0.8
        });
        const warning = new THREE.Mesh(warningGeometry, warningMaterial);
        group.add(warning);

        const ringGeometry = new THREE.TorusGeometry(25, 2, 8, 32);
        const ringMaterial = new THREE.MeshPhongMaterial({
            color: 0xff4444,
            emissive: 0xff4444,
            emissiveIntensity: 0.5,
            transparent: true,
            opacity: 0.6
        });
        const ring = new THREE.Mesh(ringGeometry, ringMaterial);
        ring.rotation.x = Math.PI / 2;
        group.add(ring);

        this.conflictMarkers[conflict.ConflictID] = group;
        this.scene.add(group);
    }

    updateConflictVisuals(conflict, drones) {
        const marker = this.conflictMarkers[conflict.ConflictID];
        if (marker) {
            marker.position.set(
                conflict.Position.X,
                conflict.Position.Y,
                conflict.Position.Z
            );
            marker.rotation.y += 0.02;
            marker.rotation.z += 0.01;
        }

        const droneA = drones[conflict.DroneA];
        const droneB = drones[conflict.DroneB];
        
        if (droneA && droneB) {
            let line = this.conflictLines[conflict.ConflictID];
            
            if (!line) {
                const geometry = new THREE.BufferGeometry();
                const material = new THREE.LineDashedMaterial({
                    color: 0xff0000,
                    linewidth: 2,
                    dashSize: 5,
                    gapSize: 3,
                    transparent: true,
                    opacity: 0.8
                });
                line = new THREE.Line(geometry, material);
                this.conflictLines[conflict.ConflictID] = line;
                this.scene.add(line);
            }

            const points = [
                new THREE.Vector3(droneA.Position.X, droneA.Position.Y, droneA.Position.Z),
                new THREE.Vector3(droneB.Position.X, droneB.Position.Y, droneB.Position.Z)
            ];
            line.geometry.setFromPoints(points);
            line.computeLineDistances();
        }
    }

    getDroneColor(droneId, state, players) {
        const isPlayerDrone = droneId === players[this.playerId]?.Drone?.ID;
        
        if (state === 'waiting') {
            return 0xffaa00;
        } else if (state === 'replanning') {
            return 0xff6600;
        } else if (state === 'moving') {
            return isPlayerDrone ? 0x00ff00 : 0x00d4ff;
        } else {
            return isPlayerDrone ? 0x00ff00 : 0x888888;
        }
    }

    createStateLabel(state, drone) {
        const group = new THREE.Group();
        
        if (state === 'waiting') {
            const shape = new THREE.ConeGeometry(5, 8, 4);
            const material = new THREE.MeshPhongMaterial({
                color: 0xffaa00,
                emissive: 0xffaa00,
                emissiveIntensity: 1
            });
            const indicator = new THREE.Mesh(shape, material);
            indicator.position.y = 20;
            indicator.rotation.z = Math.PI;
            group.add(indicator);
        } else if (state === 'replanning') {
            const shape = new THREE.RingGeometry(4, 8, 6);
            const material = new THREE.MeshPhongMaterial({
                color: 0xff6600,
                emissive: 0xff6600,
                emissiveIntensity: 1,
                side: THREE.DoubleSide
            });
            const indicator = new THREE.Mesh(shape, material);
            indicator.position.y = 20;
            indicator.rotation.x = Math.PI / 2;
            group.add(indicator);
        }
        
        if (drone && drone.GravityInfluence && drone.GravityInfluence.InSlingshotZone) {
            const slingshotGeometry = new THREE.TorusGeometry(12, 2, 8, 32);
            const slingshotMaterial = new THREE.MeshPhongMaterial({
                color: 0x00ffff,
                emissive: 0x00ffff,
                emissiveIntensity: 1,
                transparent: true,
                opacity: 0.7
            });
            const slingshot = new THREE.Mesh(slingshotGeometry, slingshotMaterial);
            slingshot.position.y = 20;
            slingshot.rotation.x = Math.PI / 2;
            group.add(slingshot);
        }
        
        return group;
    }

    updateGravityBodies() {
        for (const body of this.gravityBodiesData) {
            let mesh = this.gravityBodies[body.ID];
            
            if (!mesh) {
                const group = new THREE.Group();
                
                let bodyGeometry, bodyMaterial;
                
                if (body.Type === 'planet') {
                    bodyGeometry = new THREE.SphereGeometry(body.Radius, 32, 32);
                    bodyMaterial = new THREE.MeshPhongMaterial({
                        color: 0x4a9eff,
                        emissive: 0x2a5eff,
                        emissiveIntensity: 0.3,
                        transparent: true,
                        opacity: 0.9
                    });
                    
                    const ringGeometry = new THREE.RingGeometry(body.Radius * 1.2, body.Radius * 1.5, 64);
                    const ringMaterial = new THREE.MeshBasicMaterial({
                        color: 0x7eb8ff,
                        side: THREE.DoubleSide,
                        transparent: true,
                        opacity: 0.3
                    });
                    const ring = new THREE.Mesh(ringGeometry, ringMaterial);
                    ring.rotation.x = Math.PI / 2.5;
                    group.add(ring);
                    
                } else {
                    bodyGeometry = new THREE.OctahedronGeometry(body.Radius);
                    bodyMaterial = new THREE.MeshPhongMaterial({
                        color: 0xffd700,
                        emissive: 0xffa500,
                        emissiveIntensity: 0.4,
                        transparent: true,
                        opacity: 0.9
                    });
                }
                
                const bodyMesh = new THREE.Mesh(bodyGeometry, bodyMaterial);
                group.add(bodyMesh);
                
                for (let i = 1; i <= 3; i++) {
                    const fieldRadius = body.Radius * (1 + i * 0.8);
                    const fieldGeometry = new THREE.RingGeometry(fieldRadius - 2, fieldRadius + 2, 64);
                    const fieldMaterial = new THREE.MeshBasicMaterial({
                        color: new THREE.Color().setHSL(0.6 - i * 0.1, 0.8, 0.5),
                        side: THREE.DoubleSide,
                        transparent: true,
                        opacity: 0.15 / i
                    });
                    const fieldMesh = new THREE.Mesh(fieldGeometry, fieldMaterial);
                    fieldMesh.rotation.x = Math.PI / 2;
                    fieldMesh.userData = { radius: fieldRadius };
                    group.add(fieldMesh);
                }
                
                mesh = group;
                this.gravityBodies[body.ID] = mesh;
                this.scene.add(mesh);
            }
            
            mesh.position.set(body.Position.X, body.Position.Y, body.Position.Z);
            mesh.children.forEach((child, index) => {
                if (index > 0) {
                    child.rotation.z += 0.002 * index;
                }
            });
            mesh.rotation.y += 0.001;
        }
    }

    updatePlayersUI() {
        const container = document.getElementById('players-container');
        container.innerHTML = '';

        for (const [id, player] of Object.entries(this.gameState.Players || {})) {
            if (!player.Connected) continue;
            
            const div = document.createElement('div');
            div.className = 'player-item';
            div.innerHTML = `
                <span>${player.Name}</span>
                <span class="player-score">${player.Score}</span>
            `;
            container.appendChild(div);
        }
    }

    updatePlayerStats() {
        const player = this.gameState?.Players?.[this.playerId];
        if (!player || !player.Drone) return;

        document.getElementById('score').textContent = player.Score;
        
        const minutes = Math.floor(player.DailyTime / 60);
        const seconds = player.DailyTime % 60;
        document.getElementById('daily-time').textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;

        const fuelPercent = (player.Drone.Fuel / player.Drone.MaxFuel) * 100;
        const cargoPercent = (player.Drone.Cargo / player.Drone.MaxCargo) * 100;
        document.getElementById('fuel-bar').style.width = `${fuelPercent}%`;
        document.getElementById('cargo-bar').style.width = `${cargoPercent}%`;

        this.updateGravityInfo(player.Drone);
    }

    updateGravityInfo(drone) {
        const nameEl = document.getElementById('gravity-body-name');
        const strengthEl = document.getElementById('gravity-strength');
        const bonusEl = document.getElementById('fuel-bonus');

        if (drone.GravityInfluence) {
            const bodyId = drone.GravityInfluence.BodyID;
            const body = this.gravityBodiesData.find(b => b.ID === bodyId);
            nameEl.textContent = body ? body.Name : '引力场';
            
            const strengthPercent = (drone.GravityInfluence.Strength * 100).toFixed(1);
            const bonusPercent = (drone.GravityInfluence.FuelBonus * 100).toFixed(1);
            
            strengthEl.textContent = `引力强度: ${strengthPercent}%`;
            bonusEl.textContent = `燃料节省: ${bonusPercent}%`;
            
            if (drone.GravityInfluence.InSlingshotZone) {
                bonusEl.style.color = '#00ff00';
                bonusEl.style.fontWeight = 'bold';
            } else {
                bonusEl.style.color = '#00ffff';
                bonusEl.style.fontWeight = 'normal';
            }
        } else {
            nameEl.textContent = '无引力影响';
            strengthEl.textContent = '引力强度: 0%';
            bonusEl.textContent = '燃料节省: 0%';
            bonusEl.style.color = '#00ffff';
            bonusEl.style.fontWeight = 'normal';
        }
    }

    updateDrones() {
        if (!this.showPlayers) return;

        const drones = this.gameState?.Drones || {};
        const players = this.gameState?.Players || {};

        for (const [id, drone] of Object.entries(drones)) {
            let mesh = this.drones[id];
            
            if (!mesh) {
                const droneGroup = new THREE.Group();
                
                const bodyGeometry = new THREE.OctahedronGeometry(8);
                const bodyMaterial = new THREE.MeshPhongMaterial({ 
                    color: this.getDroneColor(id, drone.State, players),
                    emissive: this.getDroneColor(id, drone.State, players),
                    emissiveIntensity: 0.5
                });
                const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
                body.name = 'body';
                droneGroup.add(body);

                const propGeometry = new THREE.CylinderGeometry(0, 5, 1, 4);
                const propMaterial = new THREE.MeshPhongMaterial({ color: 0xffffff });
                for (let i = 0; i < 4; i++) {
                    const prop = new THREE.Mesh(propGeometry, propMaterial);
                    const angle = (i / 4) * Math.PI * 2;
                    prop.position.set(Math.cos(angle) * 10, 0, Math.sin(angle) * 10);
                    prop.rotation.z = Math.PI / 2;
                    droneGroup.add(prop);
                }

                const stateLabel = this.createStateLabel(drone.State, drone);
                stateLabel.name = 'stateLabel';
                droneGroup.add(stateLabel);

                mesh = droneGroup;
                this.drones[id] = mesh;
                this.scene.add(mesh);
            } else {
                const body = mesh.getObjectByName('body');
                if (body) {
                    body.material.color.setHex(this.getDroneColor(id, drone.State, players));
                    body.material.emissive.setHex(this.getDroneColor(id, drone.State, players));
                }
                
                const oldLabel = mesh.getObjectByName('stateLabel');
                if (oldLabel) {
                    mesh.remove(oldLabel);
                }
                const newLabel = this.createStateLabel(drone.State, drone);
                newLabel.name = 'stateLabel';
                mesh.add(newLabel);
            }

            mesh.position.set(drone.Position.X, drone.Position.Y, drone.Position.Z);
            
            if (drone.Path && drone.Path.length > 0) {
                this.drawPath(drone.Path, id);
            }
        }

        for (const id of Object.keys(this.drones)) {
            if (!drones[id]) {
                this.scene.remove(this.drones[id]);
                delete this.drones[id];
            }
        }
    }

    drawPath(path, droneId) {
        const pathId = `path_${droneId}`;
        if (this[pathId]) {
            this.scene.remove(this[pathId]);
        }

        const points = path.map(p => new THREE.Vector3(p.X, p.Y, p.Z));
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const material = new THREE.LineBasicMaterial({ color: 0x00ff00, linewidth: 2 });
        const line = new THREE.Line(geometry, material);
        this[pathId] = line;
        this.scene.add(line);
    }

    updateDebris() {
        const debrisList = this.gameState?.DebrisList || [];

        for (const debris of debrisList) {
            if (debris.Collected) {
                if (this.debris[debris.ID]) {
                    this.scene.remove(this.debris[debris.ID]);
                    delete this.debris[debris.ID];
                }
                continue;
            }

            let mesh = this.debris[debris.ID];
            
            if (!mesh) {
                const geometry = new THREE.DodecahedronGeometry(Math.sqrt(debris.Weight) * 2);
                const material = new THREE.MeshPhongMaterial({ 
                    color: 0xffd700,
                    emissive: 0xff6600,
                    emissiveIntensity: 0.3
                });
                mesh = new THREE.Mesh(geometry, material);
                this.debris[debris.ID] = mesh;
                this.scene.add(mesh);
            }

            mesh.position.set(debris.Position.X, debris.Position.Y, debris.Position.Z);
            mesh.rotation.x += 0.01;
            mesh.rotation.y += 0.01;
        }
    }

    updateObstacles() {
        const obstacleList = this.gameState?.Obstacles || [];

        for (const obstacle of obstacleList) {
            let mesh = this.obstacles[obstacle.ID];
            
            if (!mesh) {
                const geometry = new THREE.IcosahedronGeometry(obstacle.Radius);
                const material = new THREE.MeshPhongMaterial({ 
                    color: 0xff4444,
                    emissive: 0xff0000,
                    emissiveIntensity: 0.5,
                    transparent: true,
                    opacity: 0.7
                });
                mesh = new THREE.Mesh(geometry, material);
                this.obstacles[obstacle.ID] = mesh;
                this.scene.add(mesh);
            }

            mesh.position.set(obstacle.Position.X, obstacle.Position.Y, obstacle.Position.Z);
            mesh.rotation.x += 0.005;
            mesh.rotation.z += 0.003;
        }
    }

    updateHeatMap(heatMap) {
        if (!this.showHeatMap) return;

        for (const cube of this.heatMapCubes) {
            this.scene.remove(cube);
        }
        this.heatMapCubes = [];

        for (const cell of heatMap) {
            const intensity = Math.min(cell.Density / 5, 1);
            const geometry = new THREE.BoxGeometry(50, 50, 50);
            const material = new THREE.MeshBasicMaterial({ 
                color: new THREE.Color().setHSL(0.6 - intensity * 0.6, 1, 0.5),
                transparent: true,
                opacity: 0.3
            });
            const cube = new THREE.Mesh(geometry, material);
            cube.position.set(cell.Position.X, cell.Position.Y, cell.Position.Z);
            this.heatMapCubes.push(cube);
            this.scene.add(cube);
        }
    }

    toggleHeatMap() {
        this.showHeatMap = !this.showHeatMap;
        const btn = document.getElementById('show-heatmap');
        btn.textContent = this.showHeatMap ? '隐藏热力图' : '显示热力图';
        
        if (!this.showHeatMap) {
            for (const cube of this.heatMapCubes) {
                this.scene.remove(cube);
            }
            this.heatMapCubes = [];
        }
    }

    addTestDrone() {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({
                type: 'addTestDrone',
                data: {}
            }));
        }
    }

    togglePlayers() {
        this.showPlayers = !this.showPlayers;
        const btn = document.getElementById('show-players');
        btn.textContent = this.showPlayers ? '隐藏玩家' : '显示玩家';
        
        if (!this.showPlayers) {
            for (const id of Object.keys(this.drones)) {
                this.scene.remove(this.drones[id]);
                delete this.drones[id];
            }
        }
    }

    showReplayPanel() {
        document.getElementById('replay-panel').classList.remove('hidden');
        this.ws.send(JSON.stringify({ type: 'getHistory' }));
    }

    hideReplayPanel() {
        document.getElementById('replay-panel').classList.add('hidden');
        this.isReplaying = false;
    }

    playReplay() {
        if (this.history.length === 0) return;
        this.isReplaying = true;
        this.animateReplay();
    }

    pauseReplay() {
        this.isReplaying = false;
    }

    seekReplay(value) {
        this.replayIndex = parseInt(value);
        this.showReplayFrame(this.replayIndex);
    }

    animateReplay() {
        if (!this.isReplaying) return;
        if (this.replayIndex >= this.history.length) {
            this.isReplaying = false;
            return;
        }

        this.showReplayFrame(this.replayIndex);
        document.getElementById('replay-slider').value = this.replayIndex;
        this.replayIndex++;

        setTimeout(() => this.animateReplay(), 100);
    }

    showReplayFrame(index) {
        if (!this.history[index]) return;
        const state = JSON.parse(this.history[index].State);
        this.gameState = state;
        this.updateGameState();
    }

    animate() {
        requestAnimationFrame(() => this.animate());
        this.renderer.render(this.scene, this.camera);
    }
}

window.addEventListener('DOMContentLoaded', () => {
    new SpaceGame();
});
