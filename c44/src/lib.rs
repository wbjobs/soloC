extern crate wasm_bindgen;
extern crate wee_alloc;

use wasm_bindgen::prelude::*;
use std::f32::consts::PI;

#[global_allocator]
static ALLOC: wee_alloc::WeeAlloc = wee_alloc::WeeAlloc::INIT;

const PARTICLE_MASS: f32 = 1.0;
const SMOOTHING_RADIUS: f32 = 30.0;
const DENSITY_COEFF: f32 = 315.0 / (64.0 * PI * SMOOTHING_RADIUS.powf(9.0));
const PRESSURE_COEFF: f32 = -45.0 / (PI * SMOOTHING_RADIUS.powf(6.0));
const VISCOSITY_COEFF: f32 = 45.0 / (PI * SMOOTHING_RADIUS.powf(6.0));
const REST_DENSITY: f32 = 1000.0;
const GAS_CONSTANT: f32 = 2000.0;
const VISCOSITY: f32 = 250.0;
const GRAVITY: f32 = -980.0;
const BOUNDARY_DAMPING: f32 = -0.3;
const BOUNDARY_REPULSION: f32 = 5000.0;
const DT: f32 = 0.008;

#[wasm_bindgen]
pub struct Particle {
    x: f32,
    y: f32,
    z: f32,
    vx: f32,
    vy: f32,
    vz: f32,
    density: f32,
    pressure: f32,
}

#[wasm_bindgen]
impl Particle {
    pub fn x(&self) -> f32 { self.x }
    pub fn y(&self) -> f32 { self.y }
    pub fn z(&self) -> f32 { self.z }
    pub fn vx(&self) -> f32 { self.vx }
    pub fn vy(&self) -> f32 { self.vy }
    pub fn vz(&self) -> f32 { self.vz }
    pub fn density(&self) -> f32 { self.density }
}

struct SpatialGrid {
    cell_size: f32,
    width: f32,
    height: f32,
    depth: f32,
    grid_cells_x: usize,
    grid_cells_y: usize,
    grid_cells_z: usize,
    cells: Vec<Vec<usize>>,
}

impl SpatialGrid {
    fn new(width: f32, height: f32, depth: f32, cell_size: f32) -> Self {
        let grid_cells_x = (width / cell_size).ceil() as usize + 2;
        let grid_cells_y = (height / cell_size).ceil() as usize + 2;
        let grid_cells_z = (depth / cell_size).ceil() as usize + 2;
        let total_cells = grid_cells_x * grid_cells_y * grid_cells_z;
        
        SpatialGrid {
            cell_size,
            width,
            height,
            depth,
            grid_cells_x,
            grid_cells_y,
            grid_cells_z,
            cells: vec![Vec::new(); total_cells],
        }
    }

    fn get_cell_index(&self, x: f32, y: f32, z: f32) -> usize {
        let cx = ((x + self.cell_size) / self.cell_size).floor() as usize;
        let cy = ((y + self.cell_size) / self.cell_size).floor() as usize;
        let cz = ((z + self.cell_size) / self.cell_size).floor() as usize;
        
        let cx = cx.min(self.grid_cells_x - 1);
        let cy = cy.min(self.grid_cells_y - 1);
        let cz = cz.min(self.grid_cells_z - 1);
        
        cx + cy * self.grid_cells_x + cz * self.grid_cells_x * self.grid_cells_y
    }

    fn insert(&mut self, particle_index: usize, x: f32, y: f32, z: f32) {
        let cell_idx = self.get_cell_index(x, y, z);
        self.cells[cell_idx].push(particle_index);
    }

    fn clear(&mut self) {
        for cell in &mut self.cells {
            cell.clear();
        }
    }

    fn get_neighbors(&self, x: f32, y: f32, z: f32) -> Vec<usize> {
        let mut neighbors = Vec::new();
        let cx = ((x + self.cell_size) / self.cell_size).floor() as isize;
        let cy = ((y + self.cell_size) / self.cell_size).floor() as isize;
        let cz = ((z + self.cell_size) / self.cell_size).floor() as isize;
        
        for dx in -1..=1 {
            for dy in -1..=1 {
                for dz in -1..=1 {
                    let cell_x = cx + dx;
                    let cell_y = cy + dy;
                    let cell_z = cz + dz;
                    
                    if cell_x >= 0 && cell_x < self.grid_cells_x as isize &&
                       cell_y >= 0 && cell_y < self.grid_cells_y as isize &&
                       cell_z >= 0 && cell_z < self.grid_cells_z as isize {
                        let cell_idx = cell_x as usize + 
                                       cell_y as usize * self.grid_cells_x + 
                                       cell_z as usize * self.grid_cells_x * self.grid_cells_y;
                        neighbors.extend(&self.cells[cell_idx]);
                    }
                }
            }
        }
        neighbors
    }
}

