package models

type LintResult struct {
	Valid    bool        `json:"valid"`
	Errors   []LintError `json:"errors"`
	Language string      `json:"language"`
}

type LintError struct {
	Line     int    `json:"line"`
	Column   int    `json:"column"`
	Message  string `json:"message"`
	Severity string `json:"severity"`
}
