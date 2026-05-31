use glam::Vec2;
use rayon::prelude::*;
use std::sync::Arc;

use crate::particles::ParticleSystem;
use crate::purifier::Purifier;
use crate::wind_field::WindField;
use crate::wind_turbine::WindTurbineManager;

const REST_DENSITY: f32 = 1000.0;
const GAS_CONSTANT: f32 = 2000.0;
const KERNEL_RADIUS: f32 = 30.0;

fn poly6_kernel(r: f32, h: f32) -> f32 {
    if r <= h {
        let factor = 315.0 / (64.0 * std::f32::consts::PI * h.powf(9.0));
        let diff = h * h - r * r;
        factor * diff * diff * diff
    } else {
        0.0
    }
}

fn spiky_kernel_gradient(r_vec: Vec2, h: f32) -> Vec2 {
    let r = r_vec.length();
    if r <= h && r > 0.0001 {
        let factor = -45.0 / (std::f32::consts::PI * h.powf(6.0));
        let diff = h - r;
        r_vec.normalize() * factor * diff * diff
    } else {
        Vec2::ZERO
    }
}

fn viscosity_kernel_laplacian(r: f32, h: f32) -> f32 {
    if r <= h {
        let factor = 45.0 / (std::f32::consts::PI * h.powf(6.0));
        factor * (h - r)
    } else {
        0.0
    }
}

struct SpatialHash {
    cell_size: f32,
    buckets: Vec<Vec<usize>>,
    grid_width: i32,
    grid_height: i32,
}

impl SpatialHash {
    fn new(width: f32, height: f32, cell_size: f32) -> Self {
        let grid_width = (width / cell_size).ceil() as i32;
        let grid_height = (height / cell_size).ceil() as i32;
        let bucket_count = (grid_width * grid_height) as usize;
        
        Self {
            cell_size,
            buckets: (0..bucket_count).map(|_| Vec::new()).collect(),
            grid_width,
            grid_height,
        }
    }

    fn get_cell_index(&self, pos: Vec2) -> i32 {
        let x = (pos.x / self.cell_size).floor() as i32;
        let y = (pos.y / self.cell_size).floor() as i32;
        y * self.grid_width + x
    }

    fn build(&mut self, particles: &[crate::particles::Particle]) {
        for bucket in &mut self.buckets {
            bucket.clear();
        }
        
        for (i, p) in particles.iter().enumerate() {
            let cell_idx = self.get_cell_index(p.position);
            if cell_idx >= 0 && cell_idx < self.buckets.len() as i32 {
                self.buckets[cell_idx as usize].push(i);
            }
        }
    }
}

struct NeighborCollector<'a> {
    hash: &'a SpatialHash,
    temp: Vec<usize>,
}

impl<'a> NeighborCollector<'a> {
    fn new(hash: &'a SpatialHash) -> Self {
        Self {
            hash,
            temp: Vec::with_capacity(50),
        }
    }

    fn get_neighbors(&mut self, pos: Vec2) -> &[usize] {
        self.temp.clear();
        let cx = (pos.x / self.hash.cell_size).floor() as i32;
        let cy = (pos.y / self.hash.cell_size).floor() as i32;

        for dx in -1..=1 {
            for dy in -1..=1 {
                let cell_x = cx + dx;
                let cell_y = cy + dy;
                if cell_x >= 0 && cell_x < self.hash.grid_width && cell_y >= 0 && cell_y < self.hash.grid_height {
                    let cell_idx = cell_y * self.hash.grid_width + cell_x;
                    self.temp.extend(&self.hash.buckets[cell_idx as usize]);
                }
            }
        }
        
        &self.temp
    }
}

fn apply_reflective_boundaries(
    position: &mut Vec2,
    velocity: &mut Vec2,
    width: f32,
    height: f32,
    boundary_damping: f32,
) {
    let margin = 2.0;
    
    if position.x < margin {
        let overlap = margin - position.x;
        position.x = margin + overlap * 0.5;
        velocity.x = -velocity.x * boundary_damping;
    }
    if position.x > width - margin {
        let overlap = position.x - (width - margin);
        position.x = width - margin - overlap * 0.5;
        velocity.x = -velocity.x * boundary_damping;
    }
    if position.y < margin {
        let overlap = margin - position.y;
        position.y = margin + overlap * 0.5;
        velocity.y = -velocity.y * boundary_damping;
    }
    if position.y > height - margin {
        let overlap = position.y - (height - margin);
        position.y = height - margin - overlap * 0.5;
        velocity.y = -velocity.y * boundary_damping;
    }
}