#[wasm_bindgen]
pub struct SPHSystem {
    particles: Vec<Particle>,
    width: f32,
    height: f32,
    depth: f32,
    spatial_grid: SpatialGrid,
    positions: Vec<f32>,
    velocities: Vec<f32>,
    densities: Vec<f32>,
}

#[wasm_bindgen]
impl SPHSystem {
    pub fn new(width: f32, height: f32, depth: f32) -> SPHSystem {
        SPHSystem {
            particles: Vec::new(),
            width,
            height,
            depth,
            spatial_grid: SpatialGrid::new(width, height, depth, SMOOTHING_RADIUS),
            positions: Vec::new(),
            velocities: Vec::new(),
            densities: Vec::new(),
        }
    }

    pub fn add_particle(&mut self, x: f32, y: f32, z: f32) {
        self.particles.push(Particle {
            x, y, z,
            vx: 0.0, vy: 0.0, vz: 0.0,
            density: 0.0,
            pressure: 0.0,
        });
        let n = self.particles.len();
        self.positions.resize(n * 3, 0.0);
        self.velocities.resize(n * 3, 0.0);
        self.densities.resize(n, 0.0);
    }

    pub fn particle_count(&self) -> usize {
        self.particles.len()
    }

    pub fn get_particle(&self, index: usize) -> &Particle {
        &self.particles[index]
    }

    pub fn get_positions_ptr(&self) -> *const f32 {
        self.positions.as_ptr()
    }

    pub fn get_velocities_ptr(&self) -> *const f32 {
        self.velocities.as_ptr()
    }

    pub fn get_densities_ptr(&self) -> *const f32 {
        self.densities.as_ptr()
    }

    pub fn get_width(&self) -> f32 { self.width }
    pub fn get_height(&self) -> f32 { self.height }
    pub fn get_depth(&self) -> f32 { self.depth }

    pub fn update(&mut self) {
        self.spatial_grid.clear();
        for (i, p) in self.particles.iter().enumerate() {
            self.spatial_grid.insert(i, p.x, p.y, p.z);
        }

        self.compute_density_pressure();
        self.compute_forces();
        self.integrate();
        self.enforce_boundaries();

        for (i, p) in self.particles.iter().enumerate() {
            self.positions[i * 3] = p.x;
            self.positions[i * 3 + 1] = p.y;
            self.positions[i * 3 + 2] = p.z;
            self.velocities[i * 3] = p.vx;
            self.velocities[i * 3 + 1] = p.vy;
            self.velocities[i * 3 + 2] = p.vz;
            self.densities[i] = p.density;
        }
    }

    fn compute_density_pressure(&mut self) {
        let h2 = SMOOTHING_RADIUS * SMOOTHING_RADIUS;
        
        for i in 0..self.particles.len() {
            let mut density = 0.0;
            let pi = &self.particles[i];
            
            let neighbors = self.spatial_grid.get_neighbors(pi.x, pi.y, pi.z);
            
            for &j in &neighbors {
                let pj = &self.particles[j];
                let dx = pj.x - pi.x;
                let dy = pj.y - pi.y;
                let dz = pj.z - pi.z;
                let r2 = dx * dx + dy * dy + dz * dz;
                
                if r2 < h2 {
                    let diff = h2 - r2;
                    density += PARTICLE_MASS * DENSITY_COEFF * diff * diff * diff;
                }
            }
            
            self.particles[i].density = density.max(REST_DENSITY * 0.1);
            self.particles[i].pressure = GAS_CONSTANT * (density - REST_DENSITY);
        }
    }

