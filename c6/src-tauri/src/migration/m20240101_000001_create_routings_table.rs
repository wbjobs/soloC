use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .create_table(
                Table::create()
                    .table(Routings::Table)
                    .if_not_exists()
                    .col(
                        ColumnDef::new(Routings::Id)
                            .string()
                            .not_null()
                            .primary_key(),
                    )
                    .col(ColumnDef::new(Routings::Name).text().not_null())
                    .col(ColumnDef::new(Routings::InputDeviceId).text().not_null())
                    .col(ColumnDef::new(Routings::InputChannels).text().not_null())
                    .col(ColumnDef::new(Routings::OutputDeviceId).text().not_null())
                    .col(ColumnDef::new(Routings::OutputChannels).text().not_null())
                    .col(ColumnDef::new(Routings::Gain).float().not_null().default(1.0))
                    .col(ColumnDef::new(Routings::LowpassCutoff).float().not_null().default(20000.0))
                    .col(ColumnDef::new(Routings::Enabled).boolean().not_null().default(true))
                    .col(
                        ColumnDef::new(Routings::CreatedAt)
                            .date_time()
                            .not_null()
                            .default(SimpleExpr::Keyword(Keyword::CurrentTimestamp)),
                    )
                    .col(
                        ColumnDef::new(Routings::UpdatedAt)
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
                    .name("idx_routings_enabled")
                    .table(Routings::Table)
                    .col(Routings::Enabled)
                    .to_owned(),
            )
            .await?;

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_table(Table::drop().table(Routings::Table).to_owned())
            .await
    }
}

#[derive(Iden)]
enum Routings {
    Table,
    Id,
    Name,
    InputDeviceId,
    InputChannels,
    OutputDeviceId,
    OutputChannels,
    Gain,
    LowpassCutoff,
    Enabled,
    CreatedAt,
    UpdatedAt,
}
