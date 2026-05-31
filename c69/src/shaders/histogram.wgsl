struct Particle {
  alive: u32,
  age: u32,
  hue: f32,
  saturation: f32,
  birthBias: f32,
  surviveBias: f32,
}

@group(0) @binding(0) var<storage, read> grid: array<Particle>;
@group(0) @binding(1) var<storage, read_write> histogramHue: array<atomic<u32>>;
@group(0) @binding(2) var<storage, read_write> histogramBirth: array<atomic<u32>>;
@group(0) @binding(3) var<storage, read_write> histogramSurvive: array<atomic<u32>>;
@group(0) @binding(4) var<storage, read_write> histogramAge: array<atomic<u32>>;

const GRID_SIZE: u32 = 128;
const GRID_VOLUME: u32 = GRID_SIZE * GRID_SIZE * GRID_SIZE;
const BINS: u32 = 16u;

@compute @workgroup_size(256, 1, 1)
fn main(@builtin(global_invocation_id) id: vec3<u32>) {
  let idx = id.x;
  if idx >= GRID_VOLUME { return; }

  let particle = grid[idx];
  if particle.alive == 1u {
    var hueBin = u32(floor(particle.hue / 360.0 * f32(BINS)));
    hueBin = clamp(hueBin, 0u, BINS - 1u);
    atomicAdd(&histogramHue[hueBin], 1u);

    var birthBin = u32(floor((particle.birthBias + 1.0) * 0.5 * f32(BINS)));
    birthBin = clamp(birthBin, 0u, BINS - 1u);
    atomicAdd(&histogramBirth[birthBin], 1u);

    var surviveBin = u32(floor((particle.surviveBias + 1.0) * 0.5 * f32(BINS)));
    surviveBin = clamp(surviveBin, 0u, BINS - 1u);
    atomicAdd(&histogramSurvive[surviveBin], 1u);

    var ageBin = u32(floor(min(f32(particle.age) / 200.0, 1.0) * f32(BINS)));
    ageBin = clamp(ageBin, 0u, BINS - 1u);
    atomicAdd(&histogramAge[ageBin], 1u);
  }
}
