package cmd

import (
	"fmt"
	"snippet-cli/internal/api"
	"snippet-cli/internal/storage"
	"snippet-cli/internal/ui"

	"github.com/spf13/cobra"
)

var registerCmd = &cobra.Command{
	Use:   "register",
	Short: "Register a new account",
	Run: func(cmd *cobra.Command, args []string) {
		username, _ := cmd.Flags().GetString("username")
		email, _ := cmd.Flags().GetString("email")
		password, _ := cmd.Flags().GetString("password")

		resp, err := api.Client.Register(username, email, password)
		if err != nil {
			ui.PrintError("Registration failed", err)
			return
		}

		api.Client.SetToken(resp.AccessToken)
		storage.SaveConfig("user_id", fmt.Sprintf("%d", resp.User.ID))
		ui.PrintSuccess(fmt.Sprintf("Registered as %s!", resp.User.Username))
	},
}

var loginCmd = &cobra.Command{
	Use:   "login",
	Short: "Login to your account",
	Run: func(cmd *cobra.Command, args []string) {
		username, _ := cmd.Flags().GetString("username")
		password, _ := cmd.Flags().GetString("password")

		resp, err := api.Client.Login(username, password)
		if err != nil {
			ui.PrintError("Login failed", err)
			return
		}

		api.Client.SetToken(resp.AccessToken)
		storage.SaveConfig("user_id", fmt.Sprintf("%d", resp.User.ID))
		ui.PrintSuccess(fmt.Sprintf("Logged in as %s!", resp.User.Username))
	},
}

var logoutCmd = &cobra.Command{
	Use:   "logout",
	Short: "Logout from your account",
	Run: func(cmd *cobra.Command, args []string) {
		storage.SaveConfig("access_token", "")
		storage.SaveConfig("user_id", "")
		api.Client.SetToken("")
		ui.PrintSuccess("Logged out successfully")
	},
}

func init() {
	rootCmd.AddCommand(registerCmd)
	rootCmd.AddCommand(loginCmd)
	rootCmd.AddCommand(logoutCmd)

	registerCmd.Flags().StringP("username", "u", "", "Username")
	registerCmd.Flags().StringP("email", "e", "", "Email")
	registerCmd.Flags().StringP("password", "p", "", "Password")
	registerCmd.MarkFlagRequired("username")
	registerCmd.MarkFlagRequired("email")
	registerCmd.MarkFlagRequired("password")

	loginCmd.Flags().StringP("username", "u", "", "Username")
	loginCmd.Flags().StringP("password", "p", "", "Password")
	loginCmd.MarkFlagRequired("username")
	loginCmd.MarkFlagRequired("password")
}