fn apply_purifiers(
    position: Vec2,
    pollution: &mut f32,
    purifiers: &[Purifier],
) {
    for purifier in purifiers {
        let dist_sq = (position - purifier.position).length_squared();
        let radius_sq = purifier.radius * purifier.radius;
        
        if dist_sq < radius_sq {
            let dist = dist_sq.sqrt();
            let absorption_factor = 1.0 - dist / purifier.radius;
            let reduction = purifier.absorption_rate * absorption_factor;
            *pollution *= 1.0 - reduction;
            
            if *pollution < 0.001 {
                *pollution = 0.0;
            }
        }
    }
}

pub fn update_particles(
    system: &mut ParticleSystem,
    wind_field: &WindField,
    turbine_manager: &WindTurbineManager,
    purifiers: &[Purifier],
    dt: f32,
    gravity: f32,
    viscosity: f32,
    particle_radius: f32,
) {
    let h = KERNEL_RADIUS;
    let boundary_damping = 0.6;

    let mut spatial_hash = SpatialHash::new(system.width, system.height, h);
    spatial_hash.build(&system.particles);

    let particles_clone = system.particles.clone();
    let purifiers_arc = Arc::new(purifiers.to_vec());
    let turbine_arc = Arc::new(turbine_manager.turbines.clone());
    let wind_arc = Arc::new(wind_field.clone());

    let new_densities: Vec<f32> = (0..system.particles.len())
        .into_par_iter()
        .map_init(
            || NeighborCollector::new(&spatial_hash),
            |collector, i| {
                let pi = particles_clone[i];
                let neighbors = collector.get_neighbors(pi.position);
                let mut density = 0.0;

                for &j in neighbors {
                    let pj = particles_clone[j];
                    let r = (pi.position - pj.position).length();
                    density += pj.mass * poly6_kernel(r, h);
                }

                density
            },
        )
        .collect();

    let new_pressures: Vec<f32> = new_densities
        .par_iter()
        .map(|&d| GAS_CONSTANT * (d - REST_DENSITY))
        .collect();

    let accelerations: Vec<Vec2> = (0..system.particles.len())
        .into_par_iter()
        .map_init(
            || NeighborCollector::new(&spatial_hash),
            |collector, i| {
                let pi = particles_clone[i];
                let neighbors = collector.get_neighbors(pi.position);
                let mut f_pressure = Vec2::ZERO;
                let mut f_viscosity = Vec2::ZERO;

                for &j in neighbors {
                    if i == j {
                        continue;
                    }

                    let pj = particles_clone[j];
                    let r_vec = pi.position - pj.position;
                    let r = r_vec.length();

                    if r > 0.001 && r < h {
                        let density_i = new_densities[i].max(0.001);
                        let density_j = new_densities[j].max(0.001);
                        let pressure_i = new_pressures[i];
                        let pressure_j = new_pressures[j];

                        let avg_pressure = (pressure_i / (density_i * density_i) + pressure_j / (density_j * density_j));
                        f_pressure += -pj.mass * avg_pressure * spiky_kernel_gradient(r_vec, h);

                        f_viscosity += viscosity * pj.mass * (pj.velocity - pi.velocity) 
                            / density_j * viscosity_kernel_laplacian(r, h);
                    }
                }

                let gravity_vec = Vec2::new(0.0, gravity);
                let wind_force = wind_field.get_wind_at(pi.position) * 0.5;

                gravity_vec + wind_force + f_pressure + f_viscosity
            },
        )
        .collect();

    let purifiers_ref = Arc::clone(&purifiers_arc);
    system.particles.par_iter_mut().enumerate().for_each(|(i, p)| {
        p.density = new_densities[i];
        p.pressure = new_pressures[i];
        p.acceleration = accelerations[i];
        p.velocity *= 0.99;

        p.velocity += p.acceleration * dt;
        p.position += p.velocity * dt;
        p.acceleration = Vec2::ZERO;

        apply_reflective_boundaries(
            &mut p.position,
            &mut p.velocity,
            system.width,
            system.height,
            boundary_damping,
        );

        apply_purifiers(p.position, &mut p.pollution, &purifiers_ref);
    });
}
