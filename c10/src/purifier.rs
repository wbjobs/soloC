use glam::Vec2;
use rayon::prelude::*;

use crate::particles::ParticleSystem;

pub struct Purifier {
    pub position: Vec2,
    pub radius: f32,
    pub absorption_rate: f32,
}

impl Purifier {
    pub fn new(position: Vec2, radius: f32) -> Self {
        Self {
            position,
            radius,
            absorption_rate: 0.1,
        }
    }

    pub fn absorb_pollution(&self, system: &mut ParticleSystem) {
        system.particles.par_iter_mut().for_each(|p| {
            let dist = (p.position - self.position).length();
            if dist < self.radius {
                let absorption_factor = 1.0 - dist / self.radius;
                p.pollution *= 1.0 - self.absorption_rate * absorption_factor;
                if p.pollution < 0.01 {
                    p.pollution = 0.0;
                }
            }
        });
    }
}
