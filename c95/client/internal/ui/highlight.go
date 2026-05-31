package ui

import (
	"bytes"
	"fmt"
	"os"
	"snippet-cli/internal/models"
	"strings"

	"github.com/alecthomas/chroma/v2/quick"
	"github.com/gomarkdown/markdown"
	"github.com/gomarkdown/markdown/html"
	"github.com/gomarkdown/markdown/parser"
)

func PrintSnippetList(snippets []models.Snippet) {
	if len(snippets) == 0 {
		fmt.Println("No snippets found.")
		return
	}
	
	fmt.Printf("Found %d snippet(s):\n\n", len(snippets))
	
	for i, s := range snippets {
		syncStatus := "✓"
		if !s.IsSynced {
			syncStatus = "✗"
		}
		tagsStr := strings.Join(s.Tags, ", ")
		if tagsStr != "" {
			tagsStr = " [" + tagsStr + "]"
		}
		fmt.Printf("%3d. [#%d] %s (%s)%s %s\n", 
			i+1, s.ID, s.Title, s.Language, tagsStr, syncStatus)
	}
}

func PrintSnippetDetail(snippet *models.Snippet, highlight bool) {
	fmt.Printf("Title:    %s\n", snippet.Title)
	fmt.Printf("ID:       %d\n", snippet.ID)
	fmt.Printf("Language: %s\n", snippet.Language)
	fmt.Printf("Tags:     %s\n", strings.Join(snippet.Tags, ", "))
	fmt.Printf("Created:  %s\n", snippet.CreatedAt)
	fmt.Printf("Updated:  %s\n", snippet.UpdatedAt)
	fmt.Printf("Synced:   %v\n", snippet.IsSynced)
	fmt.Println()
	
	if snippet.Description != "" {
		fmt.Println("Description:")
		fmt.Println(RenderMarkdown(snippet.Description))
		fmt.Println()
	}
	
	fmt.Println("Code:")
	fmt.Println(strings.Repeat("-", 60))
	if highlight {
		PrintHighlightedCode(snippet.Code, snippet.Language)
	} else {
		fmt.Println(snippet.Code)
	}
	fmt.Println(strings.Repeat("-", 60))
}

func PrintHighlightedCode(code, language string) {
	var buf bytes.Buffer
	err := quick.Highlight(&buf, code, language, "terminal16m", "monokai")
	if err != nil {
		fmt.Println(code)
		return
	}
	fmt.Println(buf.String())
}

func RenderMarkdown(text string) string {
	p := parser.NewWithExtensions(parser.CommonExtensions)
	doc := p.Parse([]byte(text))
	
	flags := html.CommonFlags | html.HrefTargetBlank
	opts := html.RendererOptions{Flags: flags}
	renderer := html.NewRenderer(opts)
	
	html := markdown.Render(doc, renderer)
	return string(html)
}

func ConfirmAction(message string) bool {
	fmt.Printf("%s [y/N]: ", message)
	var response string
	fmt.Scanln(&response)
	response = strings.ToLower(strings.TrimSpace(response))
	return response == "y" || response == "yes"
}

func PrintError(msg string, err error) {
	fmt.Fprintf(os.Stderr, "Error: %s: %v\n", msg, err)
}

func PrintSuccess(msg string) {
	fmt.Printf("✓ %s\n", msg)
}

func PrintInfo(msg string) {
	fmt.Printf("ℹ %s\n", msg)
}
