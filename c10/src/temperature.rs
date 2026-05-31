use glam::Vec2;
use eframe::egui;
use rayon::prelude::*;

pub struct HeatSource {
    pub position: Vec2,
    pub radius: f32,
    pub temperature: f32,
    pub strength: f32,
}

impl HeatSource {
    pub fn new(position: Vec2, radius: f32, temperature: f32) -> Self {
        Self {
            position,
            radius,
            temperature,
            strength: 1.0,
        }
    }
}

pub struct TemperatureField {
    width: f32,
    height: f32,
    grid_size: i32,
    temperatures: Vec<f32>,
    base_temperature: f32,
    diffusion_rate: f32,
    cell_width: f32,
    cell_height: f32,
}

impl TemperatureField {
    pub fn new(width: f32, height: f32, grid_size: i32) -> Self {
        let cell_count = (grid_size * grid_size) as usize;
        let base_temp = 20.0;

        Self {
            width,
            height,
            grid_size,
            temperatures: vec![base_temp; cell_count],
            base_temperature: base_temp,
            diffusion_rate: 0.5,
            cell_width: width / grid_size as f32,
            cell_height: height / grid_size as f32,
        }
    }

    fn get_cell_index(&self, pos: Vec2) -> (i32, i32) {
        let gx = ((pos.x / self.width) * self.grid_size as f32).floor() as i32;
        let gy = ((pos.y / self.height) * self.grid_size as f32).floor() as i32;
        
        (
            gx.clamp(0, self.grid_size - 1),
            gy.clamp(0, self.grid_size - 1),
        )
    }

    fn idx(&self, gx: i32, gy: i32) -> usize {
        (gy * self.grid_size + gx) as usize
    }

    pub fn get_temperature_at(&self, pos: Vec2) -> f32 {
        let (gx, gy) = self.get_cell_index(pos);
        self.temperatures[self.idx(gx, gy)]
    }

    pub fn get_diffusion_factor(&self, pos: Vec2) -> f32 {
        let temp = self.get_temperature_at(pos);
        let temp_diff = temp - self.base_temperature;
        1.0 + (temp_diff * 0.05).max(0.0)
    }

    pub fn update(&mut self, heat_sources: &[HeatSource], dt: f32) {
        for source in heat_sources {
            let grid_radius = (source.radius / self.cell_width).ceil() as i32;
            let (center_gx, center_gy) = self.get_cell_index(source.position);

            for gy in (center_gy - grid_radius)..=(center_gy + grid_radius) {
                for gx in (center_gx - grid_radius)..=(center_gx + grid_radius) {
                    if gx < 0 || gx >= self.grid_size || gy < 0 || gy >= self.grid_size {
                        continue;
                    }

                    let cell_center_x = (gx as f32 + 0.5) * self.cell_width;
                    let cell_center_y = (gy as f32 + 0.5) * self.cell_height;

                    let dx = cell_center_x - source.position.x;
                    let dy = cell_center_y - source.position.y;
                    let dist = (dx * dx + dy * dy).sqrt();

                    if dist < source.radius {
                        let dist_factor = 1.0 - dist / source.radius;
                        let dist_factor_sq = dist_factor * dist_factor;
                        let temp_increase = (source.temperature - self.base_temperature) * dist_factor_sq * source.strength * dt;
                        
                        let idx = self.idx(gx, gy);
                        self.temperatures[idx] += temp_increase;
                    }
                }
            }
        }

        let mut new_temps = self.temperatures.clone();

        for gy in 0..self.grid_size {
            for gx in 0..self.grid_size {
                let mut avg_neighbors = 0.0;
                let mut neighbor_count = 0;

                for dgy in -1..=1 {
                    for dgx in -1..=1 {
                        if dgx == 0 && dgy == 0 {
                            continue;
                        }
                        
                        let ngx = gx + dgx;
                        let ngy = gy + dgy;
                        
                        if ngx >= 0 && ngx < self.grid_size && ngy >= 0 && ngy < self.grid_size {
                            avg_neighbors += self.temperatures[self.idx(ngx, ngy)];
                            neighbor_count += 1;
                        }
                    }
                }

                if neighbor_count > 0 {
                    avg_neighbors /= neighbor_count as f32;
                    let idx = self.idx(gx, gy);
                    let current = self.temperatures[idx];
                    let diffusion = (avg_neighbors - current) * self.diffusion_rate * dt * 0.1;
                    new_temps[idx] = current + diffusion;
                }
            }
        }

        for temp in &mut new_temps {
            if *temp > self.base_temperature {
                *temp -= (*temp - self.base_temperature) * 0.01 * dt;
            }
            if *temp < self.base_temperature {
                *temp = self.base_temperature;
            }
        }

        self.temperatures = new_temps;
    }

