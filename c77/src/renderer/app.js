const { ipcRenderer } = require('electron');
const axios = require('axios');
const Chart = require('chart.js/auto');

let scene, camera, renderer, proteinGroup, ligandGroup, heatmapGroup;
let energyChart, rmsdChart, rgChart, residueChart;
let simulationRunning = false;
let simulationId = null;
let dockingId = null;
let backendUrl = 'http://localhost:5000';

let energyData = [];
let rmsdData = [];
let rgData = [];
let timeLabels = [];

let currentDockingResult = null;
let showHeatmap = false;

const MAX_DATA_POINTS = 200;

async function init() {
    await initBackend();
    initThreeJS();
    initCharts();
    setupEventListeners();
    animate();
}

async function initBackend() {
    try {
        const result = await ipcRenderer.invoke('start-python-server');
        console.log('Python server started on port', result.port);
    } catch (error) {
        console.error('Failed to start Python server:', error);
    }
}

function initThreeJS() {
    const canvas = document.getElementById('canvas3d');
    
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0a1a);
    
    camera = new THREE.PerspectiveCamera(75, canvas.clientWidth / canvas.clientHeight, 0.1, 1000);
    camera.position.z = 50;
    
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setSize(canvas.clientWidth, canvas.clientHeight);
    
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(10, 20, 10);
    scene.add(directionalLight);
    
    const backLight = new THREE.DirectionalLight(0xffffff, 0.3);
    backLight.position.set(-10, -10, -10);
    scene.add(backLight);
    
    proteinGroup = new THREE.Group();
    ligandGroup = new THREE.Group();
    heatmapGroup = new THREE.Group();
    scene.add(proteinGroup);
    scene.add(ligandGroup);
    scene.add(heatmapGroup);
    
    window.addEventListener('resize', onWindowResize);
    setupOrbitControls();
}

function setupOrbitControls() {
    let isDragging = false;
    let previousMousePosition = { x: 0, y: 0 };
    let rotationSpeed = 0.005;
    let zoomSpeed = 0.05;
    
    const canvas = document.getElementById('canvas3d');
    
    canvas.addEventListener('mousedown', (e) => {
        isDragging = true;
        previousMousePosition = { x: e.clientX, y: e.clientY };
    });
    
    canvas.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        
        const deltaX = e.clientX - previousMousePosition.x;
        const deltaY = e.clientY - previousMousePosition.y;
        
        proteinGroup.rotation.y += deltaX * rotationSpeed;
        proteinGroup.rotation.x += deltaY * rotationSpeed;
        
        previousMousePosition = { x: e.clientX, y: e.clientY };
    });
    
    canvas.addEventListener('mouseup', () => {
        isDragging = false;
    });
    
    canvas.addEventListener('mouseleave', () => {
        isDragging = false;
    });
    
    canvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        camera.position.z += e.deltaY * zoomSpeed;
        camera.position.z = Math.max(10, Math.min(200, camera.position.z));
    });
}

function initCharts() {
    const chartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { display: false }
        },
        scales: {
            x: {
                grid: { color: 'rgba(255,255,255,0.1)' },
                ticks: { color: '#888', font: { size: 9 } }
            },
            y: {
                grid: { color: 'rgba(255,255,255,0.1)' },
                ticks: { color: '#888', font: { size: 9 } }
            }
        }
    };

    energyChart = new Chart(document.getElementById('energyChart'), {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                data: [],
                borderColor: '#e94560',
                backgroundColor: 'rgba(233, 69, 96, 0.1)',
                fill: true,
                tension: 0.4,
                pointRadius: 0
            }]
        },
        options: chartOptions
    });

    rmsdChart = new Chart(document.getElementById('rmsdChart'), {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                data: [],
                borderColor: '#4ade80',
                backgroundColor: 'rgba(74, 222, 128, 0.1)',
                fill: true,
                tension: 0.4,
                pointRadius: 0
            }]
        },
        options: chartOptions
    });

    rgChart = new Chart(document.getElementById('rgChart'), {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                data: [],
                borderColor: '#60a5fa',
                backgroundColor: 'rgba(96, 165, 250, 0.1)',
                fill: true,
                tension: 0.4,
                pointRadius: 0
            }]
        },
        options: chartOptions
    });

    residueChart = new Chart(document.getElementById('residueChart'), {
        type: 'bar',
        data: {
            labels: [],
            datasets: [{
                data: [],
                backgroundColor: [],
                borderWidth: 1
            }]
        },
        options: {
            ...chartOptions,
            indexAxis: 'y',
            scales: {
                x: {
                    grid: { color: 'rgba(255,255,255,0.1)' },
                    ticks: { color: '#888', font: { size: 9 } },
                    title: { display: true, text: 'ΔG (kcal/mol)', color: '#888', font: { size: 10 } }
                },
                y: {
                    grid: { color: 'rgba(255,255,255,0.1)' },
                    ticks: { color: '#888', font: { size: 8 } }
                }
            }
        }
    });
}

