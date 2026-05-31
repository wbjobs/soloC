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
