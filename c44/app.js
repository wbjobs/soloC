import * as THREE from 'three';

const WIDTH = 600;
const HEIGHT = 400;
const DEPTH = 300;
let PARTICLE_SIZE = 8;

let scene, camera, renderer;
let particleGeometry, particleMaterial, particleSystem;
let sph;
let raycaster, mouse;
let wasm;
let isPaused = false;
let colorMode = 'fixed';

let lastTime = 0;
let frameCount = 0;

async function init() {
    wasm = await import('./pkg/sph_simulator.js');
    await wasm.default();
    
    sph = wasm.SPHSystem.new(WIDTH, HEIGHT, DEPTH);
    
    for (let i = 0; i < 200; i++) {
        const x = 100 + Math.random() * 200;
        const y = 250 + Math.random() * 100;
        const z = 100 + Math.random() * 100;
        sph.add_particle(x, y, z);
    }
    
    initThreeJS();
    initParticles();
    initInteraction();
    initControls();
    
    document.getElementById('loading').style.display = 'none';
    
    animate();
}

function initThreeJS() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1a2e);
    
    camera = new THREE.PerspectiveCamera(
        60,
        window.innerWidth / window.innerHeight,
        0.1,
        2000
    );
    camera.position.set(WIDTH / 2 + 300, HEIGHT / 2 + 200, DEPTH + 400);
    camera.lookAt(WIDTH / 2, HEIGHT / 2, DEPTH / 2);
    
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    document.getElementById('canvas-container').appendChild(renderer.domElement);
    
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(200, 400, 200);
    scene.add(directionalLight);
    
    createBoundaryBox();
    
    window.addEventListener('resize', onWindowResize);
}

function createBoundaryBox() {
    const geometry = new THREE.BoxGeometry(WIDTH, HEIGHT, DEPTH);
    const edges = new THREE.EdgesGeometry(geometry);
    const lineMaterial = new THREE.LineBasicMaterial({ color: 0x4a90d9, opacity: 0.3, transparent: true });
    const wireframe = new THREE.LineSegments(edges, lineMaterial);
    wireframe.position.set(WIDTH / 2, HEIGHT / 2, DEPTH / 2);
    scene.add(wireframe);
    
    const floorGeometry = new THREE.PlaneGeometry(WIDTH, DEPTH);
    const floorMaterial = new THREE.MeshBasicMaterial({ 
        color: 0x16213e, 
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.5
    });
    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(WIDTH / 2, 0, DEPTH / 2);
    scene.add(floor);
}

function initParticles() {
    const count = sph.particle_count();
    particleGeometry = new THREE.BufferGeometry();
    
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    
    updatePositionsFromWasm(positions);
    
    for (let i = 0; i < count; i++) {
        colors[i * 3] = 0.0;
        colors[i * 3 + 1] = 0.83;
        colors[i * 3 + 2] = 1.0;
    }
    
    particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    particleGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    
    particleMaterial = new THREE.PointsMaterial({
        size: PARTICLE_SIZE,
        vertexColors: true,
        transparent: true,
        opacity: 0.9,
        sizeAttenuation: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    });
    
    particleSystem = new THREE.Points(particleGeometry, particleMaterial);
    scene.add(particleSystem);
}

function updatePositionsFromWasm(positions) {
    const ptr = sph.get_positions_ptr();
    const count = sph.particle_count();
    const wasmMemory = new Float32Array(wasm.memory.buffer, ptr, count * 3);
    positions.set(wasmMemory);
}

function getDensitiesFromWasm() {
    const ptr = sph.get_densities_ptr();
    const count = sph.particle_count();
    return new Float32Array(wasm.memory.buffer, ptr, count);
}

function getVelocitiesFromWasm() {
    const ptr = sph.get_velocities_ptr();
    const count = sph.particle_count();
    return new Float32Array(wasm.memory.buffer, ptr, count * 3);
}

function densityToColor(density, minDensity, maxDensity) {
    const t = Math.max(0, Math.min(1, (density - minDensity) / (maxDensity - minDensity)));
    
    const r = t;
    const g = 1.0 - Math.abs(t - 0.5) * 2;
    const b = 1.0 - t;
    
    return { r, g, b };
}

