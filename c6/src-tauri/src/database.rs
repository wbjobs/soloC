use crate::entity::prelude::*;
use crate::models::{
    PluginInfo, RegisterPluginRequest, RoutingConfig, RoutingPluginConfig, Scene, SceneSnapshot,
    UpdateSceneRequest,
};
use crate::migration::Migrator;
use anyhow::{Context, Result};
use sea_orm::*;
use sea_orm_migration::MigratorTrait;
use std::path::PathBuf;
use uuid::Uuid;

pub struct DatabaseService {
    db: DatabaseConnection,
}

impl DatabaseService {
    pub async fn new() -> Result<Self> {
        let db_path = Self::get_db_path()?;
        let db_url = format!("sqlite:{}?mode=rwc", db_path.to_string_lossy());

        let db = Database::connect(&db_url)
            .await
            .with_context(|| format!("无法连接数据库: {}", db_url))?;

        Migrator::up(&db, None)
            .await
            .context("数据库迁移失败")?;

        let service = Self { db };
        service.create_default_scenes().await?;

        Ok(service)
    }

    fn get_db_path() -> Result<PathBuf> {
        let data_dir = dirs::data_dir()
            .context("无法获取数据目录")?;

        let app_dir = data_dir.join("USB音频控制面板");
        std::fs::create_dir_all(&app_dir)
            .with_context(|| format!("无法创建数据目录: {:?}", app_dir))?;

        Ok(app_dir.join("routings.db"))
    }

    async fn create_default_scenes(&self) -> Result<()> {
        let count = SceneEntity::find()
            .count(&self.db)
            .await?;

        if count > 0 {
            return Ok(());
        }

        let default_routings: Vec<RoutingConfig> = vec![];
        let default_snapshot = SceneSnapshot::new(default_routings);
        let default_data = serde_json::to_string(&default_snapshot)?;

        let scenes = [
            (
                "默认场景",
                Some("基础配置，适合日常使用"),
                true,
                default_data.clone(),
            ),
            (
                "吉他录制模式",
                Some("优化用于吉他录音的低延迟配置"),
                false,
                default_data.clone(),
            ),
            (
                "播客模式",
                Some("适合语音录制和播客制作的配置"),
                false,
                default_data,
            ),
        ];

        for (name, description, is_default, data) in scenes {
            let model = SceneActiveModel {
                id: Set(Uuid::new_v4().to_string()),
                name: Set(name.to_string()),
                description: Set(description.map(|s| s.to_string())),
                routings_data: Set(data),
                is_default: Set(is_default),
                created_at: Set(chrono::Utc::now().naive_utc()),
                updated_at: Set(chrono::Utc::now().naive_utc()),
            };
            model.insert(&self.db).await?;
        }

        Ok(())
    }

    pub async fn get_all_routings(&self) -> Result<Vec<RoutingConfig>> {
        let models = RoutingEntity::find()
            .order_by_asc(RoutingColumn::CreatedAt)
            .all(&self.db)
            .await
            .context("查询路由配置失败")?;

        let configs: Vec<RoutingConfig> = models
            .into_iter()
            .map(Self::model_to_config)
            .collect();

        Ok(configs)
    }

    pub async fn create_routing(&self, config: &RoutingConfig) -> Result<RoutingConfig> {
        let now = chrono::Utc::now().naive_utc();

        let active_model = RoutingActiveModel {
            id: Set(Uuid::new_v4().to_string()),
            name: Set(config.name.clone()),
            input_device_id: Set(config.input_device_id.clone()),
            input_channels: Set(serde_json::to_string(&config.input_channels)?),
            output_device_id: Set(config.output_device_id.clone()),
            output_channels: Set(serde_json::to_string(&config.output_channels)?),
            gain: Set(config.gain),
            lowpass_cutoff: Set(config.lowpass_cutoff),
            enabled: Set(config.enabled),
            created_at: Set(now),
            updated_at: Set(now),
        };

        let model = active_model
            .insert(&self.db)
            .await
            .context("创建路由失败")?;

        Ok(Self::model_to_config(model))
    }

