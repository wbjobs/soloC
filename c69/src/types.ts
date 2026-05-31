export const GRID_SIZE = 128;
export const GRID_VOLUME = GRID_SIZE * GRID_SIZE * GRID_SIZE;
export const HISTOGRAM_BINS = 16;

export interface SimulationParams {
  birthThreshold: number;
  surviveMin: number;
  surviveMax: number;
  mutationRate: number;
  selectionPressure: number;
}

export interface ParticleDNA {
  hue: number;           // 颜色色相 (0-360)
  saturation: number;    // 饱和度 (0-1)
  birthBias: number;     // 出生阈值敏感度 (-1 到 1)
  surviveBias: number;   // 存活阈值敏感度 (-1 到 1)
}

export interface HistogramData {
  hue: Uint32Array;
  birthBias: Uint32Array;
  surviveBias: Uint32Array;
  age: Uint32Array;
}

export interface CameraState {
  theta: number;
  phi: number;
  radius: number;
  target: { x: number; y: number; z: number };
}

export interface Mat4 {
  m: Float32Array;
}

export const mat4 = {
  identity(): Mat4 {
    return { m: new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]) };
  },
  
  multiply(a: Mat4, b: Mat4): Mat4 {
    const result = new Float32Array(16);
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        result[i * 4 + j] = 0;
        for (let k = 0; k < 4; k++) {
          result[i * 4 + j] += a.m[i * 4 + k] * b.m[k * 4 + j];
        }
      }
    }
    return { m: result };
  },

  perspectiveReverseZ(fovY: number, aspect: number, near: number, far: number): Mat4 {
    const f = 1 / Math.tan(fovY / 2);
    const n = near;
    const fz = far;
    return {
      m: new Float32Array([
        f / aspect, 0, 0, 0,
        0, f, 0, 0,
        0, 0, 0, -1,
        0, 0, n, 0
      ])
    };
  },

  perspective(fovY: number, aspect: number, near: number, far: number): Mat4 {
    const f = 1 / Math.tan(fovY / 2);
    const nf = 1 / (near - far);
    return {
      m: new Float32Array([
        f / aspect, 0, 0, 0,
        0, f, 0, 0,
        0, 0, (far + near) * nf, -1,
        0, 0, 2 * far * near * nf, 0
      ])
    };
  },

  lookAt(eye: {x: number, y: number, z: number}, target: {x: number, y: number, z: number}, up: {x: number, y: number, z: number}): Mat4 {
    const z = normalize({x: eye.x - target.x, y: eye.y - target.y, z: eye.z - target.z});
    const x = normalize(cross(up, z));
    const y = cross(z, x);
    return {
      m: new Float32Array([
        x.x, y.x, z.x, 0,
        x.y, y.y, z.y, 0,
        x.z, y.z, z.z, 0,
        -dot(x, eye), -dot(y, eye), -dot(z, eye), 1
      ])
    };
  },

  translate(tx: number, ty: number, tz: number): Mat4 {
    return {
      m: new Float32Array([
        1, 0, 0, 0,
        0, 1, 0, 0,
        0, 0, 1, 0,
        tx, ty, tz, 1
      ])
    };
  },

  scale(sx: number, sy: number, sz: number): Mat4 {
    return {
      m: new Float32Array([
        sx, 0, 0, 0,
        0, sy, 0, 0,
        0, 0, sz, 0,
        0, 0, 0, 1
      ])
    };
  }
};

function normalize(v: {x: number, y: number, z: number}) {
  const len = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

function cross(a: {x: number, y: number, z: number}, b: {x: number, y: number, z: number}) {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x
  };
}

function dot(a: {x: number, y: number, z: number}, b: {x: number, y: number, z: number}) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}
