use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .create_table(
                Table::create()
                    .table(Scenes::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(Scenes::Id)
                            .string()
                            .not_null()
                            .primary_key(),
                    )
                    .col(ColumnDef::new(Scenes::Name).text().not_null())
                    .col(ColumnDef::new(Scenes::Description).text().null())
                    .col(ColumnDef::new(Scenes::RoutingsData).text().not_null())
                    .col(ColumnDef::new(Scenes::IsDefault).boolean().not_null().default(false))
                    .col(
                        ColumnDef::new(Scenes::CreatedAt)
                            .date_time()
                            .not_null()
                            .default(SimpleExpr::Keyword(Keyword::CurrentTimestamp)),
                    )
                    .col(
                        ColumnDef::new(Scenes::UpdatedAt)
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
                    .name("idx_scenes_name")
                    .table(Scenes::Table)
                    .col(Scenes::Name)
                    .to_owned(),
            )
            .await?;

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_table(Table::drop().table(Scenes::Table).to_owned())
            .await
    }
}

#[derive(Iden)]
enum Scenes {
    Table,
    Id,
    Name,
    Description,
    RoutingsData,
    IsDefault,
    CreatedAt,
    UpdatedAt,
}
