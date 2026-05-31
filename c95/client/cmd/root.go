package cmd

import (
	"fmt"
	"os"
	"snippet-cli/internal/api"

	"github.com/spf13/cobra"
)

var rootCmd = &cobra.Command{
	Use:   "snippet",
	Short: "A multi-language code snippet management tool",
	Long: `snippet is a CLI tool for managing code snippets with:
- Local SQLite storage
- Server sync support
- Syntax highlighting
- Markdown descriptions
- Tag-based organization
- Search functionality`,
	PersistentPreRun: func(cmd *cobra.Command, args []string) {
		api.InitClient()
	},
}

func Execute() {
	if err := rootCmd.Execute(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func init() {
	rootCmd.PersistentFlags().StringP("server", "s", "http://localhost:5000", "Server URL")
}
