package cmd

import (
	"fmt"
	"os"
	"snippet-cli/internal/api"
	"snippet-cli/internal/storage"
	"snippet-cli/internal/ui"

	"github.com/spf13/cobra"
)

var lintCmd = &cobra.Command{
	Use:   "lint [id]",
	Short: "Check syntax of a code snippet",
	Args:  cobra.MaximumNArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		var code, language string

		if len(args) == 1 {
			id := 0
			fmt.Sscanf(args[0], "%d", &id)
			snippet, err := storage.GetSnippet(id)
			if err != nil {
				ui.PrintError("Failed to get snippet", err)
				return
			}
			code = snippet.Code
			language = snippet.Language
			ui.PrintInfo(fmt.Sprintf("Checking syntax for snippet #%d (%s)", id, language))
		} else {
			language, _ = cmd.Flags().GetString("language")
			codeFile, _ := cmd.Flags().GetString("file")

			if codeFile != "" {
				content, err := os.ReadFile(codeFile)
				if err != nil {
					ui.PrintError("Failed to read code file", err)
					return
				}
				code = string(content)
			} else {
				ui.PrintError("Please provide either a snippet ID or a code file", nil)
				return
			}
		}

		if code == "" {
			ui.PrintError("No code to check", nil)
			return
		}

		result, err := api.Client.LintCode(language, code)
		if err != nil {
			ui.PrintError("Syntax check failed", err)
			return
		}

		if result.Valid {
			ui.PrintSuccess(fmt.Sprintf("No syntax errors found in %s code!", language))
		} else {
			ui.PrintInfo(fmt.Sprintf("Found %d error(s) in %s code:", len(result.Errors), language))
			for _, err := range result.Errors {
				position := ""
				if err.Line > 0 {
					position = fmt.Sprintf("line %d", err.Line)
					if err.Column > 0 {
						position += fmt.Sprintf(", col %d", err.Column)
					}
				}
				fmt.Printf("  [%s] %s: %s\n", err.Severity, position, err.Message)
			}
		}
	},
}

func init() {
	rootCmd.AddCommand(lintCmd)
	lintCmd.Flags().StringP("language", "l", "python", "Programming language (python/go/java)")
	lintCmd.Flags().StringP("file", "f", "", "Read code from file")
}
