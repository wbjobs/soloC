use glam::Vec2;
use rand::Rng;
use rayon::prelude::*;

#[derive(Clone, Copy)]
pub struct Particle {
    pub position: Vec2,
    pub velocity: Vec2,
    pub acceleration: Vec2,
    pub density: f32,
    pub pressure: f32,
    pub mass: f32,
    pub pollution: f32,
    pub radius: f32,
}

impl Particle {
    pub fn new(position: Vec2, mass: f32, radius: f32) -> Self {
        Self {
            position,
            velocity: Vec2::ZERO,
            acceleration: Vec2::ZERO,
            density: 0.0,
            pressure: 0.0,
            mass,
            pollution: 0.0,
            radius,
        }
    }
}

pub struct ParticleSystem {
    pub particles: Vec<Particle>,
    pub width: f32,
    pub height: f32,
}

impl ParticleSystem {
    pub fn new(count: usize, width: f32, height: f32) -> Self {
        let mut rng = rand::thread_rng();
        let mass = 1.0;
        let radius = 4.0;

        let particles: Vec<Particle> = (0..count)
            .map(|_| {
                let x = rng.gen_range(0.0..width);
                let y = rng.gen_range(0.0..height);
                Particle::new(Vec2::new(x, y), mass, radius)
            })
            .collect();

        Self {
            particles,
            width,
            height,
        }
    }

    pub fn update_positions(&mut self, dt: f32) {
        self.particles.par_iter_mut().for_each(|p| {
            p.velocity += p.acceleration * dt;
            p.position += p.velocity * dt;
            p.acceleration = Vec2::ZERO;

            if p.position.x < 0.0 {
                p.position.x = 0.0;
                p.velocity.x *= -0.5;
            }
            if p.position.x > self.width {
                p.position.x = self.width;
                p.velocity.x *= -0.5;
            }
            if p.position.y < 0.0 {
                p.position.y = 0.0;
                p.velocity.y *= -0.5;
            }
            if p.position.y > self.height {
                p.position.y = self.height;
                p.velocity.y *= -0.5;
            }
        });
    }

    pub fn get_total_pollution(&self) -> f32 {
        self.particles.par_iter().map(|p| p.pollution).sum()
    }

    pub fn get_particle_count(&self) -> usize {
        self.particles.len()
    }
}