    pub fn render(&self, painter: &egui::Painter, rect: egui::Rect) {
        let cell_width = rect.width() / self.grid_size as f32;
        let cell_height = rect.height() / self.grid_size as f32;

        for gy in 0..self.grid_size {
            for gx in 0..self.grid_size {
                let temp = self.temperatures[self.idx(gx, gy)];
                let color = Self::temperature_to_color(temp, self.base_temperature);

                let cell_rect = egui::Rect::from_min_max(
                    egui::pos2(
                        rect.left() + gx as f32 * cell_width,
                        rect.top() + gy as f32 * cell_height,
                    ),
                    egui::pos2(
                        rect.left() + (gx as f32 + 1.0) * cell_width,
                        rect.top() + (gy as f32 + 1.0) * cell_height,
                    ),
                );

                painter.rect_filled(cell_rect, 0.0, color);
            }
        }
    }

    pub fn render_minimap(&self, ui: &mut egui::Ui, heat_sources: &[HeatSource]) {
        let size = 180.0;
        let (response, painter) = ui.allocate_painter(
            egui::vec2(size, size),
            egui::Sense::click_and_drag(),
        );

        let rect = response.rect;
        self.render(&painter, rect);

        let cell_rect_width = rect.width() / self.grid_size as f32;
        let cell_rect_height = rect.height() / self.grid_size as f32;

        for source in heat_sources {
            let screen_pos = egui::pos2(
                rect.left() + (source.position.x / self.width) * rect.width(),
                rect.top() + (source.position.y / self.height) * rect.height(),
            );
            let screen_radius = (source.radius / self.width) * rect.width();

            painter.circle_stroke(
                screen_pos,
                screen_radius,
                egui::Stroke::new(2.0, egui::Color32::RED),
            );
            painter.circle_filled(
                screen_pos,
                4.0,
                egui::Color32::from_rgba_unmultiplied(255, 50, 0, 200),
            );
        }

        painter.rect_stroke(rect, 0.0, egui::Stroke::new(1.0, egui::Color32::WHITE));
    }

    fn temperature_to_color(temp: f32, base_temp: f32) -> egui::Color32 {
        let temp_diff = temp - base_temp;
        let t = (temp_diff / 80.0).clamp(0.0, 1.0);

        if t < 0.001 {
            egui::Color32::from_rgba_unmultiplied(20, 40, 80, 100)
        } else if t < 0.33 {
            let factor = t / 0.33;
            egui::Color32::from_rgba_unmultiplied(
                (50 + factor * 100.0) as u8,
                (80 + factor * 100.0) as u8,
                (120 - factor * 60.0) as u8,
                120,
            )
        } else if t < 0.66 {
            let factor = (t - 0.33) / 0.33;
            egui::Color32::from_rgba_unmultiplied(
                (150 + factor * 100.0) as u8,
                (180 - factor * 30.0) as u8,
                (60 - factor * 40.0) as u8,
                140,
            )
        } else {
            let factor = (t - 0.66) / 0.34;
            egui::Color32::from_rgba_unmultiplied(
                255,
                (150 - factor * 50.0) as u8,
                (20 - factor * 20.0) as u8,
                (140 + factor * 60.0) as u8,
            )
        }
    }

    pub fn clear(&mut self) {
        for temp in &mut self.temperatures {
            *temp = self.base_temperature;
        }
    }
}
