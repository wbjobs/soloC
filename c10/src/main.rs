mod particles;
mod sph;
mod wind_field;
mod wind_turbine;
mod pollution;
mod purifier;
mod heatmap;
mod temperature;
mod recorder;
mod game;

use eframe::egui;
use particles::ParticleSystem;
use wind_field::WindField;
use wind_turbine::WindTurbineManager;
use pollution::{PollutionSource, PollutionManager};
use purifier::Purifier;
use temperature::{TemperatureField, HeatSource};
use game::{GameState, GameConfig};
use heatmap::HeatmapRenderer;

fn main() -> Result<(), eframe::Error> {
    let options = eframe::NativeOptions {
        initial_window_size: Some(egui::vec2(1400.0, 900.0)),
        ..Default::default()
    };

    eframe::run_native(
        "SPH污染物扩散战术游戏",
        options,
        Box::new(|cc| Box::new(GameApp::new(cc))),
    )
}

struct GameApp {
    game_state: GameState,
    game_config: GameConfig,
    particles: ParticleSystem,
    wind_field: WindField,
    wind_turbine_manager: WindTurbineManager,
    pollution_manager: PollutionManager,
    purifiers: Vec<Purifier>,
    temperature_field: TemperatureField,
    heat_sources: Vec<HeatSource>,
    heatmap_renderer: HeatmapRenderer,
    recorder: recorder::Recorder,
    selected_tool: Tool,
    is_dragging_wind: bool,
    wind_drag_start: Option<egui::Pos2>,
    elapsed_time: f32,
    fps: f32,
    frame_count: u32,
    last_fps_time: f32,
    show_temperature_overlay: bool,
}

#[derive(PartialEq, Clone, Copy)]
enum Tool {
    Select,
    PlaceSource,
    PlacePurifier,
    PlaceTurbine,
    PlaceHeatSource,
    EditWind,
}

impl GameApp {
    fn new(_cc: &eframe::CreationContext<'_>) -> Self {
        let config = GameConfig::default();
        let grid_size = 32;
        let temp_grid_size = 32;
        let particles = ParticleSystem::new(config.particle_count, config.simulation_width, config.simulation_height);
        let wind_field = WindField::new(config.simulation_width, config.simulation_height, grid_size);
        let temperature_field = TemperatureField::new(config.simulation_width, config.simulation_height, temp_grid_size);
        let recorder = recorder::Recorder::new(config.simulation_width as u32, config.simulation_height as u32);

        Self {
            game_state: GameState::Paused,
            game_config: config,
            particles,
            wind_field,
            wind_turbine_manager: WindTurbineManager::new(),
            pollution_manager: PollutionManager::new(),
            purifiers: Vec::new(),
            temperature_field,
            heat_sources: Vec::new(),
            heatmap_renderer: HeatmapRenderer::new(),
            recorder,
            selected_tool: Tool::Select,
            is_dragging_wind: false,
            wind_drag_start: None,
            elapsed_time: 0.0,
            fps: 0.0,
            frame_count: 0,
            last_fps_time: 0.0,
            show_temperature_overlay: false,
        }
    }

    fn update_simulation(&mut self, dt: f32) {
        if self.game_state != GameState::Running {
            return;
        }

        self.elapsed_time += dt;
        self.frame_count += 1;

        if self.elapsed_time - self.last_fps_time >= 1.0 {
            self.fps = self.frame_count as f32 / (self.elapsed_time - self.last_fps_time);
            self.frame_count = 0;
            self.last_fps_time = self.elapsed_time;
        }

        self.temperature_field.update(&self.heat_sources, dt);

        self.pollution_manager.emit_pollution(
            &mut self.particles,
            &self.wind_field,
            &self.temperature_field,
            dt,
            self.game_config.pollution_emission_rate,
            self.game_config.diffusion_coefficient,
        );

        sph::update_particles(
            &mut self.particles,
            &self.wind_field,
            &self.wind_turbine_manager,
            &self.purifiers,
            dt,
            self.game_config.gravity,
            self.game_config.viscosity,
            self.game_config.particle_radius,
        );

        self.check_game_state();
    }

    fn check_game_state(&mut self) {
        let total_pollution = self.particles.get_total_pollution();
        let avg_pollution = total_pollution / self.particles.particles.len() as f32;

        if self.elapsed_time >= self.game_config.time_limit {
            if avg_pollution <= self.game_config.target_threshold {
                self.game_state = GameState::Won;
                if self.recorder.is_recording() {
                    self.recorder.stop_recording();
                }
            } else {
                self.game_state = GameState::Lost;
                if self.recorder.is_recording() {
                    self.recorder.stop_recording();
                }
            }
        }
    }

