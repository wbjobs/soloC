@group(0) @binding(0) var<storage, read> gridIn: array<u32>;
@group(0) @binding(1) var<storage, write> gridOut: array<u32>;
@group(0) @binding(2) var<uniform> params: vec4<f32>;

const GRID_SIZE: u32 = 128;
const GRID_VOLUME: u32 = GRID_SIZE * GRID_SIZE * GRID_SIZE;

fn wrapCoord(val: u32, offset: i32) -> u32 {
  let v = i32(val) + offset;
  let wrapped = (v % i32(GRID_SIZE) + i32(GRID_SIZE)) % i32(GRID_SIZE);
  return u32(wrapped);
}

fn getIndex(x: u32, y: u32, z: u32) -> u32 {
  let wx = (x + GRID_SIZE) % GRID_SIZE;
  let wy = (y + GRID_SIZE) % GRID_SIZE;
  let wz = (z + GRID_SIZE) % GRID_SIZE;
  return wz * GRID_SIZE * GRID_SIZE + wy * GRID_SIZE + wx;
}

fn isAliveWrapped(x: u32, y: u32, z: u32, dx: i32, dy: i32, dz: i32) -> u32 {
  let wx = wrapCoord(x, dx);
  let wy = wrapCoord(y, dy);
  let wz = wrapCoord(z, dz);
  let idx = getIndex(wx, wy, wz);
  return gridIn[idx];
}

fn countNeighbors(x: u32, y: u32, z: u32) -> u32 {
  var count: u32 = 0;
  for (var dz: i32 = -1; dz <= 1; dz++) {
    for (var dy: i32 = -1; dy <= 1; dy++) {
      for (var dx: i32 = -1; dx <= 1; dx++) {
        if (dx == 0 && dy == 0 && dz == 0) { continue; }
        count += isAliveWrapped(x, y, z, dx, dy, dz);
      }
    }
  }
  return count;
}

@compute @workgroup_size(8, 8, 8)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  if (id.x >= GRID_SIZE || id.y >= GRID_SIZE || id.z >= GRID_SIZE) {
    return;
  }

  let idx = getIndex(id.x, id.y, id.z);
  let current = gridIn[idx];
  let neighbors = countNeighbors(id.x, id.y, id.z);

  let birthThreshold = u32(params.x);
  let surviveMin = u32(params.y);
  let surviveMax = u32(params.z);

  var next: u32 = 0;

  if (current == 1u) {
    if (neighbors >= surviveMin && neighbors <= surviveMax) {
      next = 1u;
    } else {
      next = 0u;
    }
  } else {
    if (neighbors == birthThreshold) {
      next = 1u;
    } else {
      next = 0u;
    }
  }

  gridOut[idx] = next;
}
