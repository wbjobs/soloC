package main

import (
	"crypto/tls"
	"fmt"
	"log"
	"net/smtp"
	"strings"
	"time"
)

type AlertConfig struct {
	Enabled        bool
	EmailEnabled   bool
	SMSService     string
	AdminEmails    []string
	AdminPhones    []string
	SMTPHost       string
	SMTPPort       int
	SMTPUser       string
	SMTPPassword   string
	SenderEmail    string
	AlertOnFailure bool
	AlertOnTimeout bool
	AlertOnRetry   bool
	MaxRetries     int
}

type AlertService struct {
	config *AlertConfig
}

func NewAlertService() *AlertService {
	config := &AlertConfig{
		Enabled:        true,
		EmailEnabled:   true,
		SMSService:     "none",
		AdminEmails:    []string{"admin@example.com"},
		AdminPhones:    []string{},
		SMTPHost:       "smtp.example.com",
		SMTPPort:       587,
		SMTPUser:       "alert@example.com",
		SMTPPassword:   "password",
		SenderEmail:    "Task Scheduler <alert@example.com>",
		AlertOnFailure: true,
		AlertOnTimeout: true,
		AlertOnRetry:   true,
		MaxRetries:     3,
	}
	return &AlertService{config: config}
}

func (a *AlertService) SendTaskAlert(task *Task, alertType string, errorMsg string) error {
	if !a.config.Enabled {
		return nil
	}

	subject := fmt.Sprintf("[%s ALERT] Task: %s (%s)", strings.ToUpper(alertType), task.Name, task.ID)
	
	body := a.buildAlertBody(task, alertType, errorMsg)

	var err error
	if a.config.EmailEnabled && len(a.config.AdminEmails) > 0 {
		for _, email := range a.config.AdminEmails {
			if emailErr := a.sendEmail(email, subject, body); emailErr != nil {
				log.Printf("Failed to send alert email to %s: %v", email, emailErr)
				err = emailErr
			}
		}
	}

	if a.config.SMSService != "none" && len(a.config.AdminPhones) > 0 {
		smsMsg := fmt.Sprintf("[%s] Task %s failed. Check email for details.", alertType, task.Name)
		for _, phone := range a.config.AdminPhones {
			if smsErr := a.sendSMS(phone, smsMsg); smsErr != nil {
				log.Printf("Failed to send SMS to %s: %v", phone, smsErr)
				err = smsErr
			}
		}
	}

	log.Printf("Alert sent for task %s (%s)", task.ID, alertType)
	return err
}

