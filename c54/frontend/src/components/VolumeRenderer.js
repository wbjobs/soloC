import * as THREE from 'three'
import { VolumeDataGenerator } from '../utils/VolumeDataGenerator.js'

const vertexShader = `
varying vec3 vWorldPosition;
varying vec3 vLocalPosition;

void main() {
    vLocalPosition = position;
    vWorldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const fragmentShader = `
precision highp float;
precision highp sampler3D;

uniform sampler3D uVolumeData;
uniform float uIsoValue;
uniform float uStepSize;
uniform int uMaxSteps;
uniform float uOpacity;
uniform vec3 uColorLow;
uniform vec3 uColorHigh;
uniform int uRenderMode;
uniform float uTime;

varying vec3 vWorldPosition;
varying vec3 vLocalPosition;

uniform vec3 uCameraPos;
uniform mat4 uInverseModelMatrix;

vec2 rayBoxIntersect(vec3 rayOrigin, vec3 rayDir, vec3 boxMin, vec3 boxMax) {
    vec3 tMin = (boxMin - rayOrigin) / rayDir;
    vec3 tMax = (boxMax - rayOrigin) / rayDir;
    vec3 t1 = min(tMin, tMax);
    vec3 t2 = max(tMin, tMax);
    float tNear = max(max(t1.x, t1.y), t1.z);
    float tFar = min(min(t2.x, t2.y), t2.z);
    return vec2(tNear, tFar);
}

float sampleVolume(vec3 pos) {
    vec3 uv = pos * 0.5 + 0.5;
    return texture(uVolumeData, uv).r;
}

vec3 getGradient(vec3 pos) {
    float delta = uStepSize;
    float dx = sampleVolume(pos + vec3(delta, 0.0, 0.0)) - sampleVolume(pos - vec3(delta, 0.0, 0.0));
    float dy = sampleVolume(pos + vec3(0.0, delta, 0.0)) - sampleVolume(pos - vec3(0.0, delta, 0.0));
    float dz = sampleVolume(pos + vec3(0.0, 0.0, delta)) - sampleVolume(pos - vec3(0.0, 0.0, delta));
    return normalize(vec3(dx, dy, dz) / (2.0 * delta));
}

vec4 compositeDVR(float density, vec3 color, float alpha, vec4 accumulated) {
    float opacity = alpha * uOpacity;
    vec3 rgb = color * opacity;
    float a = opacity * (1.0 - accumulated.a);
    return vec4(accumulated.rgb + rgb * (1.0 - accumulated.a), accumulated.a + a);
}

vec4 renderMIP(vec3 rayOrigin, vec3 rayDir, float tNear, float tFar) {
    float maxDensity = 0.0;
    vec3 maxPos = rayOrigin + rayDir * tNear;
    
    for (int i = 0; i < 256; i++) {
        if (i >= uMaxSteps) break;
        float t = tNear + float(i) * uStepSize;
        if (t > tFar) break;
        
        vec3 pos = rayOrigin + rayDir * t;
        float density = sampleVolume(pos);
        
        if (density > maxDensity) {
            maxDensity = density;
            maxPos = pos;
        }
    }
    
    vec3 color = mix(uColorLow, uColorHigh, maxDensity);
    vec3 normal = getGradient(maxPos);
    vec3 lightDir = normalize(vec3(1.0, 1.0, 1.0));
    float diff = max(dot(normal, lightDir), 0.0);
    color = color * (0.3 + 0.7 * diff);
    
    return vec4(color, maxDensity * uOpacity);
}

vec4 renderDVR(vec3 rayOrigin, vec3 rayDir, float tNear, float tFar) {
    vec4 result = vec4(0.0);
    vec3 lightDir = normalize(vec3(1.0, 1.0, 1.0));
    
    for (int i = 0; i < 256; i++) {
        if (i >= uMaxSteps) break;
        float t = tNear + float(i) * uStepSize;
        if (t > tFar) break;
        if (result.a > 0.95) break;
        
        vec3 pos = rayOrigin + rayDir * t;
        float density = sampleVolume(pos);
        
        if (density > uIsoValue) {
            vec3 normal = getGradient(pos);
            float diff = max(dot(normal, lightDir), 0.0);
            vec3 color = mix(uColorLow, uColorHigh, density);
            color = color * (0.3 + 0.7 * diff);
            
            float alpha = smoothstep(uIsoValue, uIsoValue + 0.2, density);
            result = compositeDVR(density, color, alpha, result);
        }
    }
    
    return result;
}

