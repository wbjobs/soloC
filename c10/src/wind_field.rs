use glam::Vec2;
use eframe::egui;

pub struct WindField {
    width: f32,
    height: f32,
    grid_size: i32,
    cells: Vec<Vec2>,
    cell_width: f32,
    cell_height: f32,
    global_strength: f32,
}

impl WindField {
    pub fn new(width: f32, height: f32, grid_size: i32) -> Self {
        let cell_count = (grid_size * grid_size) as usize;
        let cells = vec![Vec2::ZERO; cell_count];
        
        Self {
            width,
            height,
            grid_size,
            cells,
            cell_width: width / grid_size as f32,
            cell_height: height / grid_size as f32,
            global_strength: 1.0,
        }
    }

    pub fn get_cell_index(&self, pos: Vec2) -> i32 {
        let gx = ((pos.x / self.width) * self.grid_size as f32).floor() as i32;
        let gy = ((pos.y / self.height) * self.grid_size as f32).floor() as i32;
        
        let gx = gx.clamp(0, self.grid_size - 1);
        let gy = gy.clamp(0, self.grid_size - 1);
        
        gy * self.grid_size + gx
    }

    pub fn get_wind_at(&self, pos: Vec2) -> Vec2 {
        let idx = self.get_cell_index(pos);
        self.cells[idx as usize] * self.global_strength
    }

    pub fn set_wind_at(&mut self, pos: Vec2, wind: Vec2) {
        let idx = self.get_cell_index(pos);
        self.cells[idx as usize] = wind;
    }

    pub fn clear(&mut self) {
        for cell in &mut self.cells {
            *cell = Vec2::ZERO;
        }
    }

    pub fn get_global_strength(&self) -> f32 {
        self.global_strength
    }

    pub fn set_global_strength(&mut self, strength: f32) {
        self.global_strength = strength;
    }

    pub fn render(&self, painter: &egui::Painter, rect: egui::Rect) {
        let step = 2;
        for gy in (0..self.grid_size).step_by(step) {
            for gx in (0..self.grid_size).step_by(step) {
                let idx = gy * self.grid_size + gx;
                let wind = self.cells[idx as usize] * self.global_strength;
                
                if wind.length_squared() < 0.1 {
                    continue;
                }

                let center_x = rect.left() + (gx as f32 + 0.5) / self.grid_size as f32 * rect.width();
                let center_y = rect.top() + (gy as f32 + 0.5) / self.grid_size as f32 * rect.height();
                let center = egui::pos2(center_x, center_y);

                let wind_length = wind.length().min(50.0);
                let normalized = if wind.length() > 0.01 {
                    wind.normalize()
                } else {
                    Vec2::ZERO
                };

                let end = egui::pos2(
                    center.x + normalized.x * wind_length,
                    center.y + normalized.y * wind_length,
                );

                let intensity = (wind.length() / 100.0).clamp(0.0, 1.0);
                let color = egui::Color32::from_rgba_unmultiplied(
                    (100 + intensity * 155.0) as u8,
                    (100 + intensity * 155.0) as u8,
                    255,
                    180,
                );

                painter.line_segment([center, end], egui::Stroke::new(2.0, color));
                
                let arrow_len = 8.0;
                let angle = wind.y.atan2(wind.x);
                let arrow_p1 = egui::pos2(
                    end.x - arrow_len * (angle - 0.5).cos(),
                    end.y - arrow_len * (angle - 0.5).sin(),
                );
                let arrow_p2 = egui::pos2(
                    end.x - arrow_len * (angle + 0.5).cos(),
                    end.y - arrow_len * (angle + 0.5).sin(),
                );
                
                painter.line_segment([end, arrow_p1], egui::Stroke::new(2.0, color));
                painter.line_segment([end, arrow_p2], egui::Stroke::new(2.0, color));
            }
        }
    }

    pub fn render_minimap(&self, ui: &mut egui::Ui) {
        let size = 180.0;
        let (response, painter) = ui.allocate_painter(
            egui::vec2(size, size),
            egui::Sense::click_and_drag(),
        );

        let rect = response.rect;

        let cell_rect_width = rect.width() / self.grid_size as f32;
        let cell_rect_height = rect.height() / self.grid_size as f32;

        for gy in 0..self.grid_size {
            for gx in 0..self.grid_size {
                let idx = gy * self.grid_size + gx;
                let wind = self.cells[idx as usize] * self.global_strength;
                let strength = wind.length();

                let cell_rect = egui::Rect::from_min_max(
                    egui::pos2(
                        rect.left() + gx as f32 * cell_rect_width,
                        rect.top() + gy as f32 * cell_rect_height,
                    ),
                    egui::pos2(
                        rect.left() + (gx as f32 + 1.0) * cell_rect_width,
                        rect.top() + (gy as f32 + 1.0) * cell_rect_height,
                    ),
                );

                let intensity = (strength / 200.0).clamp(0.0, 1.0);
                let color = if intensity < 0.01 {
                    egui::Color32::from_rgb(20, 30, 60)
                } else {
                    egui::Color32::from_rgba_unmultiplied(
                        (50 + intensity * 100.0) as u8,
                        (80 + intensity * 120.0) as u8,
                        (150 + intensity * 105.0) as u8,
                        200,
                    )
                };

                painter.rect_filled(cell_rect, 0.0, color);

                if strength > 5.0 {
                    let center = cell_rect.center();
                    let normalized = wind.normalize();
                    let arrow_len = cell_rect_width.min(cell_rect_height) * 0.35;
                    let end = egui::pos2(
                        center.x + normalized.x * arrow_len,
                        center.y + normalized.y * arrow_len,
                    );
                    painter.line_segment(
                        [center, end],
                        egui::Stroke::new(1.5, egui::Color32::WHITE),
                    );
                }
            }
        }

        painter.rect_stroke(rect, 0.0, egui::Stroke::new(1.0, egui::Color32::WHITE));
    }
}
