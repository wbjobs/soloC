package service

import (
	"context"
	"encoding/json"
	"fmt"
	"sync"
	"time"

	"github.com/sirupsen/logrus"
	"github.com/slack-go/slack"
	"gopkg.in/gomail.v2"

	pb "blockchain-monitor/api/gen/monitor"
	"blockchain-monitor/config"
	"blockchain-monitor/nodes"
)

type AlertService struct {
	cfg *config.Config

	lastAlertTime map[string]time.Time
	alertCooldown time.Duration
	mu            sync.RWMutex
}

func NewAlertService(cfg *config.Config) *AlertService {
	return &AlertService{
		cfg:           cfg,
		lastAlertTime: make(map[string]time.Time),
		alertCooldown: 5 * time.Minute,
	}
}

func (a *AlertService) CheckAndAlert(nodeInfo *nodes.NodeInfo, status *nodes.NodeStatus) {
	if a.shouldAlert(nodeInfo, status) {
		alertMsg := a.buildAlertMessage(nodeInfo, status)

		if a.cfg.EmailEnabled {
			if err := a.sendEmail(alertMsg); err != nil {
				logrus.WithError(err).Error("Failed to send email alert")
			}
		}

		if a.cfg.SlackEnabled {
			if err := a.sendSlack(alertMsg); err != nil {
				logrus.WithError(err).Error("Failed to send Slack alert")
			}
		}

		a.recordAlert(nodeInfo.ID)

		logrus.WithFields(logrus.Fields{
			"node_id": nodeInfo.ID,
			"status":  status.Status,
		}).Warn("Alert sent")
	}
}

func (a *AlertService) shouldAlert(nodeInfo *nodes.NodeInfo, status *nodes.NodeStatus) bool {
	if status.Status == pb.NodeStatus_ONLINE || status.Status == pb.NodeStatus_SYNCING {
		return false
	}

	return !a.isOnCooldown(nodeInfo.ID)
}

func (a *AlertService) isOnCooldown(nodeID string) bool {
	a.mu.RLock()
	defer a.mu.RUnlock()

	lastTime, exists := a.lastAlertTime[nodeID]
	if !exists {
		return false
	}

	return time.Since(lastTime) < a.alertCooldown
}

func (a *AlertService) recordAlert(nodeID string) {
	a.mu.Lock()
	defer a.mu.Unlock()
	a.lastAlertTime[nodeID] = time.Now()
}

func (a *AlertService) buildAlertMessage(nodeInfo *nodes.NodeInfo, status *nodes.NodeStatus) *AlertMessage {
	var statusText string
	switch status.Status {
	case pb.NodeStatus_OFFLINE:
		statusText = "OFFLINE"
	case pb.NodeStatus_ERROR:
		statusText = "ERROR"
	case pb.NodeStatus_SYNCING:
		statusText = "SYNCING"
	default:
		statusText = "UNKNOWN"
	}

	return &AlertMessage{
		Subject:     fmt.Sprintf("[ALERT] Blockchain Node %s is %s", nodeInfo.Name, statusText),
		NodeName:    nodeInfo.Name,
		NodeID:      nodeInfo.ID,
		NodeType:    nodeInfo.Type,
		Status:      statusText,
		Endpoint:    nodeInfo.Endpoint,
		Error:       status.ErrorMessage,
		Timestamp:   status.Timestamp,
	}
}

func (a *AlertService) sendEmail(msg *AlertMessage) error {
	body := a.formatEmailBody(msg)

	m := gomail.NewMessage()
	m.SetHeader("From", a.cfg.EmailFrom)
	m.SetHeader("To", a.cfg.EmailTo)
	m.SetHeader("Subject", msg.Subject)
	m.SetBody("text/html", body)

	d := gomail.NewDialer(
		a.cfg.EmailSMTPHost,
		a.cfg.EmailSMTPPort,
		a.cfg.EmailUsername,
		a.cfg.EmailPassword,
	)

	return d.DialAndSend(m)
}

func (a *AlertService) sendSlack(msg *AlertMessage) error {
	api := slack.New(a.cfg.SlackToken)

	attachment := slack.Attachment{
		Color:      "danger",
		Title:      msg.Subject,
		MarkdownIn: []string{"fields"},
		Fields: []slack.AttachmentField{
			{
				Title: "Node Name",
				Value: msg.NodeName,
				Short: true,
			},
			{
				Title: "Status",
				Value: msg.Status,
				Short: true,
			},
			{
				Title: "Node ID",
				Value: msg.NodeID,
				Short: true,
			},
			{
				Title: "Endpoint",
				Value: msg.Endpoint,
				Short: true,
			},
		},
		Footer: "Blockchain Monitor",
		Ts:     json.Number(fmt.Sprintf("%d", msg.Timestamp.Unix())),
	}

	if msg.Error != "" {
		attachment.Fields = append(attachment.Fields, slack.AttachmentField{
			Title: "Error",
			Value: msg.Error,
			Short: false,
		})
	}

	_, _, err := api.PostMessage(
		a.cfg.SlackChannel,
		slack.MsgOptionAttachments(attachment),
		slack.MsgOptionAsUser(true),
	)

	return err
}

func (a *AlertService) formatEmailBody(msg *AlertMessage) string {
	return fmt.Sprintf(`
		<html>
		<head>
			<style>
				body { font-family: Arial, sans-serif; padding: 20px; }
				.alert { background-color: #f8d7da; border: 1px solid #f5c6cb; padding: 15px; border-radius: 5px; }
				.field { margin: 10px 0; }
				.label { font-weight: bold; color: #721c24; }
				.value { margin-left: 10px; }
			</style>
		</head>
		<body>
			<div class="alert">
				<h2>⚠️ Blockchain Node Alert</h2>
				<div class="field"><span class="label">Node Name:</span><span class="value">%s</span></div>
				<div class="field"><span class="label">Status:</span><span class="value">%s</span></div>
				<div class="field"><span class="label">Endpoint:</span><span class="value">%s</span></div>
				<div class="field"><span class="label">Time:</span><span class="value">%s</span></div>
				%s
			</div>
		</body>
		</html>
	`,
		msg.NodeName,
		msg.Status,
		msg.Endpoint,
		msg.Timestamp.Format(time.RFC3339),
		a.formatErrorField(msg.Error),
	)
}

func (a *AlertService) formatErrorField(err string) string {
	if err == "" {
		return ""
	}
	return fmt.Sprintf(`<div class="field"><span class="label">Error:</span><span class="value">%s</span></div>`, err)
}

type AlertMessage struct {
	Subject   string
	NodeName  string
	NodeID    string
	NodeType  pb.NodeType
	Status    string
	Endpoint  string
	Error     string
	Timestamp time.Time
}
