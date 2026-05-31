package api

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"snippet-cli/internal/models"
	"snippet-cli/internal/storage"
	"time"
)

var Client *APIClient

type APIClient struct {
	BaseURL    string
	HTTPClient *http.Client
	Token      string
}

func InitClient() error {
	serverURL, err := storage.GetConfig("server_url")
	if err != nil {
		return err
	}
	if serverURL == "" {
		serverURL = "http://localhost:5000"
	}
	
	token, err := storage.GetConfig("access_token")
	if err != nil {
		return err
	}
	
	Client = &APIClient{
		BaseURL:    serverURL,
		HTTPClient: &http.Client{Timeout: 300 * time.Second},
		Token:      token,
	}
	return nil
}

func (c *APIClient) SetToken(token string) {
	c.Token = token
	storage.SaveConfig("access_token", token)
}

func (c *APIClient) makeRequest(method, path string, body interface{}) (*http.Response, error) {
	var buf bytes.Buffer
	if body != nil {
		json.NewEncoder(&buf).Encode(body)
	}
	
	req, err := http.NewRequest(method, c.BaseURL+path, &buf)
	if err != nil {
		return nil, err
	}
	
	req.Header.Set("Content-Type", "application/json")
	if c.Token != "" {
		req.Header.Set("Authorization", "Bearer "+c.Token)
	}
	
	return c.HTTPClient.Do(req)
}

func (c *APIClient) Register(username, email, password string) (*models.AuthResponse, error) {
	data := map[string]string{
		"username": username,
		"email":    email,
		"password": password,
	}
	
	resp, err := c.makeRequest("POST", "/api/auth/register", data)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	
	if resp.StatusCode != 201 {
		return nil, fmt.Errorf("registration failed with status: %d", resp.StatusCode)
	}
	
	var authResp models.AuthResponse
	err = json.NewDecoder(resp.Body).Decode(&authResp)
	return &authResp, err
}

func (c *APIClient) Login(username, password string) (*models.AuthResponse, error) {
	data := map[string]string{
		"username": username,
		"password": password,
	}
	
	resp, err := c.makeRequest("POST", "/api/auth/login", data)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	
	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("login failed with status: %d", resp.StatusCode)
	}
	
	var authResp models.AuthResponse
	err = json.NewDecoder(resp.Body).Decode(&authResp)
	return &authResp, err
}

func (c *APIClient) SyncSnippets(localSnippets []models.Snippet) (*models.SyncResponse, error) {
	lastSync, _ := storage.GetConfig("last_sync")
	deviceID, _ := storage.GetConfig("device_id")
	
	if deviceID == "" {
		deviceID = fmt.Sprintf("%d", time.Now().Unix())
		storage.SaveConfig("device_id", deviceID)
	}
	
	req := models.SyncRequest{
		Snippets: localSnippets,
		LastSync: lastSync,
		DeviceID: deviceID,
	}
	
	resp, err := c.makeRequest("POST", "/api/sync", req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	
	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("sync failed with status: %d", resp.StatusCode)
	}
	
	var syncResp models.SyncResponse
	err = json.NewDecoder(resp.Body).Decode(&syncResp)
	return &syncResp, err
}

func (c *APIClient) ExportSnippets() ([]models.Snippet, error) {
	resp, err := c.makeRequest("GET", "/api/export", nil)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	
	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("export failed with status: %d", resp.StatusCode)
	}
	
	var data struct {
		Snippets []models.Snippet `json:"snippets"`
	}
	err = json.NewDecoder(resp.Body).Decode(&data)
	return data.Snippets, err
}

func (c *APIClient) ImportSnippets(snippets []models.Snippet) error {
	data := map[string]interface{}{
		"snippets": snippets,
	}
	
	resp, err := c.makeRequest("POST", "/api/import", data)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	
	if resp.StatusCode != 200 {
		return fmt.Errorf("import failed with status: %d", resp.StatusCode)
	}
	return nil
}