function velocityToColor(vx, vy, vz, maxSpeed) {
    const speed = Math.sqrt(vx * vx + vy * vy + vz * vz);
    const t = Math.max(0, Math.min(1, speed / maxSpeed));
    
    const hue = (1.0 - t) * 0.66;
    const color = new THREE.Color().setHSL(hue, 1.0, 0.5);
    
    return { r: color.r, g: color.g, b: color.b };
}

function updateParticleColors() {
    const count = sph.particle_count();
    const colors = particleGeometry.attributes.color.array;
    
    if (colorMode === 'fixed') {
        for (let i = 0; i < count; i++) {
            colors[i * 3] = 0.0;
            colors[i * 3 + 1] = 0.83;
            colors[i * 3 + 2] = 1.0;
        }
        document.getElementById('colorbar').style.display = 'none';
    } else if (colorMode === 'density') {
        const densities = getDensitiesFromWasm();
        let minDensity = Infinity;
        let maxDensity = -Infinity;
        for (let d of densities) {
            minDensity = Math.min(minDensity, d);
            maxDensity = Math.max(maxDensity, d);
        }
        
        for (let i = 0; i < count; i++) {
            const color = densityToColor(densities[i], minDensity, maxDensity);
            colors[i * 3] = color.r;
            colors[i * 3 + 1] = color.g;
            colors[i * 3 + 2] = color.b;
        }
        
        document.getElementById('colorbar').style.display = 'flex';
        document.getElementById('color-mode-label').textContent = '密度';
        document.getElementById('color-min').textContent = minDensity.toFixed(0);
        document.getElementById('color-max').textContent = maxDensity.toFixed(0);
        document.getElementById('color-gradient').style.background = 
            'linear-gradient(to right, blue, cyan, yellow, red)';
    } else if (colorMode === 'velocity') {
        const velocities = getVelocitiesFromWasm();
        let maxSpeed = 0;
        for (let i = 0; i < count; i++) {
            const vx = velocities[i * 3];
            const vy = velocities[i * 3 + 1];
            const vz = velocities[i * 3 + 2];
            const speed = Math.sqrt(vx * vx + vy * vy + vz * vz);
            maxSpeed = Math.max(maxSpeed, speed);
        }
        
        for (let i = 0; i < count; i++) {
            const vx = velocities[i * 3];
            const vy = velocities[i * 3 + 1];
            const vz = velocities[i * 3 + 2];
            const color = velocityToColor(vx, vy, vz, maxSpeed);
            colors[i * 3] = color.r;
            colors[i * 3 + 1] = color.g;
            colors[i * 3 + 2] = color.b;
        }
        
        document.getElementById('colorbar').style.display = 'flex';
        document.getElementById('color-mode-label').textContent = '速度';
        document.getElementById('color-min').textContent = '0';
        document.getElementById('color-max').textContent = maxSpeed.toFixed(0);
        document.getElementById('color-gradient').style.background = 
            'linear-gradient(to right, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff)';
    }
    
    particleGeometry.attributes.color.needsUpdate = true;
}

function initInteraction() {
    raycaster = new THREE.Raycaster();
    mouse = new THREE.Vector2();
    
    const planeGeometry = new THREE.PlaneGeometry(WIDTH, DEPTH);
    const planeMaterial = new THREE.MeshBasicMaterial({ 
        visible: false,
        side: THREE.DoubleSide
    });
    const interactionPlane = new THREE.Mesh(planeGeometry, planeMaterial);
    interactionPlane.rotation.x = -Math.PI / 2;
    interactionPlane.position.set(WIDTH / 2, HEIGHT / 2, DEPTH / 2);
    scene.add(interactionPlane);
    
    window.addEventListener('click', (event) => {
        if (event.target.tagName === 'SELECT' || event.target.tagName === 'BUTTON') return;
        
        mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
        mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
        
        raycaster.setFromCamera(mouse, camera);
        
        const intersects = raycaster.intersectObject(interactionPlane);
        
        if (intersects.length > 0) {
            const point = intersects[0].point;
            
            for (let i = 0; i < 20; i++) {
                const x = Math.max(5, Math.min(WIDTH - 5, point.x + (Math.random() - 0.5) * 40));
                const y = Math.max(5, Math.min(HEIGHT - 5, point.y + (Math.random() - 0.5) * 40 + 30));
                const z = Math.max(5, Math.min(DEPTH - 5, point.z + (Math.random() - 0.5) * 40));
                sph.add_particle(x, y, z);
            }
            
            const newCount = sph.particle_count();
            const newPositions = new Float32Array(newCount * 3);
            const newColors = new Float32Array(newCount * 3);
            
            particleGeometry.dispose();
            particleGeometry = new THREE.BufferGeometry();
            particleGeometry.setAttribute('position', new THREE.BufferAttribute(newPositions, 3));
            particleGeometry.setAttribute('color', new THREE.BufferAttribute(newColors, 3));
            particleSystem.geometry = particleGeometry;
            
            document.getElementById('particle-count').textContent = `粒子数量: ${newCount}`;
        }
    });
}

