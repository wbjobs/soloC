use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(table_name = "scenes")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: String,

    #[sea_orm(column_type = "Text")]
    pub name: String,

    #[sea_orm(column_name = "description", column_type = "Text", nullable)]
    pub description: Option<String>,

    #[sea_orm(column_name = "routings_data", column_type = "Text")]
    pub routings_data: String,

    #[sea_orm(column_name = "is_default", column_type = "Boolean")]
    pub is_default: bool,

    #[sea_orm(column_name = "created_at", column_type = "DateTime", default_value = "CURRENT_TIMESTAMP")]
    pub created_at: DateTime,

    #[sea_orm(column_name = "updated_at", column_type = "DateTime", default_value = "CURRENT_TIMESTAMP")]
    pub updated_at: DateTime,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}

impl ActiveModelBehavior for ActiveModel {}
