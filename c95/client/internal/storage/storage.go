package storage

import (
	"database/sql"
	"os"
	"path/filepath"
	"regexp"
	"runtime"
	"snippet-cli/internal/models"
	"strings"
	"time"

	_ "github.com/mattn/go-sqlite3"
)

var db *sql.DB

func getLongPath(path string) string {
	if runtime.GOOS == "windows" {
		if len(path) > 200 {
			absPath, err := filepath.Abs(path)
			if err == nil {
				return `\\?\` + absPath
			}
		}
	}
	return path
}

func getStorageDir() (string, error) {
	if runtime.GOOS == "windows" {
		localAppData := os.Getenv("LOCALAPPDATA")
		if localAppData != "" {
			return filepath.Join(localAppData, "SnippetCLI"), nil
		}
		programData := os.Getenv("PROGRAMDATA")
		if programData != "" {
			return filepath.Join(programData, "SnippetCLI"), nil
		}
	}
	
	homeDir, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(homeDir, ".snippet-cli"), nil
}

func InitDB() error {
	snippetDir, err := getStorageDir()
	if err != nil {
		return err
	}
	
	longDirPath := getLongPath(snippetDir)
	if err := os.MkdirAll(longDirPath, 0755); err != nil {
		return err
	}
	
	dbPath := filepath.Join(snippetDir, "snippets.db")
	longDBPath := getLongPath(dbPath)
	
	db, err = sql.Open("sqlite3", longDBPath)
	if err != nil {
		return err
	}
	
	if err := db.Ping(); err != nil {
		return err
	}
	
	createTables()
	return nil
}

func createTables() {
	sqlStmt := `
	CREATE TABLE IF NOT EXISTS snippets (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		title TEXT NOT NULL,
		language TEXT NOT NULL,
		code TEXT NOT NULL,
		description TEXT,
		tags TEXT,
		is_public INTEGER DEFAULT 0,
		created_at TEXT,
		updated_at TEXT,
		sync_version INTEGER DEFAULT 1,
		is_deleted INTEGER DEFAULT 0,
		is_synced INTEGER DEFAULT 0,
		server_id INTEGER DEFAULT 0
	);
	
	CREATE TABLE IF NOT EXISTS config (
		key TEXT PRIMARY KEY,
		value TEXT
	);
	`
	db.Exec(sqlStmt)
}

func GetDB() *sql.DB {
	return db
}

func CreateSnippet(snippet *models.Snippet) error {
	now := models.FormatTime(time.Now())
	snippet.CreatedAt = now
	snippet.UpdatedAt = now
	snippet.SyncVersion = 1
	snippet.IsSynced = false
	
	stmt, err := db.Prepare(`
		INSERT INTO snippets (title, language, code, description, tags, is_public, 
			created_at, updated_at, sync_version, is_deleted, is_synced)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`)
	if err != nil {
		return err
	}
	defer stmt.Close()
	
	res, err := stmt.Exec(
		snippet.Title, snippet.Language, snippet.Code, snippet.Description,
		snippet.TagsToString(), snippet.IsPublic, snippet.CreatedAt, snippet.UpdatedAt,
		snippet.SyncVersion, snippet.IsDeleted, snippet.IsSynced,
	)
	if err != nil {
		return err
	}
	
	id, err := res.LastInsertId()
	if err != nil {
		return err
	}
	snippet.ID = int(id)
	return nil
}

func GetSnippet(id int) (*models.Snippet, error) {
	var snippet models.Snippet
	var tagsStr string
	
	err := db.QueryRow(`
		SELECT id, title, language, code, description, tags, is_public,
			created_at, updated_at, sync_version, is_deleted, is_synced
		FROM snippets WHERE id = ? AND is_deleted = 0
	`, id).Scan(
		&snippet.ID, &snippet.Title, &snippet.Language, &snippet.Code,
		&snippet.Description, &tagsStr, &snippet.IsPublic, &snippet.CreatedAt,
		&snippet.UpdatedAt, &snippet.SyncVersion, &snippet.IsDeleted, &snippet.IsSynced,
	)
	if err != nil {
		return nil, err
	}
	
	snippet.Tags = models.ParseTags(tagsStr)
	return &snippet, nil
}

func UpdateSnippet(snippet *models.Snippet) error {
	snippet.UpdatedAt = models.FormatTime(time.Now())
	snippet.SyncVersion++
	snippet.IsSynced = false
	
	stmt, err := db.Prepare(`
		UPDATE snippets SET title=?, language=?, code=?, description=?, tags=?,
			is_public=?, updated_at=?, sync_version=?, is_synced=?
		WHERE id=?
	`)
	if err != nil {
		return err
	}
	defer stmt.Close()
	
	_, err = stmt.Exec(
		snippet.Title, snippet.Language, snippet.Code, snippet.Description,
		snippet.TagsToString(), snippet.IsPublic, snippet.UpdatedAt,
		snippet.SyncVersion, snippet.IsSynced, snippet.ID,
	)
	return err
}

func DeleteSnippet(id int) error {
	stmt, err := db.Prepare(`
		UPDATE snippets SET is_deleted=1, is_synced=0, sync_version=sync_version+1
		WHERE id=?
	`)
	if err != nil {
		return err
	}
	defer stmt.Close()
	
	_, err = stmt.Exec(id)
	return err
}

func escapeLikePattern(pattern string) string {
	pattern = strings.ReplaceAll(pattern, "\\", "\\\\")
	pattern = strings.ReplaceAll(pattern, "%", "\\%")
	pattern = strings.ReplaceAll(pattern, "_", "\\_")
	return pattern
}

func ListSnippets(language, tag, search string, useRegex bool) ([]models.Snippet, error) {
	query := `
		SELECT id, title, language, code, description, tags, is_public,
			created_at, updated_at, sync_version, is_deleted, is_synced
		FROM snippets WHERE is_deleted=0
	`
	args := []interface{}{}
	
	if language != "" {
		query += " AND language = ?"
		args = append(args, language)
	}
	if tag != "" {
		escapedTag := escapeLikePattern(tag)
		query += " AND tags LIKE ? ESCAPE '\\'"
		args = append(args, "%"+escapedTag+"%")
	}
	if search != "" && !useRegex {
		escapedSearch := escapeLikePattern(search)
		query += " AND (title LIKE ? ESCAPE '\\' OR code LIKE ? ESCAPE '\\' OR description LIKE ? ESCAPE '\\')"
		args = append(args, "%"+escapedSearch+"%", "%"+escapedSearch+"%", "%"+escapedSearch+"%")
	}
	query += " ORDER BY updated_at DESC"
	
	rows, err := db.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	
	var snippets []models.Snippet
	var regex *regexp.Regexp
	
	if useRegex && search != "" {
		regex, err = regexp.Compile(search)
		if err != nil {
			return nil, err
		}
	}
	
	for rows.Next() {
		var s models.Snippet
		var tagsStr string
		err := rows.Scan(
			&s.ID, &s.Title, &s.Language, &s.Code, &s.Description, &tagsStr,
			&s.IsPublic, &s.CreatedAt, &s.UpdatedAt, &s.SyncVersion,
			&s.IsDeleted, &s.IsSynced,
		)
		if err != nil {
			return nil, err
		}
		s.Tags = models.ParseTags(tagsStr)
		
		if useRegex && regex != nil {
			if regex.MatchString(s.Title) || regex.MatchString(s.Code) || regex.MatchString(s.Description) {
				snippets = append(snippets, s)
			}
		} else {
			snippets = append(snippets, s)
		}
	}
	return snippets, nil
}

func GetUnsyncedSnippets() ([]models.Snippet, error) {
	rows, err := db.Query(`
		SELECT id, title, language, code, description, tags, is_public,
			created_at, updated_at, sync_version, is_deleted, is_synced
		FROM snippets WHERE is_synced=0
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	
	var snippets []models.Snippet
	for rows.Next() {
		var s models.Snippet
		var tagsStr string
		err := rows.Scan(
			&s.ID, &s.Title, &s.Language, &s.Code, &s.Description, &tagsStr,
			&s.IsPublic, &s.CreatedAt, &s.UpdatedAt, &s.SyncVersion,
			&s.IsDeleted, &s.IsSynced,
		)
		if err != nil {
			return nil, err
		}
		s.Tags = models.ParseTags(tagsStr)
		snippets = append(snippets, s)
	}
	return snippets, nil
}

func MarkAsSynced(id int) error {
	_, err := db.Exec("UPDATE snippets SET is_synced=1 WHERE id=?", id)
	return err
}

func UpsertServerSnippet(snippet *models.Snippet) error {
	var existingID int
	err := db.QueryRow("SELECT id FROM snippets WHERE server_id=?", snippet.ID).Scan(&existingID)
	
	if err == sql.ErrNoRows {
		stmt, err := db.Prepare(`
			INSERT INTO snippets (title, language, code, description, tags, is_public,
				created_at, updated_at, sync_version, is_deleted, is_synced, server_id)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
		`)
		if err != nil {
			return err
		}
		defer stmt.Close()
		
		_, err = stmt.Exec(
			snippet.Title, snippet.Language, snippet.Code, snippet.Description,
			snippet.TagsToString(), snippet.IsPublic, snippet.CreatedAt, snippet.UpdatedAt,
			snippet.SyncVersion, snippet.IsDeleted, snippet.ID,
		)
		return err
	}
	
	if err != nil {
		return err
	}
	
	stmt, err := db.Prepare(`
		UPDATE snippets SET title=?, language=?, code=?, description=?, tags=?,
			is_public=?, created_at=?, updated_at=?, sync_version=?, is_deleted=?, is_synced=1
		WHERE server_id=?
	`)
	if err != nil {
		return err
	}
	defer stmt.Close()
	
	_, err = stmt.Exec(
		snippet.Title, snippet.Language, snippet.Code, snippet.Description,
		snippet.TagsToString(), snippet.IsPublic, snippet.CreatedAt, snippet.UpdatedAt,
		snippet.SyncVersion, snippet.IsDeleted, snippet.ID,
	)
	return err
}

func SaveConfig(key, value string) error {
	stmt, err := db.Prepare(`
		INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)
	`)
	if err != nil {
		return err
	}
	defer stmt.Close()
	
	_, err = stmt.Exec(key, value)
	return err
}

func GetConfig(key string) (string, error) {
	var value string
	err := db.QueryRow("SELECT value FROM config WHERE key=?", key).Scan(&value)
	if err == sql.ErrNoRows {
		return "", nil
	}
	return value, err
}

func GetAllSnippets() ([]models.Snippet, error) {
	rows, err := db.Query(`
		SELECT id, title, language, code, description, tags, is_public,
			created_at, updated_at, sync_version, is_deleted, is_synced
		FROM snippets WHERE is_deleted=0
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	
	var snippets []models.Snippet
	for rows.Next() {
		var s models.Snippet
		var tagsStr string
		err := rows.Scan(
			&s.ID, &s.Title, &s.Language, &s.Code, &s.Description, &tagsStr,
			&s.IsPublic, &s.CreatedAt, &s.UpdatedAt, &s.SyncVersion,
			&s.IsDeleted, &s.IsSynced,
		)
		if err != nil {
			return nil, err
		}
		s.Tags = models.ParseTags(tagsStr)
		snippets = append(snippets, s)
	}
	return snippets, nil
}
