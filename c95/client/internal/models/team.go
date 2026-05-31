package models

type Team struct {
	ID          int    `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description"`
	CreatedAt   string `json:"created_at"`
}

type TeamMember struct {
	ID        int    `json:"id"`
	UserID    int    `json:"user_id"`
	Username  string `json:"username"`
	Email     string `json:"email"`
	Role      string `json:"role"`
	JoinedAt  string `json:"joined_at"`
}

type TeamInvite struct {
	ID        int    `json:"id"`
	TeamID    int    `json:"team_id"`
	TeamName  string `json:"team_name"`
	InvitedAt string `json:"invited_at"`
}