func (c *APIClient) CreateTeamWithDesc(name, description string) error {
	data := map[string]string{
		"name":        name,
		"description": description,
	}
	resp, err := c.makeRequest("POST", "/api/teams", data)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	
	if resp.StatusCode != 201 {
		return fmt.Errorf("create team failed with status: %d", resp.StatusCode)
	}
	return nil
}

func (c *APIClient) ListTeams() ([]models.Team, error) {
	resp, err := c.makeRequest("GET", "/api/teams", nil)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	
	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("list teams failed with status: %d", resp.StatusCode)
	}
	
	var teams []models.Team
	err = json.NewDecoder(resp.Body).Decode(&teams)
	return teams, err
}

func (c *APIClient) InviteToTeam(teamID int, email string) error {
	data := map[string]string{"email": email}
	resp, err := c.makeRequest("POST", fmt.Sprintf("/api/teams/%d/invite", teamID), data)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	
	if resp.StatusCode != 200 {
		return fmt.Errorf("invite failed with status: %d", resp.StatusCode)
	}
	return nil
}

func (c *APIClient) ListInvites() ([]models.TeamInvite, error) {
	resp, err := c.makeRequest("GET", "/api/invites", nil)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	
	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("list invites failed with status: %d", resp.StatusCode)
	}
	
	var invites []models.TeamInvite
	err = json.NewDecoder(resp.Body).Decode(&invites)
	return invites, err
}

func (c *APIClient) AcceptInvite(inviteID int) error {
	resp, err := c.makeRequest("POST", fmt.Sprintf("/api/invites/%d/accept", inviteID), nil)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	
	if resp.StatusCode != 200 {
		return fmt.Errorf("accept invite failed with status: %d", resp.StatusCode)
	}
	return nil
}

func (c *APIClient) ShareSnippetWithEdit(teamID, snippetID int, canEdit bool) error {
	data := map[string]interface{}{
		"snippet_id": snippetID,
		"can_edit":   canEdit,
	}
	resp, err := c.makeRequest("POST", fmt.Sprintf("/api/teams/%d/share", teamID), data)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	
	if resp.StatusCode != 200 {
		return fmt.Errorf("share snippet failed with status: %d", resp.StatusCode)
	}
	return nil
}

func (c *APIClient) GetSharedSnippets(teamID int) ([]models.Snippet, error) {
	resp, err := c.makeRequest("GET", fmt.Sprintf("/api/teams/%d/snippets", teamID), nil)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	
	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("get shared snippets failed with status: %d", resp.StatusCode)
	}
	
	var snippets []models.Snippet
	err = json.NewDecoder(resp.Body).Decode(&snippets)
	return snippets, err
}

func (c *APIClient) GetTeamMembers(teamID int) ([]models.TeamMember, error) {
	resp, err := c.makeRequest("GET", fmt.Sprintf("/api/teams/%d/members", teamID), nil)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	
	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("get team members failed with status: %d", resp.StatusCode)
	}
	
	var members []models.TeamMember
	err = json.NewDecoder(resp.Body).Decode(&members)
	return members, err
}

func (c *APIClient) ShareSnippet(teamID, snippetID int) error {
	data := map[string]int{"snippet_id": snippetID}
	resp, err := c.makeRequest("POST", fmt.Sprintf("/api/teams/%d/share", teamID), data)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	
	if resp.StatusCode != 200 {
		return fmt.Errorf("share snippet failed with status: %d", resp.StatusCode)
	}
	return nil
}

func (c *APIClient) LintCode(language, code string) (*models.LintResult, error) {
	data := map[string]string{
		"language": language,
		"code":     code,
	}
	
	resp, err := c.makeRequest("POST", "/api/lint", data)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	
	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("lint failed with status: %d", resp.StatusCode)
	}
	
	var result models.LintResult
	err = json.NewDecoder(resp.Body).Decode(&result)
	return &result, err
}
