use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, Eq, DeriveEntityModel, Serialize, Deserialize)]
#[sea_orm(table_name = "routings")]
pub struct Model {
    #[sea_orm(primary_key, auto_increment = false)]
    pub id: String,
    
    #[sea_orm(column_type = "Text")]
    pub name: String,
    
    #[sea_orm(column_name = "input_device_id", column_type = "Text")]
    pub input_device_id: String,
    
    #[sea_orm(column_name = "input_channels", column_type = "Text")]
    pub input_channels: String,
    
    #[sea_orm(column_name = "output_device_id", column_type = "Text")]
    pub output_device_id: String,
    
    #[sea_orm(column_name = "output_channels", column_type = "Text")]
    pub output_channels: String,
    
    #[sea_orm(column_type = "Float")]
    pub gain: f32,
    
    #[sea_orm(column_name = "lowpass_cutoff", column_type = "Float")]
    pub lowpass_cutoff: f32,
    
    #[sea_orm(column_type = "Boolean")]
    pub enabled: bool,
    
    #[sea_orm(column_name = "created_at", column_type = "DateTime", default_value = "CURRENT_TIMESTAMP")]
    pub created_at: DateTime,
    
    #[sea_orm(column_name = "updated_at", column_type = "DateTime", default_value = "CURRENT_TIMESTAMP")]
    pub updated_at: DateTime,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {}

impl ActiveModelBehavior for ActiveModel {}
