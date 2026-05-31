use glam::Vec2;
use rand::Rng;
use rayon::prelude::*;

use crate::particles::ParticleSystem;
use crate::wind_field::WindField;
use crate::temperature::TemperatureField;

pub struct PollutionSource {
    pub position: Vec2,
    pub strength: f32,
    pub radius: f32,
}

impl PollutionSource {
    pub fn new(position: Vec2, strength: f32) -> Self {
        Self {
            position,
            strength,
            radius: 30.0,
        }
    }
}

pub struct PollutionManager {
    pub sources: Vec<PollutionSource>,
}

impl PollutionManager {
    pub fn new() -> Self {
        Self {
            sources: Vec::new(),
        }
    }

    pub fn add_source(&mut self, position: Vec2, strength: f32) {
        self.sources.push(PollutionSource::new(position, strength));
    }

    pub fn emit_pollution(
        &self,
        system: &mut ParticleSystem,
        wind_field: &WindField,
        temperature_field: &TemperatureField,
        dt: f32,
        emission_rate: f32,
        diffusion_coefficient: f32,
    ) {
        for source in &self.sources {
            system.particles.par_iter_mut().for_each(|p| {
                let dist = (p.position - source.position).length();
                if dist < source.radius {
                    let emission = source.strength * emission_rate * dt * (1.0 - dist / source.radius);
                    p.pollution += emission;
                }
            });
        }

        system.particles.par_iter_mut().for_each_init(
            || rand::thread_rng(),
            |rng, p| {
                let temp_factor = temperature_field.get_diffusion_factor(p.position);
                let wind = wind_field.get_wind_at(p.position);
                let wind_effect = wind * dt * 0.05;
                
                let effective_diffusion = diffusion_coefficient * temp_factor;
                
                let random_angle: f32 = rng.gen_range(0.0..std::f32::consts::TAU);
                let random_strength: f32 = rng.gen_range(0.0..effective_diffusion * 10.0);
                let random_move = Vec2::new(
                    random_angle.cos() * random_strength,
                    random_angle.sin() * random_strength,
                );
                
                p.velocity += wind_effect + random_move * dt;
                p.pollution *= 0.999;
            },
        );
    }
}