function setupEventListeners() {
    document.getElementById('fileUpload').addEventListener('click', () => {
        document.getElementById('pdbFile').click();
    });

    document.getElementById('pdbFile').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            document.getElementById('fileName').textContent = `Selected: ${file.name}`;
            document.getElementById('pdbId').value = '';
        }
    });

    document.getElementById('sdfUpload').addEventListener('click', () => {
        document.getElementById('sdfFile').click();
    });

    document.getElementById('sdfFile').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            document.getElementById('sdfFileName').textContent = `Selected: ${file.name}`;
        }
    });

    document.getElementById('startBtn').addEventListener('click', startSimulation);
    document.getElementById('stopBtn').addEventListener('click', stopSimulation);
    document.getElementById('downloadDcd').addEventListener('click', downloadDcd);
    document.getElementById('downloadPng').addEventListener('click', takeSnapshot);

    document.getElementById('startDockingBtn').addEventListener('click', startDocking);
    document.getElementById('showHeatmapBtn').addEventListener('click', toggleHeatmap);
}

async function startSimulation() {
    const pdbId = document.getElementById('pdbId').value.trim();
    const pdbFile = document.getElementById('pdbFile').files[0];

    if (!pdbId && !pdbFile) {
        alert('Please enter a PDB ID or upload a PDB file');
        return;
    }

    document.getElementById('startBtn').disabled = true;
    document.getElementById('stopBtn').disabled = false;
    document.getElementById('statusSection').classList.remove('hidden');
    document.getElementById('statusText').textContent = 'Preparing...';

    try {
        let formData = new FormData();
        
        if (pdbId) {
            formData.append('pdb_id', pdbId);
        } else if (pdbFile) {
            formData.append('pdb_file', pdbFile);
        }

        const response = await axios.post(`${backendUrl}/api/start-simulation`, formData, {
            headers: { 'Content-Type': 'multipart/form-data' }
        });

        simulationId = response.data.simulation_id;
        simulationRunning = true;

        document.getElementById('statusText').textContent = 'Running...';
        pollSimulationStatus();

    } catch (error) {
        console.error('Error starting simulation:', error);
        document.getElementById('statusText').textContent = 'Error';
        document.getElementById('startBtn').disabled = false;
        document.getElementById('stopBtn').disabled = true;
    }
}

async function stopSimulation() {
    if (!simulationId) return;

    try {
        await axios.post(`${backendUrl}/api/stop-simulation`, { simulation_id: simulationId });
        simulationRunning = false;
        document.getElementById('statusText').textContent = 'Stopped';
        document.getElementById('startBtn').disabled = false;
        document.getElementById('stopBtn').disabled = true;
        document.getElementById('downloadButtons').classList.remove('hidden');
    } catch (error) {
        console.error('Error stopping simulation:', error);
    }
}

async function pollSimulationStatus() {
    while (simulationRunning) {
        try {
            const response = await axios.get(`${backendUrl}/api/simulation-status/${simulationId}`);
            const data = response.data;

            updateStatus(data);
            updateCharts(data);

            if (data.status === 'completed' || data.status === 'failed') {
                simulationRunning = false;
                document.getElementById('startBtn').disabled = false;
                document.getElementById('stopBtn').disabled = true;
                document.getElementById('downloadButtons').classList.remove('hidden');
                document.getElementById('statusText').textContent = data.status === 'completed' ? 'Completed' : 'Failed';
                break;
            }

            if (data.coordinates && data.coordinates.length > 0) {
                updateProteinStructure(data.coordinates);
            }

        } catch (error) {
            console.error('Error polling status:', error);
        }

        await new Promise(resolve => setTimeout(resolve, 1000));
    }
}

