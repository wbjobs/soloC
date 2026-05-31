use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .create_table(
                Table::create()
                    .table(RoutingPlugins::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(RoutingPlugins::Id)
                            .string()
                            .not_null()
                            .primary_key(),
                    )
                    .col(ColumnDef::new(RoutingPlugins::RoutingId).text().not_null())
                    .col(ColumnDef::new(RoutingPlugins::PluginId).text().not_null())
                    .col(ColumnDef::new(RoutingPlugins::Position).integer().not_null().default(0))
                    .col(ColumnDef::new(RoutingPlugins::IsBypassed).boolean().not_null().default(false))
                    .col(ColumnDef::new(RoutingPlugins::Parameters).text().null())
                    .col(
                        ColumnDef::new(RoutingPlugins::CreatedAt)
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
                    .name("idx_routing_plugins_routing")
                    .table(RoutingPlugins::Table)
                    .col(RoutingPlugins::RoutingId)
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("idx_routing_plugins_plugin")
                    .table(RoutingPlugins::Table)
                    .col(RoutingPlugins::PluginId)
                    .to_owned(),
            )
            .await?;

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_table(Table::drop().table(RoutingPlugins::Table).to_owned())
            .await
    }
}

#[derive(Iden)]
enum RoutingPlugins {
    Table,
    Id,
    RoutingId,
    PluginId,
    Position,
    IsBypassed,
    Parameters,
    CreatedAt,
}
