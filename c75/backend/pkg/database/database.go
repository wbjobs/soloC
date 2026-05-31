package database

import (
	"database/sql"
	"fmt"
	"time"

	_ "github.com/mattn/go-sqlite3"
)

type ConversionLog struct {
	ID         int64
	Timestamp  time.Time
	Direction  string
	Register   int
	OldValue   uint64
	NewValue   uint64
	Successful bool
}

func InitDB(dbPath string) (*sql.DB, error) {
	db, err := sql.Open("sqlite3", dbPath)
	if err != nil {
		return nil, err
	}

	if err := db.Ping(); err != nil {
		return nil, err
	}

	if err := createTables(db); err != nil {
		return nil, err
	}

	return db, nil
}

func createTables(db *sql.DB) error {
	createTableSQL := `
	CREATE TABLE IF NOT EXISTS conversion_logs (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		timestamp DATETIME NOT NULL,
		direction TEXT NOT NULL,
		register INTEGER NOT NULL,
		old_value INTEGER NOT NULL,
		new_value INTEGER NOT NULL,
		successful BOOLEAN NOT NULL
	);
	CREATE INDEX IF NOT EXISTS idx_timestamp ON conversion_logs(timestamp);
	CREATE INDEX IF NOT EXISTS idx_direction ON conversion_logs(direction);
	CREATE INDEX IF NOT EXISTS idx_register ON conversion_logs(register);
	`
	_, err := db.Exec(createTableSQL)
	return err
}

func InsertLog(db *sql.DB, log *ConversionLog) error {
	insertSQL := `
	INSERT INTO conversion_logs (timestamp, direction, register, old_value, new_value, successful)
	VALUES (?, ?, ?, ?, ?, ?)
	`
	result, err := db.Exec(
		insertSQL,
		log.Timestamp,
		log.Direction,
		log.Register,
		log.OldValue,
		log.NewValue,
		log.Successful,
	)
	if err != nil {
		return err
	}
	log.ID, err = result.LastInsertId()
	return err
}

func GetLogs(db *sql.DB, direction string, register *int, startTime, endTime time.Time, limit, offset int) ([]ConversionLog, int, error) {
	whereClause := "WHERE timestamp >= ? AND timestamp <= ?"
	args := []interface{}{startTime, endTime}

	if direction != "" {
		whereClause += " AND direction = ?"
		args = append(args, direction)
	}

	if register != nil {
		whereClause += " AND register = ?"
		args = append(args, *register)
	}

	countSQL := fmt.Sprintf("SELECT COUNT(*) FROM conversion_logs %s", whereClause)
	var total int
	if err := db.QueryRow(countSQL, args...).Scan(&total); err != nil {
		return nil, 0, err
	}

	querySQL := fmt.Sprintf(`
	SELECT id, timestamp, direction, register, old_value, new_value, successful
	FROM conversion_logs
	%s
	ORDER BY timestamp DESC
	LIMIT ? OFFSET ?
	`, whereClause)
	args = append(args, limit, offset)

	rows, err := db.Query(querySQL, args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var logs []ConversionLog
	for rows.Next() {
		var log ConversionLog
		err := rows.Scan(
			&log.ID,
			&log.Timestamp,
			&log.Direction,
			&log.Register,
			&log.OldValue,
			&log.NewValue,
			&log.Successful,
		)
		if err != nil {
			return nil, 0, err
		}
		logs = append(logs, log)
	}

	return logs, total, nil
}

func GetLogByID(db *sql.DB, id int64) (*ConversionLog, error) {
	querySQL := `
	SELECT id, timestamp, direction, register, old_value, new_value, successful
	FROM conversion_logs
	WHERE id = ?
	`
	var log ConversionLog
	err := db.QueryRow(querySQL, id).Scan(
		&log.ID,
		&log.Timestamp,
		&log.Direction,
		&log.Register,
		&log.OldValue,
		&log.NewValue,
		&log.Successful,
	)
	if err != nil {
		return nil, err
	}
	return &log, nil
}

func DeleteOldLogs(db *sql.DB, olderThan time.Time) (int64, error) {
	deleteSQL := "DELETE FROM conversion_logs WHERE timestamp < ?"
	result, err := db.Exec(deleteSQL, olderThan)
	if err != nil {
		return 0, err
	}
	return result.RowsAffected()
}