function initControls() {
    document.getElementById('color-mode').addEventListener('change', (e) => {
        colorMode = e.target.value;
        updateParticleColors();
    });
    
    document.getElementById('particle-size').addEventListener('change', (e) => {
        PARTICLE_SIZE = parseInt(e.target.value);
        particleMaterial.size = PARTICLE_SIZE;
    });
    
    document.getElementById('export-vtk').addEventListener('click', exportVTK);
    
    document.getElementById('pause-sim').addEventListener('click', (e) => {
        isPaused = !isPaused;
        e.target.textContent = isPaused ? '继续模拟' : '暂停模拟';
    });
}

function exportVTK() {
    const count = sph.particle_count();
    const positions = particleGeometry.attributes.position.array;
    const velocities = getVelocitiesFromWasm();
    const densities = getDensitiesFromWasm();
    
    let vtkContent = '# vtk DataFile Version 3.0\n';
    vtkContent += 'SPH Fluid Simulation Export\n';
    vtkContent += 'ASCII\n';
    vtkContent += 'DATASET POLYDATA\n';
    vtkContent += `POINTS ${count} float\n`;
    
    for (let i = 0; i < count; i++) {
        vtkContent += `${positions[i * 3]} ${positions[i * 3 + 1]} ${positions[i * 3 + 2]}\n`;
    }
    
    vtkContent += `\nVERTICES ${count} ${count * 2}\n`;
    for (let i = 0; i < count; i++) {
        vtkContent += `1 ${i}\n`;
    }
    
    vtkContent += `\nPOINT_DATA ${count}\n`;
    
    vtkContent += '\nVECTORS velocity float\n';
    for (let i = 0; i < count; i++) {
        vtkContent += `${velocities[i * 3]} ${velocities[i * 3 + 1]} ${velocities[i * 3 + 2]}\n`;
    }
    
    vtkContent += '\nSCALARS density float 1\n';
    vtkContent += 'LOOKUP_TABLE default\n';
    for (let i = 0; i < count; i++) {
        vtkContent += `${densities[i]}\n`;
    }
    
    vtkContent += '\nSCALARS speed float 1\n';
    vtkContent += 'LOOKUP_TABLE default\n';
    for (let i = 0; i < count; i++) {
        const vx = velocities[i * 3];
        const vy = velocities[i * 3 + 1];
        const vz = velocities[i * 3 + 2];
        const speed = Math.sqrt(vx * vx + vy * vy + vz * vz);
        vtkContent += `${speed}\n`;
    }
    
    const blob = new Blob([vtkContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const timestamp = new Date().toISOString().slice(0, 19).replace(/[:]/g, '-');
    a.download = `sph_fluid_${timestamp}.vtk`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function animate(time) {
    requestAnimationFrame(animate);
    
    if (time - lastTime >= 1000) {
        document.getElementById('fps').textContent = `FPS: ${frameCount}`;
        frameCount = 0;
        lastTime = time;
    }
    frameCount++;
    
    if (!isPaused) {
        const substeps = 2;
        for (let i = 0; i < substeps; i++) {
            sph.update();
        }
        
        const positions = particleGeometry.attributes.position.array;
        updatePositionsFromWasm(positions);
        particleGeometry.attributes.position.needsUpdate = true;
        
        updateParticleColors();
    }
    
    const t = time * 0.0003;
    camera.position.x = WIDTH / 2 + Math.cos(t) * 350;
    camera.position.z = DEPTH / 2 + Math.sin(t) * 350;
    camera.position.y = HEIGHT / 2 + 150 + Math.sin(t * 0.7) * 50;
    camera.lookAt(WIDTH / 2, HEIGHT / 2, DEPTH / 2);
    
    renderer.render(scene, camera);
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

init();
