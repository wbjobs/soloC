package cmd

import (
	"encoding/json"
	"fmt"
	"os"
	"snippet-cli/internal/api"
	"snippet-cli/internal/models"
	"snippet-cli/internal/storage"
	"snippet-cli/internal/ui"

	"github.com/spf13/cobra"
)

var syncCmd = &cobra.Command{
	Use:   "sync",
	Short: "Sync snippets with server",
	Run: func(cmd *cobra.Command, args []string) {
		ui.PrintInfo("Starting sync...")

		localSnippets, err := storage.GetUnsyncedSnippets()
		if err != nil {
			ui.PrintError("Failed to get unsynced snippets", err)
			return
		}

		ui.PrintInfo(fmt.Sprintf("Found %d unsynced local snippet(s)", len(localSnippets)))

		resp, err := api.Client.SyncSnippets(localSnippets)
		if err != nil {
			ui.PrintError("Sync failed", err)
			return
		}

		for _, serverSnippet := range resp.ServerSnippets {
			err := storage.UpsertServerSnippet(&serverSnippet)
			if err != nil {
				ui.PrintError("Failed to upsert snippet", err)
			}
		}

		for _, snippet := range localSnippets {
			storage.MarkAsSynced(snippet.ID)
		}

		storage.SaveConfig("last_sync", resp.CurrentSyncTime)
		ui.PrintSuccess(fmt.Sprintf("Sync completed! Received %d snippet(s) from server", len(resp.ServerSnippets)))
	},
}

var exportCmd = &cobra.Command{
	Use:   "export",
	Short: "Export snippets to JSON file",
	Run: func(cmd *cobra.Command, args []string) {
		output, _ := cmd.Flags().GetString("output")
		fromServer, _ := cmd.Flags().GetBool("server")

		var snippets interface{}
		var err error

		if fromServer {
			snippets, err = api.Client.ExportSnippets()
			if err != nil {
				ui.PrintError("Failed to export from server", err)
				return
			}
		} else {
			snippets, err = storage.GetAllSnippets()
			if err != nil {
				ui.PrintError("Failed to get local snippets", err)
				return
			}
		}

		data, err := json.MarshalIndent(map[string]interface{}{
			"version":  "1.0",
			"exported": snippets,
		}, "", "  ")
		if err != nil {
			ui.PrintError("Failed to marshal JSON", err)
			return
		}

		if output != "" {
			err = os.WriteFile(output, data, 0644)
			if err != nil {
				ui.PrintError("Failed to write file", err)
				return
			}
			ui.PrintSuccess(fmt.Sprintf("Exported to %s", output))
		} else {
			fmt.Println(string(data))
		}
	},
}

var importCmd = &cobra.Command{
	Use:   "import [file]",
	Short: "Import snippets from JSON file",
	Args:  cobra.ExactArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		toServer, _ := cmd.Flags().GetBool("server")

		data, err := os.ReadFile(args[0])
		if err != nil {
			ui.PrintError("Failed to read file", err)
			return
		}

		var importData struct {
			Snippets []map[string]interface{} `json:"snippets"`
			Exported []map[string]interface{} `json:"exported"`
		}

		err = json.Unmarshal(data, &importData)
		if err != nil {
			ui.PrintError("Failed to parse JSON", err)
			return
		}

		snippetsData := importData.Snippets
		if len(snippetsData) == 0 {
			snippetsData = importData.Exported
		}

		if toServer {
			var snippets []map[string]interface{}
			for _, s := range snippetsData {
				snippets = append(snippets, s)
			}
			err = api.Client.ImportSnippets(nil)
			if err != nil {
				ui.PrintError("Failed to import to server", err)
				return
			}
			ui.PrintSuccess(fmt.Sprintf("Imported %d snippet(s) to server", len(snippetsData)))
		} else {
			imported := 0
			for _, sData := range snippetsData {
				var snippet struct {
					Title       string   `json:"title"`
					Language    string   `json:"language"`
					Code        string   `json:"code"`
					Description string   `json:"description"`
					Tags        []string `json:"tags"`
				}
				
				sDataBytes, _ := json.Marshal(sData)
				json.Unmarshal(sDataBytes, &snippet)
				
				if snippet.Title == "" || snippet.Code == "" {
					continue
				}
				
				fullSnippet := &models.Snippet{
					Title:       snippet.Title,
					Language:    snippet.Language,
					Code:        snippet.Code,
					Description: snippet.Description,
					Tags:        snippet.Tags,
				}
				
				err := storage.CreateSnippet(fullSnippet)
				if err == nil {
					imported++
				}
			}
			ui.PrintSuccess(fmt.Sprintf("Imported %d snippet(s) locally", imported))
		}
	},
}

var teamCmd = &cobra.Command{
	Use:   "team",
	Short: "Team management commands",
}

var createTeamCmd = &cobra.Command{
	Use:   "create [name]",
	Short: "Create a new team",
	Args:  cobra.ExactArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		description, _ := cmd.Flags().GetString("description")
		err := api.Client.CreateTeamWithDesc(args[0], description)
		if err != nil {
			ui.PrintError("Failed to create team", err)
			return
		}
		ui.PrintSuccess("Team created successfully!")
	},
}