    fn draw_simulation(&mut self, ui: &mut egui::Ui) {
        let (response, painter) = ui.allocate_painter(
            egui::vec2(self.game_config.simulation_width, self.game_config.simulation_height),
            egui::Sense::click_and_drag(),
        );

        let rect = response.rect;
        let to_sim = |pos: egui::Pos2| {
            glam::Vec2::new(
                (pos.x - rect.left()) / rect.width() * self.game_config.simulation_width,
                (pos.y - rect.top()) / rect.height() * self.game_config.simulation_height,
            )
        };

        if self.show_temperature_overlay {
            self.temperature_field.render(&painter, rect);
        } else {
            self.heatmap_renderer.render(
                &painter,
                rect,
                &self.particles,
                self.game_config.simulation_width,
                self.game_config.simulation_height,
            );
        }

        for source in &self.heat_sources {
            let screen_pos = egui::pos2(
                rect.left() + (source.position.x / self.game_config.simulation_width) * rect.width(),
                rect.top() + (source.position.y / self.game_config.simulation_height) * rect.height(),
            );
            let screen_radius = (source.radius / self.game_config.simulation_width) * rect.width();
            painter.circle_stroke(
                screen_pos,
                screen_radius,
                egui::Stroke::new(2.0, egui::Color32::from_rgba_unmultiplied(255, 100, 0, 180)),
            );
            painter.circle_filled(
                screen_pos,
                6.0,
                egui::Color32::from_rgba_unmultiplied(255, 150, 0, 220),
            );
        }

        for source in &self.pollution_manager.sources {
            let screen_pos = egui::pos2(
                rect.left() + (source.position.x / self.game_config.simulation_width) * rect.width(),
                rect.top() + (source.position.y / self.game_config.simulation_height) * rect.height(),
            );
            painter.circle_filled(
                screen_pos,
                8.0,
                egui::Color32::from_rgba_unmultiplied(255, 100, 0, 200),
            );
            painter.circle_stroke(
                screen_pos,
                12.0,
                egui::Stroke::new(2.0, egui::Color32::RED),
            );
        }

        for purifier in &self.purifiers {
            let screen_pos = egui::pos2(
                rect.left() + (purifier.position.x / self.game_config.simulation_width) * rect.width(),
                rect.top() + (purifier.position.y / self.game_config.simulation_height) * rect.height(),
            );
            let screen_radius = (purifier.radius / self.game_config.simulation_width) * rect.width();
            painter.circle_stroke(
                screen_pos,
                screen_radius,
                egui::Stroke::new(3.0, egui::Color32::GREEN),
            );
            painter.circle_filled(
                screen_pos,
                5.0,
                egui::Color32::GREEN,
            );
        }

        self.wind_turbine_manager.render_all(
            &painter,
            rect,
            self.game_config.simulation_width,
            self.game_config.simulation_height,
        );

        self.wind_field.render(&painter, rect);

        if response.dragged() {
            if let Some(pos) = response.interact_pointer_pos() {
                let sim_pos = to_sim(pos);
                match self.selected_tool {
                    Tool::PlaceSource => {
                        if response.drag_started() {
                            self.pollution_manager.add_source(sim_pos, self.game_config.source_strength);
                        }
                    }
                    Tool::PlacePurifier => {
                        if response.drag_started() {
                            self.purifiers.push(Purifier::new(sim_pos, self.game_config.purifier_radius));
                        }
                    }
                    Tool::PlaceTurbine => {
                        if response.drag_started() {
                            self.wind_turbine_manager.add_turbine(
                                sim_pos,
                                self.game_config.turbine_radius,
                                self.game_config.turbine_strength,
                            );
                        }
                    }
                    Tool::PlaceHeatSource => {
                        if response.drag_started() {
                            self.heat_sources.push(HeatSource::new(
                                sim_pos,
                                self.game_config.heat_radius,
                                self.game_config.heat_temperature,
                            ));
                        }
                    }
                    Tool::EditWind => {
                        if response.drag_started() {
                            self.is_dragging_wind = true;
                            self.wind_drag_start = Some(pos);
                        }
                        if self.is_dragging_wind {
                            if let (Some(start), _) = (self.wind_drag_start, response.interact_pointer_pos()) {
                                let delta = pos - start;
                                let wind_vec = glam::Vec2::new(delta.x * 0.1, delta.y * 0.1);
                                self.wind_field.set_wind_at(sim_pos, wind_vec);
                            }
                        }
                    }
                    _ => {}
                }
            }
        }

        if response.drag_stopped() {
            self.is_dragging_wind = false;
            self.wind_drag_start = None;
        }
    }
}

