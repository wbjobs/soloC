package database

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/jackc/pgx/v5"
	"ais-tracker-backend/config"
	"ais-tracker-backend/models"
)

type Database struct {
	conn *pgx.Conn
	cfg  *config.Config
}

func New(cfg *config.Config) (*Database, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	dsn := fmt.Sprintf(
		"postgres://%s:%s@%s:%d/%s",
		cfg.DBUser, cfg.DBPassword, cfg.DBHost, cfg.DBPort, cfg.DBName,
	)

	conn, err := pgx.Connect(ctx, dsn)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to database: %w", err)
	}

	db := &Database{conn: conn, cfg: cfg}

	if err := db.initSchema(ctx); err != nil {
		return nil, fmt.Errorf("failed to initialize schema: %w", err)
	}

	return db, nil
}

func (db *Database) initSchema(ctx context.Context) error {
	if _, err := db.conn.Exec(ctx, `CREATE EXTENSION IF NOT EXISTS timescaledb`); err != nil {
		log.Printf("Warning: failed to create timescaledb extension: %v", err)
	}

	if err := db.initRawTable(ctx); err != nil {
		log.Printf("Warning: failed to init raw table: %v", err)
	}

	if err := db.initCompressedTable(ctx); err != nil {
		log.Printf("Warning: failed to init compressed table: %v", err)
	}

	if err := db.initStatsTable(ctx); err != nil {
		log.Printf("Warning: failed to init stats table: %v", err)
	}

	return nil
}

func (db *Database) initRawTable(ctx context.Context) error {
	createTable := `
		CREATE TABLE IF NOT EXISTS ais_raw (
			mmsi TEXT NOT NULL,
			lon DOUBLE PRECISION NOT NULL,
			lat DOUBLE PRECISION NOT NULL,
			speed DOUBLE PRECISION NOT NULL,
			time TIMESTAMPTZ NOT NULL
		)
	`
	if _, err := db.conn.Exec(ctx, createTable); err != nil {
		return err
	}

	isHypertable := false
	db.conn.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1 FROM _timescaledb_catalog.hypertable 
			WHERE table_name = 'ais_raw'
		)
	`).Scan(&isHypertable)

	if !isHypertable {
		if _, err := db.conn.Exec(ctx, `
			SELECT create_hypertable(
				'ais_raw',
				'time',
				chunk_time_interval => INTERVAL '1 hour',
				if_not_exists => TRUE
			)
		`); err != nil {
			log.Printf("Warning: failed to create hypertable for ais_raw: %v", err)
		}
	}

	if _, err := db.conn.Exec(ctx, `
		CREATE INDEX IF NOT EXISTS idx_ais_raw_mmsi_time ON ais_raw(mmsi, time DESC)
	`); err != nil {
		return err
	}

	if _, err := db.conn.Exec(ctx, `
		CREATE INDEX IF NOT EXISTS idx_ais_raw_time ON ais_raw(time DESC)
	`); err != nil {
		return err
	}

	return nil
}

func (db *Database) initCompressedTable(ctx context.Context) error {
	createTable := `
		CREATE TABLE IF NOT EXISTS ais_compressed (
			mmsi TEXT NOT NULL,
			lon DOUBLE PRECISION NOT NULL,
			lat DOUBLE PRECISION NOT NULL,
			speed DOUBLE PRECISION NOT NULL,
			time TIMESTAMPTZ NOT NULL,
			is_compressed BOOLEAN NOT NULL DEFAULT TRUE
		)
	`
	if _, err := db.conn.Exec(ctx, createTable); err != nil {
		return err
	}

	isHypertable := false
	db.conn.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1 FROM _timescaledb_catalog.hypertable 
			WHERE table_name = 'ais_compressed'
		)
	`).Scan(&isHypertable)

	if !isHypertable {
		if _, err := db.conn.Exec(ctx, `
			SELECT create_hypertable(
				'ais_compressed',
				'time',
				chunk_time_interval => INTERVAL '6 hours',
				if_not_exists => TRUE
			)
		`); err != nil {
			log.Printf("Warning: failed to create hypertable for ais_compressed: %v", err)
		}
	}

	if _, err := db.conn.Exec(ctx, `
		CREATE INDEX IF NOT EXISTS idx_ais_compressed_mmsi_time ON ais_compressed(mmsi, time DESC)
	`); err != nil {
		return err
	}

	if _, err := db.conn.Exec(ctx, `
		CREATE INDEX IF NOT EXISTS idx_ais_compressed_time ON ais_compressed(time DESC)
	`); err != nil {
		return err
	}

	return nil
}

