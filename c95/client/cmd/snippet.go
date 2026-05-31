package cmd

import (
	"bufio"
	"fmt"
	"os"
	"snippet-cli/internal/models"
	"snippet-cli/internal/storage"
	"snippet-cli/internal/ui"
	"strings"

	"github.com/spf13/cobra"
)

var createCmd = &cobra.Command{
	Use:   "create",
	Short: "Create a new code snippet",
	Run: func(cmd *cobra.Command, args []string) {
		title, _ := cmd.Flags().GetString("title")
		language, _ := cmd.Flags().GetString("language")
		tags, _ := cmd.Flags().GetStringSlice("tag")
		description, _ := cmd.Flags().GetString("description")
		codeFile, _ := cmd.Flags().GetString("file")

		var code string
		if codeFile != "" {
			content, err := os.ReadFile(codeFile)
			if err != nil {
				ui.PrintError("Failed to read code file", err)
				return
			}
			code = string(content)
		} else {
			ui.PrintInfo("Enter code (press Ctrl+D on Unix or Ctrl+Z on Windows when done):")
			scanner := bufio.NewScanner(os.Stdin)
			var lines []string
			for scanner.Scan() {
				lines = append(lines, scanner.Text())
			}
			code = strings.Join(lines, "\n")
		}

		if code == "" {
			ui.PrintError("Code cannot be empty", nil)
			return
		}

		snippet := &models.Snippet{
			Title:       title,
			Language:    language,
			Code:        code,
			Description: description,
			Tags:        tags,
		}

		err := storage.CreateSnippet(snippet)
		if err != nil {
			ui.PrintError("Failed to create snippet", err)
			return
		}

		ui.PrintSuccess(fmt.Sprintf("Snippet #%d created successfully!", snippet.ID))
	},
}

var listCmd = &cobra.Command{
	Use:   "list",
	Short: "List all code snippets",
	Run: func(cmd *cobra.Command, args []string) {
		language, _ := cmd.Flags().GetString("language")
		tag, _ := cmd.Flags().GetString("tag")
		search, _ := cmd.Flags().GetString("search")
		useRegex, _ := cmd.Flags().GetBool("regex")
		fuzzy, _ := cmd.Flags().GetBool("fuzzy")

		actualSearch := search
		if fuzzy && search != "" {
			actualSearch = strings.Join(strings.Split(search, ""), ".*")
			useRegex = true
		}

		snippets, err := storage.ListSnippets(language, tag, actualSearch, useRegex)
		if err != nil {
			ui.PrintError("Failed to list snippets", err)
			return
		}

		ui.PrintSnippetList(snippets)
	},
}

var viewCmd = &cobra.Command{
	Use:   "view [id]",
	Short: "View a code snippet",
	Args:  cobra.ExactArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		id := 0
		fmt.Sscanf(args[0], "%d", &id)

		snippet, err := storage.GetSnippet(id)
		if err != nil {
			ui.PrintError("Failed to get snippet", err)
			return
		}

		noHighlight, _ := cmd.Flags().GetBool("no-highlight")
		ui.PrintSnippetDetail(snippet, !noHighlight)
	},
}

var updateCmd = &cobra.Command{
	Use:   "update [id]",
	Short: "Update a code snippet",
	Args:  cobra.ExactArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		id := 0
		fmt.Sscanf(args[0], "%d", &id)

		snippet, err := storage.GetSnippet(id)
		if err != nil {
			ui.PrintError("Failed to get snippet", err)
			return
		}

		if title, _ := cmd.Flags().GetString("title"); title != "" {
			snippet.Title = title
		}
		if language, _ := cmd.Flags().GetString("language"); language != "" {
			snippet.Language = language
		}
		if tags, _ := cmd.Flags().GetStringSlice("tag"); len(tags) > 0 {
			snippet.Tags = tags
		}
		if description, _ := cmd.Flags().GetString("description"); description != "" {
			snippet.Description = description
		}
		if codeFile, _ := cmd.Flags().GetString("file"); codeFile != "" {
			content, err := os.ReadFile(codeFile)
			if err != nil {
				ui.PrintError("Failed to read code file", err)
				return
			}
			snippet.Code = string(content)
		}

		err = storage.UpdateSnippet(snippet)
		if err != nil {
			ui.PrintError("Failed to update snippet", err)
			return
		}

		ui.PrintSuccess(fmt.Sprintf("Snippet #%d updated successfully!", snippet.ID))
	},
}

var deleteCmd = &cobra.Command{
	Use:   "delete [id]",
	Short: "Delete a code snippet",
	Args:  cobra.ExactArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		id := 0
		fmt.Sscanf(args[0], "%d", &id)

		if !ui.ConfirmAction("Are you sure you want to delete this snippet?") {
			return
		}

		err := storage.DeleteSnippet(id)
		if err != nil {
			ui.PrintError("Failed to delete snippet", err)
			return
		}

		ui.PrintSuccess("Snippet deleted successfully!")
	},
}

func init() {
	rootCmd.AddCommand(createCmd)
	rootCmd.AddCommand(listCmd)
	rootCmd.AddCommand(viewCmd)
	rootCmd.AddCommand(updateCmd)
	rootCmd.AddCommand(deleteCmd)

	createCmd.Flags().StringP("title", "t", "", "Snippet title")
	createCmd.Flags().StringP("language", "l", "text", "Programming language")
	createCmd.Flags().StringSliceP("tag", "", []string{}, "Tags for organization")
	createCmd.Flags().StringP("description", "d", "", "Description (Markdown supported)")
	createCmd.Flags().StringP("file", "f", "", "Read code from file")
	createCmd.MarkFlagRequired("title")

	listCmd.Flags().StringP("language", "l", "", "Filter by language")
	listCmd.Flags().StringP("tag", "t", "", "Filter by tag")
	listCmd.Flags().StringP("search", "s", "", "Search in title, code, or description")
	listCmd.Flags().BoolP("regex", "r", false, "Use regex pattern for search")
	listCmd.Flags().BoolP("fuzzy", "z", false, "Use fuzzy search mode")

	viewCmd.Flags().BoolP("no-highlight", "n", false, "Disable syntax highlighting")

	updateCmd.Flags().StringP("title", "t", "", "New title")
	updateCmd.Flags().StringP("language", "l", "", "New programming language")
	updateCmd.Flags().StringSliceP("tag", "", []string{}, "New tags")
	updateCmd.Flags().StringP("description", "d", "", "New description")
	updateCmd.Flags().StringP("file", "f", "", "Read new code from file")
}
