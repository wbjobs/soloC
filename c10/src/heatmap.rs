use eframe::egui;
use rayon::prelude::*;
use crate::particles::ParticleSystem;

pub struct HeatmapRenderer {
    grid_resolution: i32,
    color_grid: Vec<egui::Color32>,
}

impl HeatmapRenderer {
    pub fn new() -> Self {
        let grid_size = 64;
        Self {
            grid_resolution: grid_size,
            color_grid: vec![egui::Color32::from_rgba_unmultiplied(10, 20, 40, 180); (grid_size * grid_size) as usize],
        }
    }

    fn pollution_to_color(pollution: f32) -> egui::Color32 {
        let clamped = pollution.clamp(0.0, 5.0);
        let t = (clamped / 5.0).clamp(0.0, 1.0);

        if t < 0.001 {
            egui::Color32::from_rgba_unmultiplied(10, 20, 40, 180)
        } else if t < 0.25 {
            let factor = t / 0.25;
            egui::Color32::from_rgba_unmultiplied(
                (30 + factor * 70.0) as u8,
                (50 + factor * 130.0) as u8,
                (80 + factor * 175.0) as u8,
                200,
            )
        } else if t < 0.5 {
            let factor = (t - 0.25) / 0.25;
            egui::Color32::from_rgba_unmultiplied(
                (100 + factor * 100.0) as u8,
                (180 - factor * 80.0) as u8,
                (255 - factor * 155.0) as u8,
                210,
            )
        } else if t < 0.75 {
            let factor = (t - 0.5) / 0.25;
            egui::Color32::from_rgba_unmultiplied(
                (200 + factor * 55.0) as u8,
                (100 - factor * 50.0) as u8,
                (100 - factor * 60.0) as u8,
                220,
            )
        } else {
            let factor = (t - 0.75) / 0.25;
            egui::Color32::from_rgba_unmultiplied(
                255,
                (50 + factor * 100.0) as u8,
                (40 - factor * 20.0) as u8,
                (220 + factor * 35.0) as u8,
            )
        }
    }

    fn build_concentration_grid(
        &self,
        system: &ParticleSystem,
        sim_width: f32,
        sim_height: f32,
    ) -> Vec<(f32, f32)> {
        let grid_size = self.grid_resolution as usize;
        let sim_cell_width = sim_width / grid_size as f32;
        let sim_cell_height = sim_height / grid_size as f32;
        let search_radius = sim_cell_width.max(sim_cell_height) * 2.0;
        let search_radius_sq = search_radius * search_radius;

        let mut grid: Vec<(f32, f32)> = vec![(0.0, 0.0); grid_size * grid_size];

        for p in &system.particles {
            let gx = (p.position.x / sim_cell_width).floor() as i32;
            let gy = (p.position.y / sim_cell_height).floor() as i32;

            let range = 2;
            for dgy in -range..=range {
                for dgx in -range..=range {
                    let cell_x = gx + dgx;
                    let cell_y = gy + dgy;

                    if cell_x >= 0 && cell_x < grid_size as i32 && cell_y >= 0 && cell_y < grid_size as i32 {
                        let cell_center_x = (cell_x as f32 + 0.5) * sim_cell_width;
                        let cell_center_y = (cell_y as f32 + 0.5) * sim_cell_height;

                        let dx = p.position.x - cell_center_x;
                        let dy = p.position.y - cell_center_y;
                        let dist_sq = dx * dx + dy * dy;

                        if dist_sq < search_radius_sq {
                            let dist = dist_sq.sqrt();
                            let weight = 1.0 - dist / search_radius;
                            let weight_sq = weight * weight;
                            let idx = (cell_y as usize) * grid_size + (cell_x as usize);
                            grid[idx].0 += p.pollution * weight_sq;
                            grid[idx].1 += weight_sq;
                        }
                    }
                }
            }
        }

        grid
    }

    pub fn render(
        &mut self,
        painter: &egui::Painter,
        rect: egui::Rect,
        system: &ParticleSystem,
        sim_width: f32,
        sim_height: f32,
    ) {
        let grid_size = self.grid_resolution as usize;
        let cell_width = rect.width() / grid_size as f32;
        let cell_height = rect.height() / grid_size as f32;

        let concentration_grid = self.build_concentration_grid(system, sim_width, sim_height);

        let colors: Vec<egui::Color32> = concentration_grid
            .par_iter()
            .map(|&(total, weight)| {
                let avg_pollution = if weight > 0.0001 {
                    total / weight
                } else {
                    0.0
                };
                Self::pollution_to_color(avg_pollution)
            })
            .collect();

        for gy in 0..grid_size {
            for gx in 0..grid_size {
                let idx = gy * grid_size + gx;
                let color = colors[idx];

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

        painter.rect_stroke(
            rect,
            2.0,
            egui::Stroke::new(2.0, egui::Color32::from_rgb(100, 150, 200)),
        );
    }
}
