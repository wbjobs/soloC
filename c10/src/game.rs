#[derive(Clone, Copy, PartialEq)]
pub enum GameState {
    Paused,
    Running,
    Won,
    Lost,
}

pub struct GameConfig {
    pub particle_count: usize,
    pub simulation_width: f32,
    pub simulation_height: f32,
    pub particle_radius: f32,
    pub gravity: f32,
    pub viscosity: f32,
    pub pollution_emission_rate: f32,
    pub diffusion_coefficient: f32,
    pub source_strength: f32,
    pub purifier_radius: f32,
    pub time_limit: f32,
    pub target_threshold: f32,
    pub turbine_radius: f32,
    pub turbine_strength: f32,
    pub heat_temperature: f32,
    pub heat_radius: f32,
}

impl Default for GameConfig {
    fn default() -> Self {
        Self {
            particle_count: 5000,
            simulation_width: 600.0,
            simulation_height: 500.0,
            particle_radius: 4.0,
            gravity: 0.0,
            viscosity: 0.1,
            pollution_emission_rate: 2.0,
            diffusion_coefficient: 0.1,
            source_strength: 2.0,
            purifier_radius: 50.0,
            time_limit: 120.0,
            target_threshold: 0.5,
            turbine_radius: 80.0,
            turbine_strength: 200.0,
            heat_temperature: 100.0,
            heat_radius: 60.0,
        }
    }
}
