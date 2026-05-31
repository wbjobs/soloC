use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .create_table(
                Table::create()
                    .table(Plugins::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(Plugins::Id)
                            .string()
                            .not_null()
                            .primary_key(),
                    )
                    .col(ColumnDef::new(Plugins::Name).text().not_null())
                    .col(ColumnDef::new(Plugins::Vendor).text().not_null())
                    .col(ColumnDef::new(Plugins::PluginPath).text().not_null())
                    .col(ColumnDef::new(Plugins::PluginType).text().not_null())
                    .col(ColumnDef::new(Plugins::Category).text().null())
                    .col(ColumnDef::new(Plugins::IsEnabled).boolean().not_null().default(true))
                    .col(
                        ColumnDef::new(Plugins::CreatedAt)
                            .date_time()
                            .not_null()
                            .default(SimpleExpr::Keyword(Keyword::CurrentTimestamp)),
                    )
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("idx_plugins_path")
                    .table(Plugins::Table)
                    .col(Plugins::PluginPath)
                    .unique()
                    .to_owned(),
            )
            .await?;

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_table(Table::drop().table(Plugins::Table).to_owned())
            .await
    }
}

#[derive(Iden)]
enum Plugins {
    Table,
    Id,
    Name,
    Vendor,
    PluginPath,
    PluginType,
    Category,
    IsEnabled,
    CreatedAt,
}