    pub async fn update_routing(&self, config: &RoutingConfig) -> Result<RoutingConfig> {
        let model = RoutingEntity::find_by_id(&config.id)
            .one(&self.db)
            .await
            .context("查询路由失败")?
            .ok_or_else(|| anyhow::anyhow!("路由不存在: {}", config.id))?;

        let mut active_model: RoutingActiveModel = model.into();
        active_model.name = Set(config.name.clone());
        active_model.input_device_id = Set(config.input_device_id.clone());
        active_model.input_channels = Set(serde_json::to_string(&config.input_channels)?);
        active_model.output_device_id = Set(config.output_device_id.clone());
        active_model.output_channels = Set(serde_json::to_string(&config.output_channels)?);
        active_model.gain = Set(config.gain);
        active_model.lowpass_cutoff = Set(config.lowpass_cutoff);
        active_model.enabled = Set(config.enabled);
        active_model.updated_at = Set(chrono::Utc::now().naive_utc());

        let updated_model = active_model
            .update(&self.db)
            .await
            .context("更新路由失败")?;

        Ok(Self::model_to_config(updated_model))
    }

    pub async fn delete_routing(&self, id: &str) -> Result<()> {
        let result = RoutingEntity::delete_by_id(id)
            .exec(&self.db)
            .await
            .context("删除路由失败")?;

        if result.rows_affected == 0 {
            return Err(anyhow::anyhow!("路由不存在: {}", id));
        }

        Ok(())
    }

    pub async fn update_gain(&self, id: &str, gain: f32) -> Result<()> {
        let model = RoutingEntity::find_by_id(id)
            .one(&self.db)
            .await
            .context("查询路由失败")?
            .ok_or_else(|| anyhow::anyhow!("路由不存在: {}", id))?;

        let mut active_model: RoutingActiveModel = model.into();
        active_model.gain = Set(gain);
        active_model.updated_at = Set(chrono::Utc::now().naive_utc());

        active_model
            .update(&self.db)
            .await
            .context("更新增益失败")?;

        Ok(())
    }

    pub async fn update_lowpass(&self, id: &str, cutoff: f32) -> Result<()> {
        let model = RoutingEntity::find_by_id(id)
            .one(&self.db)
            .await
            .context("查询路由失败")?
            .ok_or_else(|| anyhow::anyhow!("路由不存在: {}", id))?;

        let mut active_model: RoutingActiveModel = model.into();
        active_model.lowpass_cutoff = Set(cutoff);
        active_model.updated_at = Set(chrono::Utc::now().naive_utc());

        active_model
            .update(&self.db)
            .await
            .context("更新低通滤波器失败")?;

        Ok(())
    }

    pub async fn toggle_routing(&self, id: &str, enabled: bool) -> Result<()> {
        let model = RoutingEntity::find_by_id(id)
            .one(&self.db)
            .await
            .context("查询路由失败")?
            .ok_or_else(|| anyhow::anyhow!("路由不存在: {}", id))?;

        let mut active_model: RoutingActiveModel = model.into();
        active_model.enabled = Set(enabled);
        active_model.updated_at = Set(chrono::Utc::now().naive_utc());

        active_model
            .update(&self.db)
            .await
            .context("切换路由状态失败")?;

        Ok(())
    }

    pub async fn replace_all_routings(&self, routings: &[RoutingConfig]) -> Result<()> {
        RoutingEntity::delete_many()
            .exec(&self.db)
            .await
            .context("清除现有路由失败")?;

        for routing in routings {
            self.create_routing(routing).await?;
        }

        Ok(())
    }

    pub async fn get_all_scenes(&self) -> Result<Vec<Scene>> {
        let models = SceneEntity::find()
            .order_by_asc(SceneColumn::CreatedAt)
            .all(&self.db)
            .await
            .context("查询场景失败")?;

        Ok(models.into_iter().map(Self::scene_model_to_scene).collect())
    }

    pub async fn get_default_scene(&self) -> Result<Option<Scene>> {
        let model = SceneEntity::find()
            .filter(SceneColumn::IsDefault.eq(true))
            .one(&self.db)
            .await
            .context("查询默认场景失败")?;

        Ok(model.map(Self::scene_model_to_scene))
    }

    pub async fn get_scene(&self, id: &str) -> Result<Scene> {
        let model = SceneEntity::find_by_id(id)
            .one(&self.db)
            .await
            .context("查询场景失败")?
            .ok_or_else(|| anyhow::anyhow!("场景不存在: {}", id))?;

        Ok(Self::scene_model_to_scene(model))
    }

