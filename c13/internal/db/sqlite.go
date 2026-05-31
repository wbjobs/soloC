package db

import (
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"

	_ "github.com/mattn/go-sqlite3"
)

type SyscallEvent struct {
	ID          int64
	PID         uint32
	TID         uint32
	SyscallNr   int32
	SyscallName string
	DurationNS  uint64
	Timestamp   uint64
	Ret         int64
	Args        [6]uint64
	CreatedAt   time.Time
}

type Database struct {
	db   *sql.DB
	path string
	mu   sync.Mutex
}

func NewDatabase(dbPath string) (*Database, error) {
	if err := os.MkdirAll(filepath.Dir(dbPath), 0755); err != nil {
		return nil, fmt.Errorf("failed to create directory: %w", err)
	}

	db, err := sql.Open("sqlite3", dbPath)
	if err != nil {
		return nil, fmt.Errorf("failed to open database: %w", err)
	}

	if err := db.Ping(); err != nil {
		db.Close()
		return nil, fmt.Errorf("failed to ping database: %w", err)
	}

	database := &Database{db: db, path: dbPath}
	if err := database.initSchema(); err != nil {
		db.Close()
		return nil, err
	}

	return database, nil
}

func (d *Database) initSchema() error {
	schema := `
	CREATE TABLE IF NOT EXISTS syscalls (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		pid INTEGER NOT NULL,
		tid INTEGER NOT NULL,
		syscall_nr INTEGER NOT NULL,
		syscall_name TEXT,
		duration_ns INTEGER NOT NULL,
		timestamp INTEGER NOT NULL,
		ret INTEGER,
		arg0 INTEGER DEFAULT 0,
		arg1 INTEGER DEFAULT 0,
		arg2 INTEGER DEFAULT 0,
		arg3 INTEGER DEFAULT 0,
		arg4 INTEGER DEFAULT 0,
		arg5 INTEGER DEFAULT 0,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);
	CREATE INDEX IF NOT EXISTS idx_syscalls_pid ON syscalls(pid);
	CREATE INDEX IF NOT EXISTS idx_syscalls_timestamp ON syscalls(timestamp);
	CREATE INDEX IF NOT EXISTS idx_syscalls_syscall_nr ON syscalls(syscall_nr);
	`

	_, err := d.db.Exec(schema)
	if err != nil {
		return err
	}

	columns := []string{"arg0", "arg1", "arg2", "arg3", "arg4", "arg5"}
	for _, col := range columns {
		_, _ = d.db.Exec(fmt.Sprintf("ALTER TABLE syscalls ADD COLUMN %s INTEGER DEFAULT 0", col))
	}

	return nil
}

func (d *Database) Close() error {
	return d.db.Close()
}

func (d *Database) InsertEvent(event *SyscallEvent) error {
	d.mu.Lock()
	defer d.mu.Unlock()

	query := `
	INSERT INTO syscalls (pid, tid, syscall_nr, syscall_name, duration_ns, timestamp, ret, arg0, arg1, arg2, arg3, arg4, arg5)
	VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`

	_, err := d.db.Exec(query,
		event.PID,
		event.TID,
		event.SyscallNr,
		event.SyscallName,
		event.DurationNS,
		event.Timestamp,
		event.Ret,
		event.Args[0],
		event.Args[1],
		event.Args[2],
		event.Args[3],
		event.Args[4],
		event.Args[5],
	)
	return err
}

func (d *Database) InsertEvents(events []*SyscallEvent) error {
	d.mu.Lock()
	defer d.mu.Unlock()

	tx, err := d.db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	query := `
	INSERT INTO syscalls (pid, tid, syscall_nr, syscall_name, duration_ns, timestamp, ret, arg0, arg1, arg2, arg3, arg4, arg5)
	VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`

	stmt, err := tx.Prepare(query)
	if err != nil {
		return err
	}
	defer stmt.Close()

	for _, event := range events {
		_, err := stmt.Exec(
			event.PID,
			event.TID,
			event.SyscallNr,
			event.SyscallName,
			event.DurationNS,
			event.Timestamp,
			event.Ret,
			event.Args[0],
			event.Args[1],
			event.Args[2],
			event.Args[3],
			event.Args[4],
			event.Args[5],
		)
		if err != nil {
			return err
		}
	}

	return tx.Commit()
}

type SyscallStats struct {
	SyscallNr   int32
	SyscallName string
	Count       int64
	TotalTime   uint64
	AvgTime     uint64
}