impl eframe::App for GameApp {
    fn update(&mut self, ctx: &egui::Context, _frame: &mut eframe::Frame) {
        let dt = ctx.input(|i| i.stable_dt);
        self.update_simulation(dt);

        egui::TopBottomPanel::top("top_panel").show(ctx, |ui| {
            ui.horizontal(|ui| {
                ui.heading("SPH污染物扩散战术游戏");
                ui.separator();

                match self.game_state {
                    GameState::Running => {
                        if ui.button("暂停").clicked() {
                            self.game_state = GameState::Paused;
                        }
                    }
                    GameState::Paused => {
                        if ui.button("开始").clicked() {
                            self.game_state = GameState::Running;
                        }
                    }
                    _ => {}
                }

                if ui.button("重置").clicked() {
                    self.game_state = GameState::Paused;
                    self.elapsed_time = 0.0;
                    self.particles = ParticleSystem::new(
                        self.game_config.particle_count,
                        self.game_config.simulation_width,
                        self.game_config.simulation_height,
                    );
                    self.pollution_manager = PollutionManager::new();
                    self.purifiers.clear();
                    self.wind_turbine_manager.clear();
                    self.heat_sources.clear();
                    self.temperature_field.clear();
                    self.wind_field = WindField::new(
                        self.game_config.simulation_width,
                        self.game_config.simulation_height,
                        32,
                    );
                }

                ui.separator();
                ui.label(format!("FPS: {:.1}", self.fps));
                ui.label(format!("时间: {:.1}s / {:.1}s", self.elapsed_time, self.game_config.time_limit));

                let total_pollution = self.particles.get_total_pollution();
                let avg_pollution = total_pollution / self.particles.particles.len() as f32;
                ui.label(format!("平均污染: {:.2} / 目标: {:.2}", avg_pollution, self.game_config.target_threshold));

                ui.separator();
                ui.checkbox(&mut self.show_temperature_overlay, "显示温度场");
            });
        });

        egui::SidePanel::left("control_panel")
            .resizable(false)
            .min_width(280.0)
            .show(ctx, |ui| {
                ui.heading("工具");
                ui.vertical(|ui| {
                    ui.selectable_value(&mut self.selected_tool, Tool::Select, "选择");
                    ui.selectable_value(&mut self.selected_tool, Tool::PlaceSource, "放置污染源");
                    ui.selectable_value(&mut self.selected_tool, Tool::PlacePurifier, "放置净化器");
                    ui.selectable_value(&mut self.selected_tool, Tool::PlaceTurbine, "放置风力涡轮机");
                    ui.selectable_value(&mut self.selected_tool, Tool::PlaceHeatSource, "放置热源");
                    ui.selectable_value(&mut self.selected_tool, Tool::EditWind, "编辑风场");
                });

                ui.separator();
                ui.heading("游戏设置");

                ui.label("污染源强度:");
                ui.add(egui::Slider::new(&mut self.game_config.source_strength, 0.1..=5.0)
                    .text("强度"));

                ui.label("扩散系数:");
                ui.add(egui::Slider::new(&mut self.game_config.diffusion_coefficient, 0.01..=0.5)
                    .text("扩散"));

                ui.label("净化器半径:");
                ui.add(egui::Slider::new(&mut self.game_config.purifier_radius, 20.0..=100.0)
                    .text("半径"));

                ui.label("时间限制 (秒):");
                ui.add(egui::Slider::new(&mut self.game_config.time_limit, 30.0..=300.0)
                    .text("时间"));

                ui.label("目标污染阈值:");
                ui.add(egui::Slider::new(&mut self.game_config.target_threshold, 0.1..=2.0)
                    .text("阈值"));

                ui.separator();
                ui.heading("风力涡轮机");

                ui.label("涡轮机影响半径:");
                ui.add(egui::Slider::new(&mut self.game_config.turbine_radius, 40.0..=150.0)
                    .text("半径"));

                ui.label("涡轮机强度:");
                ui.add(egui::Slider::new(&mut self.game_config.turbine_strength, 50.0..=500.0)
                    .text("强度"));

                ui.separator();
                ui.heading("温度系统");

                ui.label("热源温度:");
                ui.add(egui::Slider::new(&mut self.game_config.heat_temperature, 40.0..=200.0)
                    .text("°C"));

                ui.label("热源影响半径:");
                ui.add(egui::Slider::new(&mut self.game_config.heat_radius, 30.0..=120.0)
                    .text("半径"));

                ui.separator();
                ui.heading("物理参数");

                ui.label("重力:");
                ui.add(egui::Slider::new(&mut self.game_config.gravity, -50.0..=50.0)
                    .text("G"));

                ui.label("黏度:");
                ui.add(egui::Slider::new(&mut self.game_config.viscosity, 0.01..=2.0)
                    .text("黏度"));

                ui.separator();
                ui.heading("风场控制");

                if ui.button("清除风场").clicked() {
                    self.wind_field.clear();
                }

                ui.label("全局风力强度:");
                let mut global_strength = self.wind_field.get_global_strength();
                if ui.add(egui::Slider::new(&mut global_strength, 0.0..=500.0).text("强度")).changed() {
                    self.wind_field.set_global_strength(global_strength);
                }

                ui.separator();
                recorder::render_ui(&mut self.recorder, ui, self.elapsed_time);
            });

        egui::SidePanel::right("side_panels")
            .resizable(false)
            .min_width(220.0)
            .show(ctx, |ui| {
                ui.heading("风场小地图");
                self.wind_field.render_minimap(ui);
                
                ui.add_space(10.0);
                ui.separator();
                ui.add_space(10.0);
                
                ui.heading("温度场小地图");
                self.temperature_field.render_minimap(ui, &self.heat_sources);
            });

        egui::CentralPanel::default().show(ctx, |ui| {
            match self.game_state {
                GameState::Won => {
                    let total_pollution = self.particles.get_total_pollution();
                    let avg_pollution = total_pollution / self.particles.particles.len() as f32;
                    
                    ui.vertical_centered(|ui| {
                        ui.add_space(50.0);
                        ui.heading("🎉 恭喜获胜！");
                        ui.add_space(10.0);
                        ui.label(egui::RichText::new("污染已控制在安全范围内")
                            .size(18.0)
                            .color(egui::Color32::GREEN));
                        ui.add_space(20.0);
                        
                        ui.vertical(|ui| {
                            ui.label(format!("最终平均污染浓度: {:.4}", avg_pollution));
                            ui.label(format!("目标阈值: {:.4}", self.game_config.target_threshold));
                            ui.label(format!("用时: {:.1} 秒", self.elapsed_time));
                            ui.label(format!("污染源数量: {}", self.pollution_manager.sources.len()));
                            ui.label(format!("净化器数量: {}", self.purifiers.len()));
                            ui.label(format!("风力涡轮机数量: {}", self.wind_turbine_manager.turbines.len()));
                            ui.label(format!("热源数量: {}", self.heat_sources.len()));
                        });
                        
                        ui.add_space(30.0);
                        
                        if ui.add(egui::Button::new("再来一局")
                            .min_size(egui::vec2(120.0, 40.0))).clicked() {
                            self.game_state = GameState::Paused;
                            self.elapsed_time = 0.0;
                            self.particles = ParticleSystem::new(
                                self.game_config.particle_count,
                                self.game_config.simulation_width,
                                self.game_config.simulation_height,
                            );
                            self.pollution_manager = PollutionManager::new();
                            self.purifiers.clear();
                            self.wind_turbine_manager.clear();
                            self.heat_sources.clear();
                            self.temperature_field.clear();
                        }
                    });
                }
                GameState::Lost => {
                    let total_pollution = self.particles.get_total_pollution();
                    let avg_pollution = total_pollution / self.particles.particles.len() as f32;
                    
                    ui.vertical_centered(|ui| {
                        ui.add_space(50.0);
                        ui.heading("💔 游戏结束");
                        ui.add_space(10.0);
                        ui.label(egui::RichText::new("污染未能控制在安全范围内")
                            .size(18.0)
                            .color(egui::Color32::RED));
                        ui.add_space(20.0);
                        
                        ui.vertical(|ui| {
                            ui.label(format!("最终平均污染浓度: {:.4}", avg_pollution));
                            ui.label(format!("目标阈值: {:.4}", self.game_config.target_threshold));
                            ui.label(format!("超出: {:.4}", (avg_pollution - self.game_config.target_threshold).max(0.0)));
                            ui.label(format!("用时: {:.1} 秒", self.elapsed_time));
                            ui.label(format!("污染源数量: {}", self.pollution_manager.sources.len()));
                            ui.label(format!("净化器数量: {}", self.purifiers.len()));
                            ui.label(format!("风力涡轮机数量: {}", self.wind_turbine_manager.turbines.len()));
                            ui.label(format!("热源数量: {}", self.heat_sources.len()));
                        });
                        
                        ui.add_space(30.0);
                        
                        if ui.add(egui::Button::new("重新尝试")
                            .min_size(egui::vec2(120.0, 40.0))).clicked() {
                            self.game_state = GameState::Paused;
                            self.elapsed_time = 0.0;
                            self.particles = ParticleSystem::new(
                                self.game_config.particle_count,
                                self.game_config.simulation_width,
                                self.game_config.simulation_height,
                            );
                            self.pollution_manager = PollutionManager::new();
                            self.purifiers.clear();
                            self.wind_turbine_manager.clear();
                            self.heat_sources.clear();
                            self.temperature_field.clear();
                        }
                    });
                }
                _ => {
                    self.draw_simulation(ui);
                }
            }
        });

        ctx.request_repaint();
    }
}