    pub async fn create_scene(
        &self,
        name: String,
        description: Option<String>,
        routings: Vec<RoutingConfig>,
    ) -> Result<Scene> {
        let snapshot = SceneSnapshot::new(routings);
        let routings_data = serde_json::to_string(&snapshot)?;
        let now = chrono::Utc::now().naive_utc();

        let active_model = SceneActiveModel {
            id: Set(Uuid::new_v4().to_string()),
            name: Set(name),
            description: Set(description),
            routings_data: Set(routings_data),
            is_default: Set(false),
            created_at: Set(now),
            updated_at: Set(now),
        };

        let model = active_model
            .insert(&self.db)
            .await
            .context("创建场景失败")?;

        Ok(Self::scene_model_to_scene(model))
    }

    pub async fn update_scene(&self, request: UpdateSceneRequest) -> Result<Scene> {
        let model = SceneEntity::find_by_id(&request.id)
            .one(&self.db)
            .await
            .context("查询场景失败")?
            .ok_or_else(|| anyhow::anyhow!("场景不存在: {}", request.id))?;

        let mut active_model: SceneActiveModel = model.into();

        if let Some(name) = request.name {
            active_model.name = Set(name);
        }
        if let Some(desc) = request.description {
            active_model.description = Set(Some(desc));
        }
        if let Some(routings) = request.routings {
            let snapshot = SceneSnapshot::new(routings);
            active_model.routings_data = Set(serde_json::to_string(&snapshot)?);
        }

        active_model.updated_at = Set(chrono::Utc::now().naive_utc());

        let updated_model = active_model
            .update(&self.db)
            .await
            .context("更新场景失败")?;

        Ok(Self::scene_model_to_scene(updated_model))
    }

    pub async fn delete_scene(&self, id: &str) -> Result<()> {
        let scene = SceneEntity::find_by_id(id)
            .one(&self.db)
            .await
            .context("查询场景失败")?
            .ok_or_else(|| anyhow::anyhow!("场景不存在: {}", id))?;

        if scene.is_default {
            return Err(anyhow::anyhow!("无法删除默认场景"));
        }

        let result = SceneEntity::delete_by_id(id)
            .exec(&self.db)
            .await
            .context("删除场景失败")?;

        if result.rows_affected == 0 {
            return Err(anyhow::anyhow!("场景不存在: {}", id));
        }

        Ok(())
    }

    pub async fn load_scene_routings(&self, scene_id: &str) -> Result<Vec<RoutingConfig>> {
        let scene = SceneEntity::find_by_id(scene_id)
            .one(&self.db)
            .await
            .context("查询场景失败")?
            .ok_or_else(|| anyhow::anyhow!("场景不存在: {}", scene_id))?;

        let snapshot: SceneSnapshot = serde_json::from_str(&scene.routings_data)
            .context("解析场景快照失败")?;

        Ok(snapshot.routings)
    }

    pub async fn set_default_scene(&self, scene_id: &str) -> Result<()> {
        SceneEntity::update_many()
            .col_expr(SceneColumn::IsDefault, Expr::value(false))
            .exec(&self.db)
            .await
            .context("重置默认场景失败")?;

        let model = SceneEntity::find_by_id(scene_id)
            .one(&self.db)
            .await
            .context("查询场景失败")?
            .ok_or_else(|| anyhow::anyhow!("场景不存在: {}", scene_id))?;

        let mut active_model: SceneActiveModel = model.into();
        active_model.is_default = Set(true);
        active_model.updated_at = Set(chrono::Utc::now().naive_utc());

        active_model
            .update(&self.db)
            .await
            .context("设置默认场景失败")?;

        Ok(())
    }

    pub async fn get_all_plugins(&self) -> Result<Vec<PluginInfo>> {
        let models = PluginEntity::find()
            .order_by_asc(PluginColumn::Name)
            .all(&self.db)
            .await
            .context("查询插件失败")?;

        Ok(models.into_iter().map(Self::plugin_model_to_info).collect())
    }

    pub async fn register_plugin(&self, request: RegisterPluginRequest) -> Result<PluginInfo> {
        let existing = PluginEntity::find()
            .filter(PluginColumn::PluginPath.eq(&request.plugin_path))
            .one(&self.db)
            .await?;

        if existing.is_some() {
            return Err(anyhow::anyhow!("插件已注册"));
        }

        let active_model = PluginActiveModel {
            id: Set(Uuid::new_v4().to_string()),
            name: Set(request.name),
            vendor: Set(request.vendor),
            plugin_path: Set(request.plugin_path),
            plugin_type: Set(request.plugin_type),
            category: Set(request.category),
            is_enabled: Set(true),
            created_at: Set(chrono::Utc::now().naive_utc()),
        };

        let model = active_model
            .insert(&self.db)
            .await
            .context("注册插件失败")?;

        Ok(Self::plugin_model_to_info(model))
    }

