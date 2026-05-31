package main

import (
	"bytes"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/fatih/color"
)

type RefactoringSuggestion struct {
	SuggestionType string `json:"suggestion_type"`
	StartLine      int    `json:"start_line"`
	EndLine        int    `json:"end_line"`
	Description    string `json:"description"`
	SuggestedCode  string `json:"suggested_code"`
}

type SmellLocation struct {
	StartLine             int                      `json:"start_line"`
	EndLine               int                      `json:"end_line"`
	Description           string                   `json:"description"`
	RefactoringSuggestions []RefactoringSuggestion `json:"refactoring_suggestions"`
}

type SmellResult struct {
	SmellType  string          `json:"smell_type"`
	Detected   bool            `json:"detected"`
	Locations  []SmellLocation `json:"locations"`
	Confidence float64         `json:"confidence"`
}

type CodeResponse struct {
	HasSmell   bool          `json:"has_smell"`
	Smells     []SmellResult `json:"smells"`
	TotalLines int           `json:"total_lines"`
}

type CodeRequest struct {
	Code     string `json:"code"`
	Language string `json:"language"`
}

type FileResult struct {
	FilePath string       `json:"file_path"`
	Result   CodeResponse `json:"result"`
}

var (
	apiURL    string
	outputJSON bool
)

func main() {
	flag.StringVar(&apiURL, "api", "http://localhost:8000/analyze", "Model service API URL")
	flag.BoolVar(&outputJSON, "json", false, "Output in JSON format")
	flag.Parse()

	if flag.NArg() < 1 {
		fmt.Println("Usage: codesmell-cli [options] <directory>")
		flag.PrintDefaults()
		os.Exit(1)
	}

	dir := flag.Arg(0)
	
	results, err := scanDirectory(dir)
	if err != nil {
		fmt.Printf("Error scanning directory: %v\n", err)
		os.Exit(1)
	}

	if outputJSON {
		printJSONResults(results)
	} else {
		printColoredResults(results)
	}
}

func scanDirectory(dir string) ([]FileResult, error) {
	var results []FileResult

	err := filepath.Walk(dir, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}

		if info.IsDir() {
			return nil
		}

		ext := strings.ToLower(filepath.Ext(path))
		language := getLanguageFromExt(ext)
		if language == "" {
			return nil
		}

		content, err := os.ReadFile(path)
		if err != nil {
			fmt.Printf("Warning: cannot read file %s: %v\n", path, err)
			return nil
		}

		result, err := analyzeCode(string(content), language)
		if err != nil {
			fmt.Printf("Warning: cannot analyze file %s: %v\n", path, err)
			return nil
		}

		results = append(results, FileResult{
			FilePath: path,
			Result:   result,
		})

		return nil
	})

	return results, err
}

func getLanguageFromExt(ext string) string {
	switch ext {
	case ".py":
		return "python"
	case ".java":
		return "java"
	case ".go":
		return "go"
	case ".js", ".jsx":
		return "javascript"
	case ".c", ".cpp", ".cxx", ".h", ".hpp":
		return "cpp"
	case ".cs":
		return "csharp"
	default:
		return ""
	}
}

func analyzeCode(code, language string) (CodeResponse, error) {
	req := CodeRequest{
		Code:     code,
		Language: language,
	}

	reqBody, err := json.Marshal(req)
	if err != nil {
		return CodeResponse{}, err
	}

	resp, err := http.Post(apiURL, "application/json", bytes.NewBuffer(reqBody))
	if err != nil {
		return CodeResponse{}, err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return CodeResponse{}, err
	}

	var result CodeResponse
	err = json.Unmarshal(body, &result)
	if err != nil {
		return CodeResponse{}, err
	}

	return result, nil
}

func printColoredResults(results []FileResult) {
	header := color.New(color.FgCyan, color.Bold)
	smellType := color.New(color.FgYellow, color.Bold)
	location := color.New(color.FgRed)
	success := color.New(color.FgGreen)
	info := color.New(color.FgWhite)
	suggestion := color.New(color.FgGreen, color.Bold)
	code := color.New(color.FgMagenta)

	totalFiles := len(results)
	filesWithSmells := 0
	totalSmells := 0

	for _, fr := range results {
		if fr.Result.HasSmell {
			filesWithSmells++
		}
		for _, s := range fr.Result.Smells {
			if s.Detected {
				totalSmells += len(s.Locations)
			}
		}
	}

	header.Println("=== Code Smell Detection Report ===")
	info.Printf("Total files scanned: %d\n", totalFiles)
	info.Printf("Files with code smells: %d\n", filesWithSmells)
	info.Printf("Total code smells detected: %d\n\n", totalSmells)

	for _, fr := range results {
		if !fr.Result.HasSmell {
			continue
		}

		header.Printf("File: %s (%d lines)\n", fr.FilePath, fr.Result.TotalLines)
		
		for _, smell := range fr.Result.Smells {
			if !smell.Detected {
				continue
			}

			smellType.Printf("  [%s] (confidence: %.2f)\n", smell.SmellType, smell.Confidence)
			for _, loc := range smell.Locations {
				location.Printf("    Lines %d-%d: %s\n", loc.StartLine, loc.EndLine, loc.Description)
				
				if len(loc.RefactoringSuggestions) > 0 {
					suggestion.Println("      🔧 Refactoring Suggestions:")
					for i, sug := range loc.RefactoringSuggestions {
						code.Printf("        %d. [%s] Lines %d-%d: %s\n", 
							i+1, sug.SuggestionType, sug.StartLine, sug.EndLine, sug.Description)
						if sug.SuggestedCode != "" {
							code.Println("           Suggested code:")
							codeLines := strings.Split(sug.SuggestedCode, "\n")
							for _, cl := range codeLines {
								if cl != "" {
									code.Printf("             %s\n", cl)
								}
							}
						}
					}
				}
			}
		}
		fmt.Println()
	}

	if filesWithSmells == 0 {
		success.Println("No code smells detected!")
	}
}

func printJSONResults(results []FileResult) {
	output, err := json.MarshalIndent(results, "", "  ")
	if err != nil {
		fmt.Printf("Error generating JSON: %v\n", err)
		os.Exit(1)
	}
	fmt.Println(string(output))
}
