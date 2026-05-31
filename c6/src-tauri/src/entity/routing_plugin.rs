use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(table_name = "routing_plugins")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: String,

    #[sea_orm(column_name = "routing_id", column_type = "Text")]
    pub routing_id: String,

    #[sea_orm(column_name = "plugin_id", column_type = "Text")]
    pub plugin_id: String,

    #[sea_orm(column_name = "position", column_type = "Integer")]
    pub position: i32,

    #[sea_orm(column_name = "is_bypassed", column_type = "Boolean")]
    pub is_bypassed: bool,

    #[sea_orm(column_name = "parameters", column_type = "Text", nullable)]
    pub parameters: Option<String>,

    #[sea_orm(column_name = "created_at", column_type = "DateTime", default_value = "CURRENT_TIMESTAMP")]
    pub created_at: DateTime,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    #[sea_orm(
        belongs_to = "super::routing::Entity",
        from = "Column::RoutingId",
        to = "super::routing::Column::Id"
    )]
    Routing,

    #[sea_orm(
        belongs_to = "super::plugin::Entity",
        from = "Column::PluginId",
        to = "super::plugin::Column::Id"
    )]
    Plugin,
}

impl ActiveModelBehavior for ActiveModel {}