var listTeamsCmd = &cobra.Command{
	Use:   "list",
	Short: "List all teams you're in",
	Run: func(cmd *cobra.Command, args []string) {
		teams, err := api.Client.ListTeams()
		if err != nil {
			ui.PrintError("Failed to list teams", err)
			return
		}

		if len(teams) == 0 {
			ui.PrintInfo("You're not in any teams yet")
			return
		}

		fmt.Printf("Found %d team(s):\n\n", len(teams))
		for _, t := range teams {
			fmt.Printf("  #%d: %s\n", t.ID, t.Name)
			if t.Description != "" {
				fmt.Printf("       %s\n", t.Description)
			}
		}
	},
}

var inviteCmd = &cobra.Command{
	Use:   "invite [team-id] [email]",
	Short: "Invite someone to team",
	Args:  cobra.ExactArgs(2),
	Run: func(cmd *cobra.Command, args []string) {
		teamID := 0
		fmt.Sscanf(args[0], "%d", &teamID)
		email := args[1]

		err := api.Client.InviteToTeam(teamID, email)
		if err != nil {
			ui.PrintError("Failed to send invitation", err)
			return
		}
		ui.PrintSuccess(fmt.Sprintf("Invitation sent to %s!", email))
	},
}

var listInvitesCmd = &cobra.Command{
	Use:   "invites",
	Short: "List pending invitations",
	Run: func(cmd *cobra.Command, args []string) {
		invites, err := api.Client.ListInvites()
		if err != nil {
			ui.PrintError("Failed to list invitations", err)
			return
		}

		if len(invites) == 0 {
			ui.PrintInfo("No pending invitations")
			return
		}

		fmt.Printf("Found %d pending invitation(s):\n\n", len(invites))
		for _, inv := range invites {
			fmt.Printf("  #%d: Invited to team '%s' (#%d)\n", inv.ID, inv.TeamName, inv.TeamID)
		}
	},
}

var acceptInviteCmd = &cobra.Command{
	Use:   "accept [invite-id]",
	Short: "Accept an invitation",
	Args:  cobra.ExactArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		inviteID := 0
		fmt.Sscanf(args[0], "%d", &inviteID)

		err := api.Client.AcceptInvite(inviteID)
		if err != nil {
			ui.PrintError("Failed to accept invitation", err)
			return
		}
		ui.PrintSuccess("Successfully joined the team!")
	},
}

var shareCmd = &cobra.Command{
	Use:   "share [team-id] [snippet-id]",
	Short: "Share a snippet with team",
	Args:  cobra.ExactArgs(2),
	Run: func(cmd *cobra.Command, args []string) {
		teamID := 0
		snippetID := 0
		fmt.Sscanf(args[0], "%d", &teamID)
		fmt.Sscanf(args[1], "%d", &snippetID)
		canEdit, _ := cmd.Flags().GetBool("edit")

		err := api.Client.ShareSnippetWithEdit(teamID, snippetID, canEdit)
		if err != nil {
			ui.PrintError("Failed to share snippet", err)
			return
		}
		ui.PrintSuccess("Snippet shared successfully!")
	},
}

var sharedSnippetsCmd = &cobra.Command{
	Use:   "snippets [team-id]",
	Short: "List shared snippets in team",
	Args:  cobra.ExactArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		teamID := 0
		fmt.Sscanf(args[0], "%d", &teamID)

		snippets, err := api.Client.GetSharedSnippets(teamID)
		if err != nil {
			ui.PrintError("Failed to get shared snippets", err)
			return
		}

		ui.PrintSnippetList(snippets)
	},
}

var teamMembersCmd = &cobra.Command{
	Use:   "members [team-id]",
	Short: "List team members",
	Args:  cobra.ExactArgs(1),
	Run: func(cmd *cobra.Command, args []string) {
		teamID := 0
		fmt.Sscanf(args[0], "%d", &teamID)

		members, err := api.Client.GetTeamMembers(teamID)
		if err != nil {
			ui.PrintError("Failed to get team members", err)
			return
		}

		fmt.Printf("Found %d member(s):\n\n", len(members))
		for _, m := range members {
			fmt.Printf("  %s (%s) - %s\n", m.Username, m.Email, m.Role)
		}
	},
}

func init() {
	rootCmd.AddCommand(syncCmd)
	rootCmd.AddCommand(exportCmd)
	rootCmd.AddCommand(importCmd)
	rootCmd.AddCommand(teamCmd)

	exportCmd.Flags().StringP("output", "o", "", "Output file (default: stdout)")
	exportCmd.Flags().BoolP("server", "s", false, "Export from server")

	importCmd.Flags().BoolP("server", "s", false, "Import to server")

	teamCmd.AddCommand(createTeamCmd)
	teamCmd.AddCommand(listTeamsCmd)
	teamCmd.AddCommand(inviteCmd)
	teamCmd.AddCommand(listInvitesCmd)
	teamCmd.AddCommand(acceptInviteCmd)
	teamCmd.AddCommand(shareCmd)
	teamCmd.AddCommand(sharedSnippetsCmd)
	teamCmd.AddCommand(teamMembersCmd)

	createTeamCmd.Flags().StringP("description", "d", "", "Team description")
	shareCmd.Flags().BoolP("edit", "e", false, "Allow members to edit this snippet")
}
