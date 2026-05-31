package highlight

import (
	"fmt"
	"strings"

	"logalyzer/types"
)

const (
	ColorReset  = "\033[0m"
	ColorRed    = "\033[31m"
	ColorGreen  = "\033[32m"
	ColorYellow = "\033[33m"
	ColorBlue   = "\033[34m"
	ColorPurple = "\033[35m"
	ColorCyan   = "\033[36m"
	ColorGray   = "\033[37m"
	ColorWhite  = "\033[97m"
	ColorBold   = "\033[1m"
	ColorBgRed  = "\033[41m"
)

type Highlighter struct {
	enabled bool
}

func NewHighlighter(enabled bool) *Highlighter {
	return &Highlighter{
		enabled: enabled,
	}
}

func (h *Highlighter) Format(entry *types.LogEntry) string {
	if !h.enabled {
		return entry.RawMessage
	}

	return h.highlightByLevel(entry)
}

func (h *Highlighter) highlightByLevel(entry *types.LogEntry) string {
	var colorPrefix string
	var colorSuffix = ColorReset

	switch entry.Level {
	case types.LogLevelFatal:
		colorPrefix = ColorBold + ColorBgRed + ColorWhite
	case types.LogLevelError:
		colorPrefix = ColorBold + ColorRed
	case types.LogLevelWarn:
		colorPrefix = ColorBold + ColorYellow
	case types.LogLevelInfo:
		colorPrefix = ColorGreen
	case types.LogLevelDebug:
		colorPrefix = ColorGray
	default:
		return entry.RawMessage
	}

	return colorPrefix + entry.RawMessage + colorSuffix
}

func (h *Highlighter) HighlightPattern(text, pattern string) string {
	if !h.enabled || pattern == "" {
		return text
	}

	highlighted := ColorBold + ColorCyan
	return strings.Replace(text, pattern, highlighted+pattern+ColorReset, -1)
}

func (h *Highlighter) Print(entry *types.LogEntry) {
	fmt.Print(h.Format(entry))
}