    fn compute_forces(&mut self) {
        let mut forces: Vec<(f32, f32, f32)> = vec![(0.0, 0.0, 0.0); self.particles.len()];
        let h = SMOOTHING_RADIUS;
        
        for i in 0..self.particles.len() {
            let mut fpx = 0.0;
            let mut fpy = 0.0;
            let mut fpz = 0.0;
            let mut fvx = 0.0;
            let mut fvy = 0.0;
            let mut fvz = 0.0;
            
            let pi = &self.particles[i];
            let neighbors = self.spatial_grid.get_neighbors(pi.x, pi.y, pi.z);
            
            for &j in &neighbors {
                if i == j { continue; }
                
                let pj = &self.particles[j];
                let dx = pj.x - pi.x;
                let dy = pj.y - pi.y;
                let dz = pj.z - pi.z;
                let r2 = dx * dx + dy * dy + dz * dz;
                let r = r2.sqrt();
                
                if r < h && r > 0.0001 {
                    let diff = h - r;
                    
                    let pressure_term = PARTICLE_MASS * (pi.pressure + pj.pressure) 
                        / (2.0 * pj.density) * PRESSURE_COEFF * diff * diff / r;
                    fpx -= pressure_term * dx;
                    fpy -= pressure_term * dy;
                    fpz -= pressure_term * dz;
                    
                    let viscosity_term = VISCOSITY * PARTICLE_MASS * VISCOSITY_COEFF * diff / pj.density;
                    fvx += viscosity_term * (pj.vx - pi.vx);
                    fvy += viscosity_term * (pj.vy - pi.vy);
                    fvz += viscosity_term * (pj.vz - pi.vz);
                }
            }
            
            let mut brx = 0.0;
            let mut bry = 0.0;
            let mut brz = 0.0;
            
            let boundary_dist = SMOOTHING_RADIUS * 0.5;
            
            if pi.x < boundary_dist {
                let d = boundary_dist - pi.x;
                brx += BOUNDARY_REPULSION * d * d;
            }
            if pi.x > self.width - boundary_dist {
                let d = pi.x - (self.width - boundary_dist);
                brx -= BOUNDARY_REPULSION * d * d;
            }
            if pi.y < boundary_dist {
                let d = boundary_dist - pi.y;
                bry += BOUNDARY_REPULSION * d * d;
            }
            if pi.y > self.height - boundary_dist {
                let d = pi.y - (self.height - boundary_dist);
                bry -= BOUNDARY_REPULSION * d * d;
            }
            if pi.z < boundary_dist {
                let d = boundary_dist - pi.z;
                brz += BOUNDARY_REPULSION * d * d;
            }
            if pi.z > self.depth - boundary_dist {
                let d = pi.z - (self.depth - boundary_dist);
                brz -= BOUNDARY_REPULSION * d * d;
            }
            
            forces[i] = (fpx + fvx + brx, fpy + fvy + GRAVITY * pi.density + bry, fpz + fvz + brz);
        }
        
        for i in 0..self.particles.len() {
            let (fx, fy, fz) = forces[i];
            let density = self.particles[i].density.max(0.1);
            self.particles[i].vx += DT * fx / density;
            self.particles[i].vy += DT * fy / density;
            self.particles[i].vz += DT * fz / density;
        }
    }

    fn integrate(&mut self) {
        for p in &mut self.particles {
            p.x += DT * p.vx;
            p.y += DT * p.vy;
            p.z += DT * p.vz;
        }
    }

    fn enforce_boundaries(&mut self) {
        let margin = 1.0;
        
        for p in &mut self.particles {
            if p.x < margin {
                p.vx *= BOUNDARY_DAMPING;
                p.vx = p.vx.abs();
                p.x = margin;
            }
            if p.x > self.width - margin {
                p.vx *= BOUNDARY_DAMPING;
                p.vx = -p.vx.abs();
                p.x = self.width - margin;
            }
            if p.y < margin {
                p.vy *= BOUNDARY_DAMPING;
                p.vy = p.vy.abs();
                p.y = margin;
            }
            if p.y > self.height - margin {
                p.vy *= BOUNDARY_DAMPING;
                p.vy = -p.vy.abs();
                p.y = self.height - margin;
            }
            if p.z < margin {
                p.vz *= BOUNDARY_DAMPING;
                p.vz = p.vz.abs();
                p.z = margin;
            }
            if p.z > self.depth - margin {
                p.vz *= BOUNDARY_DAMPING;
                p.vz = -p.vz.abs();
                p.z = self.depth - margin;
            }
        }
    }
}