function updateStatus(data) {
    const progress = Math.min((data.current_step / data.total_steps) * 100, 100);
    document.getElementById('progressFill').style.width = `${progress}%`;
    
    const currentNs = (data.current_step * 0.002).toFixed(2);
    document.getElementById('timeProgress').textContent = `${currentNs} ns / 100 ns`;
    
    document.getElementById('currentEnergy').textContent = data.energy ? data.energy.toFixed(2) : '0';
    document.getElementById('currentRmsd').textContent = data.rmsd ? data.rmsd.toFixed(3) : '0';
    document.getElementById('currentRg').textContent = data.rg ? data.rg.toFixed(3) : '0';
    document.getElementById('nsPerDay').textContent = data.ns_per_day ? `${data.ns_per_day.toFixed(1)} ns/day` : '--';
}

function updateCharts(data) {
    const currentNs = (data.current_step * 0.002).toFixed(2);
    
    if (data.energy) {
        energyData.push(data.energy);
        timeLabels.push(currentNs);
        
        if (energyData.length > MAX_DATA_POINTS) {
            energyData.shift();
            timeLabels.shift();
        }
    }
    
    if (data.rmsd) {
        rmsdData.push(data.rmsd);
        if (rmsdData.length > MAX_DATA_POINTS) rmsdData.shift();
    }
    
    if (data.rg) {
        rgData.push(data.rg);
        if (rgData.length > MAX_DATA_POINTS) rgData.shift();
    }

    energyChart.data.labels = timeLabels;
    energyChart.data.datasets[0].data = energyData;
    energyChart.update('none');

    rmsdChart.data.labels = timeLabels;
    rmsdChart.data.datasets[0].data = rmsdData;
    rmsdChart.update('none');

    rgChart.data.labels = timeLabels;
    rgChart.data.datasets[0].data = rgData;
    rgChart.update('none');
}

function updateProteinStructure(coordinates) {
    if (!coordinates || coordinates.length === 0) return;
    
    while (proteinGroup.children.length > 0) {
        const child = proteinGroup.children[0];
        if (child.geometry) child.geometry.dispose();
        if (child.material) child.material.dispose();
        proteinGroup.remove(child);
    }

    const atomGeometry = new THREE.SphereGeometry(0.5, 6, 6);
    const atomMaterial = new THREE.MeshLambertMaterial({ color: 0x3366ff });
    
    const positions = new Float32Array(coordinates.length * 3);
    
    coordinates.forEach((atom, index) => {
        positions[index * 3] = atom.x * 0.5;
        positions[index * 3 + 1] = atom.y * 0.5;
        positions[index * 3 + 2] = atom.z * 0.5;
        
        const sphere = new THREE.Mesh(atomGeometry, atomMaterial.clone());
        sphere.position.set(atom.x * 0.5, atom.y * 0.5, atom.z * 0.5);
        proteinGroup.add(sphere);
    });
    
    atomGeometry.dispose();
    atomMaterial.dispose();
}

async function downloadDcd() {
    if (!simulationId) return;

    try {
        const response = await axios.get(`${backendUrl}/api/download-dcd/${simulationId}`, {
            responseType: 'blob'
        });

        const blob = new Blob([response.data], { type: 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `trajectory_${simulationId}.dcd`;
        a.click();
        URL.revokeObjectURL(url);
    } catch (error) {
        console.error('Error downloading DCD:', error);
    }
}

function takeSnapshot() {
    renderer.render(scene, camera);
    const canvas = document.getElementById('canvas3d');
    const dataUrl = canvas.toDataURL('image/png');
    
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `snapshot_${Date.now()}.png`;
    a.click();
}

function onWindowResize() {
    const canvas = document.getElementById('canvas3d');
    camera.aspect = canvas.clientWidth / canvas.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(canvas.clientWidth, canvas.clientHeight);
}

function animate() {
    requestAnimationFrame(animate);
    renderer.render(scene, camera);
}

init();
