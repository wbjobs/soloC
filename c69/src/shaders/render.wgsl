struct Particle {
  alive: u32,
  age: u32,
  hue: f32,
  saturation: f32,
  birthBias: f32,
  surviveBias: f32,
}

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) color: vec3<f32>,
}

@group(0) @binding(0) var<uniform> viewProj: mat4x4<f32>;
@group(0) @binding(1) var<storage, read> grid: array<Particle>;

const GRID_SIZE: u32 = 128;
const CELL_SIZE: f32 = 0.8;

fn hsvToRgb(h: f32, s: f32, v: f32) -> vec3<f32> {
  let c = v * s;
  let hNorm = h / 60.0;
  let x = c * (1.0 - abs((hNorm % 2.0) - 1.0));
  let m = v - c;
  var rgb: vec3<f32>;
  if hNorm < 1.0 { rgb = vec3<f32>(c, x, 0.0); }
  else if hNorm < 2.0 { rgb = vec3<f32>(x, c, 0.0); }
  else if hNorm < 3.0 { rgb = vec3<f32>(0.0, c, x); }
  else if hNorm < 4.0 { rgb = vec3<f32>(0.0, x, c); }
  else if hNorm < 5.0 { rgb = vec3<f32>(x, 0.0, c); }
  else { rgb = vec3<f32>(c, 0.0, x); }
  return rgb + vec3<f32>(m);
}

@vertex
fn vs_main(@builtin(vertex_index) vertexIndex: u32, @builtin(instance_index) instanceIndex: u32) -> VertexOutput {
  var output: VertexOutput;
  output.position = vec4<f32>(0.0, 0.0, 2.0, 1.0);
  output.color = vec3<f32>(0.0);
  
  let particle = grid[instanceIndex];
  if particle.alive == 0u {
    return output;
  }

  let faceIndex = vertexIndex / 6u;
  let vertInFace = vertexIndex % 6u;
  
  var pos: vec3<f32>;
  var normal: vec3<f32>;
  
  switch faceIndex {
    case 0u: {
      normal = vec3<f32>(0.0, 0.0, 1.0);
      switch vertInFace {
        case 0u: { pos = vec3<f32>(-0.5, -0.5,  0.5); }
        case 1u: { pos = vec3<f32>( 0.5, -0.5,  0.5); }
        case 2u: { pos = vec3<f32>( 0.5,  0.5,  0.5); }
        case 3u: { pos = vec3<f32>(-0.5, -0.5,  0.5); }
        case 4u: { pos = vec3<f32>( 0.5,  0.5,  0.5); }
        default: { pos = vec3<f32>(-0.5,  0.5,  0.5); }
      }
    }
    case 1u: {
      normal = vec3<f32>(0.0, 0.0, -1.0);
      switch vertInFace {
        case 0u: { pos = vec3<f32>(-0.5, -0.5, -0.5); }
        case 1u: { pos = vec3<f32>(-0.5,  0.5, -0.5); }
        case 2u: { pos = vec3<f32>( 0.5,  0.5, -0.5); }
        case 3u: { pos = vec3<f32>(-0.5, -0.5, -0.5); }
        case 4u: { pos = vec3<f32>( 0.5,  0.5, -0.5); }
        default: { pos = vec3<f32>( 0.5, -0.5, -0.5); }
      }
    }
    case 2u: {
      normal = vec3<f32>(0.0, 1.0, 0.0);
      switch vertInFace {
        case 0u: { pos = vec3<f32>(-0.5,  0.5, -0.5); }
        case 1u: { pos = vec3<f32>(-0.5,  0.5,  0.5); }
        case 2u: { pos = vec3<f32>( 0.5,  0.5,  0.5); }
        case 3u: { pos = vec3<f32>(-0.5,  0.5, -0.5); }
        case 4u: { pos = vec3<f32>( 0.5,  0.5,  0.5); }
        default: { pos = vec3<f32>( 0.5,  0.5, -0.5); }
      }
    }
    case 3u: {
      normal = vec3<f32>(0.0, -1.0, 0.0);
      switch vertInFace {
        case 0u: { pos = vec3<f32>(-0.5, -0.5, -0.5); }
        case 1u: { pos = vec3<f32>( 0.5, -0.5, -0.5); }
        case 2u: { pos = vec3<f32>( 0.5, -0.5,  0.5); }
        case 3u: { pos = vec3<f32>(-0.5, -0.5, -0.5); }
        case 4u: { pos = vec3<f32>( 0.5, -0.5,  0.5); }
        default: { pos = vec3<f32>(-0.5, -0.5,  0.5); }
      }
    }
    case 4u: {
      normal = vec3<f32>(1.0, 0.0, 0.0);
      switch vertInFace {
        case 0u: { pos = vec3<f32>( 0.5, -0.5, -0.5); }
        case 1u: { pos = vec3<f32>( 0.5,  0.5, -0.5); }
        case 2u: { pos = vec3<f32>( 0.5,  0.5,  0.5); }
        case 3u: { pos = vec3<f32>( 0.5, -0.5, -0.5); }
        case 4u: { pos = vec3<f32>( 0.5,  0.5,  0.5); }
        default: { pos = vec3<f32>( 0.5, -0.5,  0.5); }
      }
    }
    default: {
      normal = vec3<f32>(-1.0, 0.0, 0.0);
      switch vertInFace {
        case 0u: { pos = vec3<f32>(-0.5, -0.5, -0.5); }
        case 1u: { pos = vec3<f32>(-0.5, -0.5,  0.5); }
        case 2u: { pos = vec3<f32>(-0.5,  0.5,  0.5); }
        case 3u: { pos = vec3<f32>(-0.5, -0.5, -0.5); }
        case 4u: { pos = vec3<f32>(-0.5,  0.5,  0.5); }
        default: { pos = vec3<f32>(-0.5,  0.5, -0.5); }
      }
    }
  }

  let z = f32(instanceIndex / (GRID_SIZE * GRID_SIZE));
  let y = f32((instanceIndex % (GRID_SIZE * GRID_SIZE)) / GRID_SIZE);
  let x = f32(instanceIndex % GRID_SIZE);
  let gridPos = (vec3<f32>(x, y, z) - vec3<f32>(f32(GRID_SIZE) * 0.5)) * CELL_SIZE;
  
  let vertexPos = pos * CELL_SIZE * 0.9 + gridPos;
  
  output.position = viewProj * vec4<f32>(vertexPos, 1.0);
  
  let brightness = 0.4 + 0.6 * dot(normalize(normal), normalize(vec3<f32>(0.5, 1.0, 0.8)));
  let baseColor = hsvToRgb(particle.hue, particle.saturation, 0.95);
  output.color = baseColor * max(brightness, 0.3);

  return output;
}

@fragment
fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {
  return vec4<f32>(input.color, 1.0);
}