    pub async fn unregister_plugin(&self, plugin_id: &str) -> Result<()> {
        RoutingPluginEntity::delete_many()
            .filter(RoutingPluginColumn::PluginId.eq(plugin_id))
            .exec(&self.db)
            .await?;

        let result = PluginEntity::delete_by_id(plugin_id)
            .exec(&self.db)
            .await
            .context("卸载插件失败")?;

        if result.rows_affected == 0 {
            return Err(anyhow::anyhow!("插件不存在: {}", plugin_id));
        }

        Ok(())
    }

    pub async fn get_routing_plugins(&self, routing_id: &str) -> Result<Vec<RoutingPluginConfig>> {
        let models = RoutingPluginEntity::find()
            .filter(RoutingPluginColumn::RoutingId.eq(routing_id))
            .order_by_asc(RoutingPluginColumn::Position)
            .all(&self.db)
            .await
            .context("查询路由插件失败")?;

        Ok(models
            .into_iter()
            .map(Self::routing_plugin_model_to_config)
            .collect())
    }

    pub async fn add_plugin_to_routing(
        &self,
        routing_id: &str,
        plugin_id: &str,
        position: i32,
    ) -> Result<RoutingPluginConfig> {
        let active_model = RoutingPluginActiveModel {
            id: Set(Uuid::new_v4().to_string()),
            routing_id: Set(routing_id.to_string()),
            plugin_id: Set(plugin_id.to_string()),
            position: Set(position),
            is_bypassed: Set(false),
            parameters: Set(None),
            created_at: Set(chrono::Utc::now().naive_utc()),
        };

        let model = active_model
            .insert(&self.db)
            .await
            .context("添加插件到路由失败")?;

        Ok(Self::routing_plugin_model_to_config(model))
    }

    pub async fn remove_plugin_from_routing(&self, routing_plugin_id: &str) -> Result<()> {
        let result = RoutingPluginEntity::delete_by_id(routing_plugin_id)
            .exec(&self.db)
            .await
            .context("从路由移除插件失败")?;

        if result.rows_affected == 0 {
            return Err(anyhow::anyhow!("路由插件不存在"));
        }

        Ok(())
    }

    pub async fn update_plugin_bypass(&self, routing_plugin_id: &str, bypassed: bool) -> Result<()> {
        let model = RoutingPluginEntity::find_by_id(routing_plugin_id)
            .one(&self.db)
            .await
            .context("查询路由插件失败")?
            .ok_or_else(|| anyhow::anyhow!("路由插件不存在"))?;

        let mut active_model: RoutingPluginActiveModel = model.into();
        active_model.is_bypassed = Set(bypassed);

        active_model
            .update(&self.db)
            .await
            .context("更新插件旁路状态失败")?;

        Ok(())
    }

    fn model_to_config(model: RoutingModel) -> RoutingConfig {
        RoutingConfig {
            id: model.id,
            name: model.name,
            input_device_id: model.input_device_id,
            input_channels: serde_json::from_str(&model.input_channels).unwrap_or_default(),
            output_device_id: model.output_device_id,
            output_channels: serde_json::from_str(&model.output_channels).unwrap_or_default(),
            gain: model.gain,
            lowpass_cutoff: model.lowpass_cutoff,
            enabled: model.enabled,
        }
    }

    fn scene_model_to_scene(model: SceneModel) -> Scene {
        Scene {
            id: model.id,
            name: model.name,
            description: model.description,
            routings_data: model.routings_data,
            is_default: model.is_default,
            created_at: model.created_at.to_string(),
            updated_at: model.updated_at.to_string(),
        }
    }

    fn plugin_model_to_info(model: PluginModel) -> PluginInfo {
        PluginInfo {
            id: model.id,
            name: model.name,
            vendor: model.vendor,
            plugin_path: model.plugin_path,
            plugin_type: model.plugin_type,
            category: model.category,
            is_enabled: model.is_enabled,
            created_at: model.created_at.to_string(),
        }
    }

    fn routing_plugin_model_to_config(model: RoutingPluginModel) -> RoutingPluginConfig {
        RoutingPluginConfig {
            id: model.id,
            routing_id: model.routing_id,
            plugin_id: model.plugin_id,
            position: model.position,
            is_bypassed: model.is_bypassed,
            parameters: model.parameters.and_then(|s| serde_json::from_str(&s).ok()),
        }
    }
}
