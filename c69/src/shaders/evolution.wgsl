struct Particle {
  alive: u32,
  age: u32,
  hue: f32,
  saturation: f32,
  birthBias: f32,
  surviveBias: f32,
}

@group(0) @binding(0) var<storage, read_write> grid: array<Particle>;
@group(0) @binding(1) var<uniform> params: vec4<f32>;

const GRID_SIZE: u32 = 128;
const GRID_VOLUME: u32 = GRID_SIZE * GRID_SIZE * GRID_SIZE;

fn random(seed: u32) -> f32 {
  var s = seed;
  s = s ^ (s << 13u);
  s = s ^ (s >> 17u);
  s = s ^ (s << 5u);
  return f32(s) / 4294967295.0;
}

fn randomNormal(seed: u32) -> f32 {
  let u1 = max(0.0001, random(seed));
  let u2 = random(seed + 1000u);
  let z = sqrt(-2.0 * log(u1)) * cos(6.283185 * u2);
  return z * 0.3;
}

fn getNeighborIndex(idx: u32, dx: i32, dy: i32, dz: i32) -> u32 {
  let z = i32(idx / (GRID_SIZE * GRID_SIZE)) + dz;
  let y = i32((idx % (GRID_SIZE * GRID_SIZE)) / GRID_SIZE) + dy;
  let x = i32(idx % GRID_SIZE) + dx;
  
  let wz = (z % i32(GRID_SIZE) + i32(GRID_SIZE)) % i32(GRID_SIZE);
  let wy = (y % i32(GRID_SIZE) + i32(GRID_SIZE)) % i32(GRID_SIZE);
  let wx = (x % i32(GRID_SIZE) + i32(GRID_SIZE)) % i32(GRID_SIZE);
  
  return u32(wz * i32(GRID_SIZE) * i32(GRID_SIZE) + wy * i32(GRID_SIZE) + wx);
}

fn findFittestNeighbor(idx: u32, generation: u32) -> u32 {
  var maxAge: u32 = 0;
  var fittestIdx = idx;
  
  for (var dz: i32 = -1; dz <= 1; dz++) {
    for (var dy: i32 = -1; dy <= 1; dy++) {
      for (var dx: i32 = -1; dx <= 1; dx++) {
        if dx == 0 && dy == 0 && dz == 0 { continue; }
        let nIdx = getNeighborIndex(idx, dx, dy, dz);
        let neighbor = grid[nIdx];
        if neighbor.alive == 1u && neighbor.age > maxAge {
          maxAge = neighbor.age;
          fittestIdx = nIdx;
        }
      }
    }
  }
  return fittestIdx;
}

@compute @workgroup_size(64, 1, 1)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  let idx = id.x;
  if idx >= GRID_VOLUME { return; }

  var particle = grid[idx];
  let mutationRate = params.x;
  let selectionPressure = params.y;
  let generation = params.z;
  let randSeed = idx + u32(generation) * 1000000u;
  
  if particle.alive == 1u {
    let ageScore = f32(min(particle.age, 200u)) / 200.0;
    let survivalChance = 0.4 + ageScore * selectionPressure * 0.6;
    
    if random(randSeed + 100u) > survivalChance && particle.age > 5u {
      particle.alive = 0u;
      particle.age = 0u;
    } else {
      if random(randSeed + 200u) < mutationRate {
        particle.hue = (particle.hue + randomNormal(randSeed + 1u) * 45.0 + 360.0) % 360.0;
      }
      
      if random(randSeed + 300u) < mutationRate * 0.8 {
        particle.birthBias = clamp(particle.birthBias + randomNormal(randSeed + 2u) * 0.25, -1.0, 1.0);
      }
      
      if random(randSeed + 400u) < mutationRate * 0.8 {
        particle.surviveBias = clamp(particle.surviveBias + randomNormal(randSeed + 3u) * 0.25, -1.0, 1.0);
      }
      
      if random(randSeed + 500u) < mutationRate * 0.4 {
        particle.saturation = clamp(particle.saturation + randomNormal(randSeed + 4u) * 0.15, 0.3, 1.0);
      }
    }
  } else {
    let fittestNeighborIdx = findFittestNeighbor(idx, generation);
    let fittest = grid[fittestNeighborIdx];
    
    if fittest.alive == 1u && fittest.age > 15u {
      if random(randSeed + 600u) < 0.15 {
        particle.alive = 1u;
        particle.age = 0u;
        particle.hue = fittest.hue;
        particle.saturation = fittest.saturation;
        particle.birthBias = fittest.birthBias;
        particle.surviveBias = fittest.surviveBias;
        
        if random(randSeed + 700u) < mutationRate * 1.5 {
          particle.hue = (particle.hue + randomNormal(randSeed + 5u) * 60.0 + 360.0) % 360.0;
        }
        if random(randSeed + 800u) < mutationRate {
          particle.birthBias = clamp(particle.birthBias + randomNormal(randSeed + 6u) * 0.3, -1.0, 1.0);
        }
        if random(randSeed + 900u) < mutationRate {
          particle.surviveBias = clamp(particle.surviveBias + randomNormal(randSeed + 7u) * 0.3, -1.0, 1.0);
        }
      }
    }
  }
  
  grid[idx] = particle;
}
