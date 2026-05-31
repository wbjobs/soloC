use sea_orm_migration::prelude::*;

pub struct Migrator;

#[async_trait::async_trait]
impl MigratorTrait for Migrator {
    fn migrations() -> Vec<Box<dyn MigrationTrait>> {
        vec![
            Box::new(super::m20240101_000001_create_routings_table::Migration),
            Box::new(super::m20240101_000002_create_scenes_table::Migration),
            Box::new(super::m20240101_000003_create_plugins_table::Migration),
            Box::new(super::m20240101_000004_create_routing_plugins_table::Migration),
        ]
    }
}
