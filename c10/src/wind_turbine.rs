use glam::Vec2;
use eframe::egui;

pub struct WindTurbine {
    pub position: Vec2,
    pub radius: f32,
    pub rotation_speed: f32,
    pub strength: f32,
    pub clockwise: bool,
}

impl WindTurbine {
    pub fn new(position: Vec2, radius: f32, strength: f32) -> Self {
        Self {
            position,
            radius,
            rotation_speed: 1.0,
            strength,
            clockwise: true,
        }
    }

    pub fn get_vortex_wind(&self, pos: Vec2) -> Vec2 {
        let to_center = pos - self.position;
        let dist = to_center.length();

        if dist > self.radius || dist < 0.001 {
            return Vec2::ZERO;
        }

        let dist_factor = 1.0 - (dist / self.radius);
        let dist_factor_sq = dist_factor * dist_factor;

        let tangent = if self.clockwise {
            Vec2::new(-to_center.y, to_center.x)
        } else {
            Vec2::new(to_center.y, -to_center.x)
        };

        let normalized_tangent = if tangent.length() > 0.001 {
            tangent.normalize()
        } else {
            Vec2::ZERO
        };

        normalized_tangent * self.strength * dist_factor_sq
    }

    pub fn render(&self, painter: &egui::Painter, rect: egui::Rect, sim_width: f32, sim_height: f32) {
        let screen_x = rect.left() + (self.position.x / sim_width) * rect.width();
        let screen_y = rect.top() + (self.position.y / sim_height) * rect.height();
        let screen_pos = egui::pos2(screen_x, screen_y);
        let screen_radius = (self.radius / sim_width) * rect.width();

        painter.circle_stroke(
            screen_pos,
            screen_radius,
            egui::Stroke::new(2.0, egui::Color32::from_rgba_unmultiplied(255, 200, 50, 200)),
        );

        painter.circle_filled(
            screen_pos,
            6.0,
            egui::Color32::from_rgba_unmultiplied(255, 180, 0, 230),
        );

        let blade_count = 3;
        let time = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs_f32();
        
        let base_angle = time * self.rotation_speed;
        
        for i in 0..blade_count {
            let angle = base_angle + (i as f32) * std::f32::consts::TAU / blade_count as f32;
            let blade_length = screen_radius * 0.85;
            let blade_end = egui::pos2(
                screen_pos.x + angle.cos() * blade_length,
                screen_pos.y + angle.sin() * blade_length,
            );
            
            painter.line_segment(
                [screen_pos, blade_end],
                egui::Stroke::new(4.0, egui::Color32::from_rgba_unmultiplied(200, 150, 0, 220)),
            );
        }

        let arrow_dir = if self.clockwise { 1.0 } else { -1.0 };
        let indicator_radius = screen_radius * 1.1;
        let start_angle = 0.0;
        let end_angle = std::f32::consts::PI * arrow_dir;
        
        let segments = 12;
        for i in 0..segments {
            let t1 = i as f32 / segments as f32;
            let t2 = (i + 1) as f32 / segments as f32;
            let a1 = start_angle + (end_angle - start_angle) * t1;
            let a2 = start_angle + (end_angle - start_angle) * t2;
            
            let p1 = egui::pos2(
                screen_pos.x + a1.cos() * indicator_radius,
                screen_pos.y + a1.sin() * indicator_radius,
            );
            let p2 = egui::pos2(
                screen_pos.x + a2.cos() * indicator_radius,
                screen_pos.y + a2.sin() * indicator_radius,
            );
            
            painter.line_segment(
                [p1, p2],
                egui::Stroke::new(2.0, egui::Color32::from_rgba_unmultiplied(255, 220, 100, 150)),
            );
        }
    }
}

pub struct WindTurbineManager {
    pub turbines: Vec<WindTurbine>,
}

impl WindTurbineManager {
    pub fn new() -> Self {
        Self {
            turbines: Vec::new(),
        }
    }

    pub fn add_turbine(&mut self, position: Vec2, radius: f32, strength: f32) {
        self.turbines.push(WindTurbine::new(position, radius, strength));
    }

    pub fn get_combined_wind(&self, base_wind: Vec2, pos: Vec2) -> Vec2 {
        let mut total_wind = base_wind;

        for turbine in &self.turbines {
            total_wind += turbine.get_vortex_wind(pos);
        }

        total_wind
    }

    pub fn render_all(&self, painter: &egui::Painter, rect: egui::Rect, sim_width: f32, sim_height: f32) {
        for turbine in &self.turbines {
            turbine.render(painter, rect, sim_width, sim_height);
        }
    }

    pub fn clear(&mut self) {
        self.turbines.clear();
    }
}