vec4 renderISO(vec3 rayOrigin, vec3 rayDir, float tNear, float tFar) {
    for (int i = 0; i < 256; i++) {
        if (i >= uMaxSteps) break;
        float t = tNear + float(i) * uStepSize;
        if (t > tFar) break;
        
        vec3 pos = rayOrigin + rayDir * t;
        float density = sampleVolume(pos);
        
        if (density > uIsoValue) {
            vec3 normal = getGradient(pos);
            vec3 lightDir = normalize(vec3(1.0, 1.0, 1.0));
            vec3 viewDir = -rayDir;
            vec3 halfDir = normalize(lightDir + viewDir);
            
            float diff = max(dot(normal, lightDir), 0.0);
            float spec = pow(max(dot(normal, halfDir), 0.0), 32.0);
            
            vec3 color = mix(uColorLow, uColorHigh, density);
            vec3 ambient = 0.3 * color;
            vec3 diffuse = 0.7 * diff * color;
            vec3 specular = 0.5 * spec * vec3(1.0);
            
            return vec4(ambient + diffuse + specular, uOpacity);
        }
    }
    
    return vec4(0.0);
}

void main() {
    vec3 rayOrigin = (uInverseModelMatrix * vec4(uCameraPos, 1.0)).xyz;
    vec3 rayDir = normalize(vLocalPosition - rayOrigin);
    
    vec2 t = rayBoxIntersect(rayOrigin, rayDir, vec3(-1.0), vec3(1.0));
    
    if (t.x > t.y || t.y < 0.0) {
        discard;
    }
    
    float tNear = max(t.x, 0.0);
    float tFar = t.y;
    
    vec4 color;
    
    if (uRenderMode == 0) {
        color = renderDVR(rayOrigin, rayDir, tNear, tFar);
    } else if (uRenderMode == 1) {
        color = renderMIP(rayOrigin, rayDir, tNear, tFar);
    } else {
        color = renderISO(rayOrigin, rayDir, tNear, tFar);
    }
    
    if (color.a < 0.01) {
        discard;
    }
    
    gl_FragColor = color;
}
`

export class VolumeRenderer {
    constructor(scene, camera) {
        this.scene = scene;
        this.camera = camera;
        this.volumeSize = 128;
        this.dataGenerator = new VolumeDataGenerator(this.volumeSize);
        
        this.params = {
            isoValue: 0.3,
            stepSize: 0.01,
            maxSteps: 128,
            opacity: 1.0,
            colorLow: [0.1, 0.1, 0.5],
            colorHigh: [1.0, 0.8, 0.3],
            renderMode: 0
        };
        
        this.volumeMesh = null;
        this.volumeTexture = null;
        this.currentTimestep = 0;
        
        this.init();
    }
    
    init() {
        this.createVolumeTexture();
        this.createVolumeMesh();
        this.createBoundingBox();
    }
    
    createVolumeTexture() {
        const data = this.dataGenerator.generateGalaxyDensity(0);
        const uint8Data = this.dataGenerator.compressToUint8(data);
        
        this.volumeTexture = new THREE.Data3DTexture(
            uint8Data,
            this.volumeSize,
            this.volumeSize,
            this.volumeSize
        );
        
        this.volumeTexture.format = THREE.RedFormat;
        this.volumeTexture.type = THREE.UnsignedByteType;
        this.volumeTexture.minFilter = THREE.LinearFilter;
        this.volumeTexture.magFilter = THREE.LinearFilter;
        this.volumeTexture.unpackAlignment = 1;
        this.volumeTexture.needsUpdate = true;
    }
    
    createVolumeMesh() {
        const geometry = new THREE.BoxGeometry(2, 2, 2);
        
        const material = new THREE.ShaderMaterial({
            vertexShader: vertexShader,
            fragmentShader: fragmentShader,
            uniforms: {
                uVolumeData: { value: this.volumeTexture },
                uIsoValue: { value: this.params.isoValue },
                uStepSize: { value: this.params.stepSize },
                uMaxSteps: { value: this.params.maxSteps },
                uOpacity: { value: this.params.opacity },
                uColorLow: { value: new THREE.Color(...this.params.colorLow) },
                uColorHigh: { value: new THREE.Color(...this.params.colorHigh) },
                uRenderMode: { value: this.params.renderMode },
                uTime: { value: 0 },
                uCameraPos: { value: new THREE.Vector3() },
                uInverseModelMatrix: { value: new THREE.Matrix4() }
            },
            transparent: true,
            side: THREE.BackSide,
            depthWrite: false
        });
        
        this.volumeMesh = new THREE.Mesh(geometry, material);
        this.scene.add(this.volumeMesh);
    }
    
    createBoundingBox() {
        const boxGeometry = new THREE.BoxGeometry(2.01, 2.01, 2.01);
        const edges = new THREE.EdgesGeometry(boxGeometry);
        const lineMaterial = new THREE.LineBasicMaterial({
            color: 0x444466,
            transparent: true,
            opacity: 0.3
        });
        
        const boxLines = new THREE.LineSegments(edges, lineMaterial);
        this.scene.add(boxLines);
    }
    
    updateTimestep(timestep) {
        this.currentTimestep = timestep;
        
        const data = this.dataGenerator.generateGalaxyDensity(timestep);
        const uint8Data = this.dataGenerator.compressToUint8(data);
        
        this.volumeTexture.image.data.set(uint8Data);
        this.volumeTexture.needsUpdate = true;
    }
    
    setRenderMode(mode) {
        this.params.renderMode = mode;
        this.volumeMesh.material.uniforms.uRenderMode.value = mode;
        
        if (mode === 0) {
            this.volumeMesh.material.side = THREE.BackSide;
        } else if (mode === 1) {
            this.volumeMesh.material.side = THREE.BackSide;
        } else {
            this.volumeMesh.material.side = THREE.FrontSide;
        }
    }
    
    setIsoValue(value) {
        this.params.isoValue = value;
        this.volumeMesh.material.uniforms.uIsoValue.value = value;
    }
    
    setStepSize(value) {
        this.params.stepSize = value;
        this.volumeMesh.material.uniforms.uStepSize.value = value;
    }
    
    setMaxSteps(value) {
        this.params.maxSteps = value;
        this.volumeMesh.material.uniforms.uMaxSteps.value = value;
    }
    
    setOpacity(value) {
        this.params.opacity = value;
        this.volumeMesh.material.uniforms.uOpacity.value = value;
    }
    
    setColorLow(color) {
        this.params.colorLow = color;
        this.volumeMesh.material.uniforms.uColorLow.value = new THREE.Color(...color);
    }
    
    setColorHigh(color) {
        this.params.colorHigh = color;
        this.volumeMesh.material.uniforms.uColorHigh.value = new THREE.Color(...color);
    }
    
    setVisible(visible) {
        if (this.volumeMesh) {
            this.volumeMesh.visible = visible;
        }
    }
    
    update() {
        if (this.volumeMesh) {
            this.volumeMesh.material.uniforms.uCameraPos.value.copy(this.camera.position);
            this.volumeMesh.material.uniforms.uInverseModelMatrix.value.copy(this.volumeMesh.matrixWorld).invert();
        }
    }
    
    dispose() {
        if (this.volumeMesh) {
            this.scene.remove(this.volumeMesh);
            this.volumeMesh.geometry.dispose();
            this.volumeMesh.material.dispose();
        }
        if (this.volumeTexture) {
            this.volumeTexture.dispose();
        }
    }
}