func (d *Database) GetStatsByPID(pid uint32) ([]*SyscallStats, error) {
	d.mu.Lock()
	defer d.mu.Unlock()

	query := `
	SELECT syscall_nr, syscall_name, COUNT(*) as count, SUM(duration_ns) as total_time
	FROM syscalls
	WHERE pid = ?
	GROUP BY syscall_nr, syscall_name
	ORDER BY total_time DESC
	`

	rows, err := d.db.Query(query, pid)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var stats []*SyscallStats
	for rows.Next() {
		s := &SyscallStats{}
		if err := rows.Scan(&s.SyscallNr, &s.SyscallName, &s.Count, &s.TotalTime); err != nil {
			return nil, err
		}
		if s.Count > 0 {
			s.AvgTime = s.TotalTime / uint64(s.Count)
		}
		stats = append(stats, s)
	}

	return stats, rows.Err()
}

func (d *Database) GetAllStats() ([]*SyscallStats, error) {
	d.mu.Lock()
	defer d.mu.Unlock()

	query := `
	SELECT syscall_nr, syscall_name, COUNT(*) as count, SUM(duration_ns) as total_time
	FROM syscalls
	GROUP BY syscall_nr, syscall_name
	ORDER BY total_time DESC
	`

	rows, err := d.db.Query(query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var stats []*SyscallStats
	for rows.Next() {
		s := &SyscallStats{}
		if err := rows.Scan(&s.SyscallNr, &s.SyscallName, &s.Count, &s.TotalTime); err != nil {
			return nil, err
		}
		if s.Count > 0 {
			s.AvgTime = s.TotalTime / uint64(s.Count)
		}
		stats = append(stats, s)
	}

	return stats, rows.Err()
}

func (d *Database) GetEventsByPID(pid uint32, limit int) ([]*SyscallEvent, error) {
	d.mu.Lock()
	defer d.mu.Unlock()

	query := `
	SELECT id, pid, tid, syscall_nr, syscall_name, duration_ns, timestamp, ret, arg0, arg1, arg2, arg3, arg4, arg5, created_at
	FROM syscalls
	WHERE pid = ?
	ORDER BY timestamp DESC
	LIMIT ?
	`

	rows, err := d.db.Query(query, pid, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var events []*SyscallEvent
	for rows.Next() {
		e := &SyscallEvent{}
		if err := rows.Scan(&e.ID, &e.PID, &e.TID, &e.SyscallNr, &e.SyscallName,
			&e.DurationNS, &e.Timestamp, &e.Ret,
			&e.Args[0], &e.Args[1], &e.Args[2], &e.Args[3], &e.Args[4], &e.Args[5],
			&e.CreatedAt); err != nil {
			return nil, err
		}
		events = append(events, e)
	}

	return events, rows.Err()
}

func (d *Database) GetAllEvents(limit int) ([]*SyscallEvent, error) {
	d.mu.Lock()
	defer d.mu.Unlock()

	query := `
	SELECT id, pid, tid, syscall_nr, syscall_name, duration_ns, timestamp, ret, arg0, arg1, arg2, arg3, arg4, arg5, created_at
	FROM syscalls
	ORDER BY timestamp DESC
	LIMIT ?
	`

	rows, err := d.db.Query(query, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var events []*SyscallEvent
	for rows.Next() {
		e := &SyscallEvent{}
		if err := rows.Scan(&e.ID, &e.PID, &e.TID, &e.SyscallNr, &e.SyscallName,
			&e.DurationNS, &e.Timestamp, &e.Ret,
			&e.Args[0], &e.Args[1], &e.Args[2], &e.Args[3], &e.Args[4], &e.Args[5],
			&e.CreatedAt); err != nil {
			return nil, err
		}
		events = append(events, e)
	}

	return events, rows.Err()
}

func (d *Database) GetTotalEventCount() (int64, error) {
	d.mu.Lock()
	defer d.mu.Unlock()

	var count int64
	err := d.db.QueryRow("SELECT COUNT(*) FROM syscalls").Scan(&count)
	return count, err
}

func (d *Database) GetAllEventsForExport() (*sql.Rows, error) {
	d.mu.Lock()
	defer d.mu.Unlock()

	query := `
	SELECT id, pid, tid, syscall_nr, syscall_name, duration_ns, timestamp, ret, arg0, arg1, arg2, arg3, arg4, arg5, created_at
	FROM syscalls
	ORDER BY timestamp ASC
	`

	return d.db.Query(query)
}