func (a *AlertService) buildAlertBody(task *Task, alertType, errorMsg string) string {
	var sb strings.Builder

	sb.WriteString("=" + strings.Repeat("=", 60) + "\n")
	sb.WriteString(fmt.Sprintf("  TASK %s ALERT NOTIFICATION\n", strings.ToUpper(alertType)))
	sb.WriteString("=" + strings.Repeat("=", 60) + "\n\n")

	sb.WriteString(fmt.Sprintf("Task ID:        %s\n", task.ID))
	sb.WriteString(fmt.Sprintf("Task Name:      %s\n", task.Name))
	sb.WriteString(fmt.Sprintf("Task Type:      %s\n", task.Type))
	sb.WriteString(fmt.Sprintf("Command:        %s\n", task.Command))
	sb.WriteString(fmt.Sprintf("Status:         %s\n", task.Status))
	sb.WriteString(fmt.Sprintf("Priority:       %d\n", task.Priority))
	sb.WriteString(fmt.Sprintf("Assigned Node:  %s\n", task.AssignedNode))
	sb.WriteString("\n")

	sb.WriteString("-" + strings.Repeat("-", 60) + "\n")
	sb.WriteString("  EXECUTION DETAILS\n")
	sb.WriteString("-" + strings.Repeat("-", 60) + "\n")
	sb.WriteString(fmt.Sprintf("Retry Count:    %d / %d\n", task.RetryCount, task.MaxRetries))
	sb.WriteString(fmt.Sprintf("Timeout:        %d seconds\n", task.Timeout))
	sb.WriteString(fmt.Sprintf("Created At:     %s\n", task.CreatedAt.Format(time.RFC3339)))

	if !task.StartedAt.IsZero() {
		sb.WriteString(fmt.Sprintf("Started At:     %s\n", task.StartedAt.Format(time.RFC3339)))
	}
	if !task.CompletedAt.IsZero() {
		sb.WriteString(fmt.Sprintf("Completed At:   %s\n", task.CompletedAt.Format(time.RFC3339)))
		duration := task.CompletedAt.Sub(task.StartedAt)
		sb.WriteString(fmt.Sprintf("Duration:       %v\n", duration))
	}
	sb.WriteString("\n")

	if errorMsg != "" {
		sb.WriteString("-" + strings.Repeat("-", 60) + "\n")
		sb.WriteString("  ERROR DETAILS\n")
		sb.WriteString("-" + strings.Repeat("-", 60) + "\n")
		sb.WriteString(fmt.Sprintf("%s\n\n", errorMsg))
	}

	if task.Result != "" {
		sb.WriteString("-" + strings.Repeat("-", 60) + "\n")
		sb.WriteString("  TASK OUTPUT\n")
		sb.WriteString("-" + strings.Repeat("-", 60) + "\n")
		sb.WriteString(fmt.Sprintf("%s\n\n", task.Result))
	}

	sb.WriteString("=" + strings.Repeat("=", 60) + "\n")
	sb.WriteString("  This is an automated alert from the Distributed Task Scheduler\n")
	sb.WriteString("=" + strings.Repeat("=", 60) + "\n")

	return sb.String()
}

func (a *AlertService) sendEmail(to, subject, body string) error {
	smtpAddr := fmt.Sprintf("%s:%d", a.config.SMTPHost, a.config.SMTPPort)
	
	auth := smtp.PlainAuth("", a.config.SMTPUser, a.config.SMTPPassword, a.config.SMTPHost)

	msg := fmt.Sprintf("From: %s\r\n"+
		"To: %s\r\n"+
		"Subject: %s\r\n"+
		"MIME-Version: 1.0\r\n"+
		"Content-Type: text/plain; charset=utf-8\r\n"+
		"\r\n"+
		"%s", a.config.SenderEmail, to, subject, body)

	tlsConfig := &tls.Config{
		InsecureSkipVerify: true,
		ServerName:         a.config.SMTPHost,
	}

	conn, err := tls.Dial("tcp", smtpAddr, tlsConfig)
	if err != nil {
		return fmt.Errorf("TLS connection failed: %v", err)
	}
	defer conn.Close()

	client, err := smtp.NewClient(conn, a.config.SMTPHost)
	if err != nil {
		return fmt.Errorf("SMTP client creation failed: %v", err)
	}
	defer client.Quit()

	if err := client.Auth(auth); err != nil {
		return fmt.Errorf("SMTP auth failed: %v", err)
	}

	if err := client.Mail(a.config.SMTPUser); err != nil {
		return fmt.Errorf("SMTP mail failed: %v", err)
	}

	if err := client.Rcpt(to); err != nil {
		return fmt.Errorf("SMTP rcpt failed: %v", err)
	}

	w, err := client.Data()
	if err != nil {
		return fmt.Errorf("SMTP data failed: %v", err)
	}

	_, err = w.Write([]byte(msg))
	if err != nil {
		return fmt.Errorf("SMTP write failed: %v", err)
	}

	if err := w.Close(); err != nil {
		return fmt.Errorf("SMTP close failed: %v", err)
	}

	return nil
}

func (a *AlertService) sendSMS(phone, message string) error {
	log.Printf("SMS sent to %s: %s", phone, message)
	return nil
}