func (db *Database) initStatsTable(ctx context.Context) error {
	createTable := `
		CREATE TABLE IF NOT EXISTS compression_stats (
			mmsi TEXT NOT NULL,
			total_original INTEGER NOT NULL,
			total_compressed INTEGER NOT NULL,
			compression_rate DOUBLE PRECISION NOT NULL,
			average_deviation DOUBLE PRECISION NOT NULL,
			time TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)
	`
	if _, err := db.conn.Exec(ctx, createTable); err != nil {
		return err
	}

	isHypertable := false
	db.conn.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1 FROM _timescaledb_catalog.hypertable 
			WHERE table_name = 'compression_stats'
		)
	`).Scan(&isHypertable)

	if !isHypertable {
		if _, err := db.conn.Exec(ctx, `
			SELECT create_hypertable(
				'compression_stats',
				'time',
				chunk_time_interval => INTERVAL '1 day',
				if_not_exists => TRUE
			)
		`); err != nil {
			log.Printf("Warning: failed to create hypertable for compression_stats: %v", err)
		}
	}

	if _, err := db.conn.Exec(ctx, `
		CREATE INDEX IF NOT EXISTS idx_compression_stats_time ON compression_stats(time DESC)
	`); err != nil {
		return err
	}

	if _, err := db.conn.Exec(ctx, `
		CREATE INDEX IF NOT EXISTS idx_compression_stats_mmsi_time ON compression_stats(mmsi, time DESC)
	`); err != nil {
		return err
	}

	return nil
}

func (db *Database) SaveRawPoint(ctx context.Context, point *models.AISPoint) error {
	query := `INSERT INTO ais_raw (mmsi, lon, lat, speed, time) VALUES ($1, $2, $3, $4, $5)`
	_, err := db.conn.Exec(ctx, query, point.MMSI, point.Lon, point.Lat, point.Speed, point.Time)
	return err
}

func (db *Database) SaveCompressedPoint(ctx context.Context, point *models.CompressedPoint) error {
	query := `INSERT INTO ais_compressed (mmsi, lon, lat, speed, time, is_compressed) VALUES ($1, $2, $3, $4, $5, $6)`
	_, err := db.conn.Exec(ctx, query, point.MMSI, point.Lon, point.Lat, point.Speed, point.Time, point.IsCompressed)
	return err
}

func (db *Database) SaveCompressedPoints(ctx context.Context, points []models.CompressedPoint) error {
	if len(points) == 0 {
		return nil
	}

	tx, err := db.conn.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	stmt, err := tx.Prepare(ctx, "bulk_insert", `INSERT INTO ais_compressed (mmsi, lon, lat, speed, time, is_compressed) VALUES ($1, $2, $3, $4, $5, $6)`)
	if err != nil {
		return err
	}

	for _, point := range points {
		if _, err := tx.Exec(ctx, stmt.Name, point.MMSI, point.Lon, point.Lat, point.Speed, point.Time, point.IsCompressed); err != nil {
			return err
		}
	}

	return tx.Commit(ctx)
}

func (db *Database) GetRecentPoints(ctx context.Context, mmsi string, limit int) ([]models.AISPoint, error) {
	query := `SELECT mmsi, lon, lat, speed, time FROM ais_raw WHERE mmsi = $1 ORDER BY time DESC LIMIT $2`

	rows, err := db.conn.Query(ctx, query, mmsi, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var points []models.AISPoint
	for rows.Next() {
		var point models.AISPoint
		if err := rows.Scan(&point.MMSI, &point.Lon, &point.Lat, &point.Speed, &point.Time); err != nil {
			return nil, err
		}
		points = append(points, point)
	}

	for i, j := 0, len(points)-1; i < j; i, j = i+1, j-1 {
		points[i], points[j] = points[j], points[i]
	}

	return points, rows.Err()
}

func (db *Database) GetCompressedTrajectory(ctx context.Context, mmsi string) ([]models.CompressedPoint, error) {
	query := `SELECT mmsi, lon, lat, speed, time, is_compressed FROM ais_compressed WHERE mmsi = $1 ORDER BY time DESC LIMIT 100`

	rows, err := db.conn.Query(ctx, query, mmsi)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var points []models.CompressedPoint
	for rows.Next() {
		var point models.CompressedPoint
		if err := rows.Scan(&point.MMSI, &point.Lon, &point.Lat, &point.Speed, &point.Time, &point.IsCompressed); err != nil {
			return nil, err
		}
		points = append(points, point)
	}

	for i, j := 0, len(points)-1; i < j; i, j = i+1, j-1 {
		points[i], points[j] = points[j], points[i]
	}

	return points, rows.Err()
}

func (db *Database) SaveStats(ctx context.Context, mmsi string, originalCount, compressedCount int, rate, deviation float64) error {
	query := `INSERT INTO compression_stats (mmsi, total_original, total_compressed, compression_rate, average_deviation) VALUES ($1, $2, $3, $4, $5)`
	_, err := db.conn.Exec(ctx, query, mmsi, originalCount, compressedCount, rate, deviation)
	return err
}

func (db *Database) GetGlobalStats(ctx context.Context) (*models.Stats, error) {
	query := `
		SELECT 
			(SELECT COUNT(DISTINCT mmsi) FROM ais_raw) as vessels_count,
			(SELECT COUNT(*) FROM ais_raw) as total_original,
			(SELECT COUNT(*) FROM ais_compressed) as total_compressed
	`

	stats := &models.Stats{Timestamp: time.Now()}
	var totalOriginal, totalCompressed int64

	err := db.conn.QueryRow(ctx, query).Scan(&stats.VesselsCount, &totalOriginal, &totalCompressed)
	if err != nil {
		return stats, nil
	}

	stats.TotalOriginalPoints = totalOriginal
	stats.TotalCompressedPoints = totalCompressed

	if totalOriginal > 0 {
		stats.CompressionRate = float64(totalCompressed) / float64(totalOriginal)
	}

	avgQuery := `SELECT COALESCE(AVG(average_deviation), 0) FROM compression_stats WHERE time > NOW() - INTERVAL '5 minutes'`
	db.conn.QueryRow(ctx, avgQuery).Scan(&stats.AverageDeviation)

	return stats, nil
}

func (db *Database) GetAllVesselPositions(ctx context.Context) ([]models.VesselPosition, error) {
	query := `
		SELECT DISTINCT ON (mmsi) mmsi, lon, lat, speed, time 
		FROM ais_raw 
		ORDER BY mmsi, time DESC
	`

	rows, err := db.conn.Query(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var positions []models.VesselPosition
	for rows.Next() {
		var pos models.VesselPosition
		if err := rows.Scan(&pos.MMSI, &pos.Lon, &pos.Lat, &pos.Speed, &pos.Time); err != nil {
			return nil, err
		}
		positions = append(positions, pos)
	}

	return positions, rows.Err()
}

func (db *Database) Close(ctx context.Context) error {
	return db.conn.Close(ctx)
}
