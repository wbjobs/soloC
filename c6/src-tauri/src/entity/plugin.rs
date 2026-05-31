use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(table_name = "plugins")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: String,

    #[sea_orm(column_type = "Text")]
    pub name: String,

    #[sea_orm(column_name = "vendor", column_type = "Text")]
    pub vendor: String,

    #[sea_orm(column_name = "plugin_path", column_type = "Text")]
    pub plugin_path: String,

    #[sea_orm(column_name = "plugin_type", column_type = "Text")]
    pub plugin_type: String,

    #[sea_orm(column_name = "category", column_type = "Text", nullable)]
    pub category: Option<String>,

    #[sea_orm(column_name = "is_enabled", column_type = "Boolean")]
    pub is_enabled: bool,

    #[sea_orm(column_name = "created_at", column_type = "DateTime", default_value = "CURRENT_TIMESTAMP")]
    pub created_at: DateTime,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}

impl ActiveModelBehavior for ActiveModel {}
