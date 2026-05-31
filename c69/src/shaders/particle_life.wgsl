struct Particle {
  alive: u32,
  age: u32,
  hue: f32,
  saturation: f32,
  birthBias: f32,
  surviveBias: f32,
}

@group(0) @binding(0) var<storage, read> gridIn: array<Particle>;
@group(0) @binding(1) var<storage, write> gridOut: array<Particle>;
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
  return gridIn[idx].alive;
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

fn averageNeighborDNA(x: u32, y: u32, z: u32, count: u32) -> Particle {
  var avgHue: f32 = 0.0;
  var avgSaturation: f32 = 0.0;
  var avgBirthBias: f32 = 0.0;
  var avgSurviveBias: f32 = 0.0;
  
  if count == 0u {
    return Particle(0u, 0u, 180.0, 0.7, 0.0, 0.0);
  }
  
  for (var dz: i32 = -1; dz <= 1; dz++) {
    for (var dy: i32 = -1; dy <= 1; dy++) {
      for (var dx: i32 = -1; dx <= 1; dx++) {
        if (dx == 0 && dy == 0 && dz == 0) { continue; }
        let wx = wrapCoord(x, dx);
        let wy = wrapCoord(y, dy);
        let wz = wrapCoord(z, dz);
        let idx = getIndex(wx, wy, wz);
        if gridIn[idx].alive == 1u {
          avgHue += gridIn[idx].hue;
          avgSaturation += gridIn[idx].saturation;
          avgBirthBias += gridIn[idx].birthBias;
          avgSurviveBias += gridIn[idx].surviveBias;
        }
      }
    }
  }
  
  let fCount = f32(count);
  return Particle(
    0u, 0u,
    avgHue / fCount,
    avgSaturation / fCount,
    avgBirthBias / fCount,
    avgSurviveBias / fCount
  );
}

@compute @workgroup_size(8, 8, 8)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  if id.x >= GRID_SIZE || id.y >= GRID_SIZE || id.z >= GRID_SIZE {
    return;
  }

  let idx = getIndex(id.x, id.y, id.z);
  let current = gridIn[idx];
  let neighbors = countNeighbors(id.x, id.y, id.z);

  let birthThreshold = f32(u32(params.x));
  let surviveMin = f32(u32(params.y));
  let surviveMax = f32(u32(params.z));

  var nextAlive: u32 = 0u;
  var nextAge: u32 = 0u;
  var nextHue: f32 = current.hue;
  var nextSaturation: f32 = current.saturation;
  var nextBirthBias: f32 = current.birthBias;
  var nextSurviveBias: f32 = current.surviveBias;

  if current.alive == 1u {
    let effectiveMin = surviveMin + current.surviveBias * 2.0;
    let effectiveMax = surviveMax + current.surviveBias * 2.0;
    if f32(neighbors) >= effectiveMin && f32(neighbors) <= effectiveMax {
      nextAlive = 1u;
      nextAge = current.age + 1u;
    } else {
      nextAlive = 0u;
      nextAge = 0u;
    }
  } else {
    let effectiveThreshold = birthThreshold + current.birthBias * 2.0;
    if abs(f32(neighbors) - effectiveThreshold) < 0.5 {
      nextAlive = 1u;
      nextAge = 0u;
      let avgDNA = averageNeighborDNA(id.x, id.y, id.z, neighbors);
      nextHue = avgDNA.hue;
      nextSaturation = avgDNA.saturation;
      nextBirthBias = avgDNA.birthBias;
      nextSurviveBias = avgDNA.surviveBias;
    } else {
      nextAlive = 0u;
      nextAge = 0u;
    }
  }

  gridOut[idx] = Particle(
    nextAlive,
    nextAge,
    nextHue,
    nextSaturation,
    nextBirthBias,
    nextSurviveBias
  );
}
