package parser

import (
	"regexp"
	"strings"
)

type HttpRequest struct {
	Method  string
	Path    string
	Version string
	Host    string
}

type HttpResponse struct {
	Version    string
	StatusCode string
}

type GrpcRequest struct {
	Service string
	Method  string
}

func ParseHTTPRequest(payload string) (*HttpRequest, bool) {
	lines := strings.Split(payload, "\r\n")
	if len(lines) == 0 {
		return nil, false
	}

	firstLine := lines[0]
	match, _ := regexp.MatchString(`^(GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)\s+.+\s+HTTP/1\.[01]$`, firstLine)
	if !match {
		return nil, false
	}

	parts := strings.Fields(firstLine)
	if len(parts) < 3 {
		return nil, false
	}

	req := &HttpRequest{
		Method:  parts[0],
		Path:    parts[1],
		Version: parts[2],
	}

	for _, line := range lines[1:] {
		if strings.HasPrefix(line, "Host:") {
			req.Host = strings.TrimSpace(strings.TrimPrefix(line, "Host:"))
			break
		}
	}

	return req, true
}

func ParseHTTPResponse(payload string) (*HttpResponse, bool) {
	lines := strings.Split(payload, "\r\n")
	if len(lines) == 0 {
		return nil, false
	}

	firstLine := lines[0]
	match, _ := regexp.MatchString(`^HTTP/1\.[01]\s+[0-9]{3}\s+.+$`, firstLine)
	if !match {
		return nil, false
	}

	parts := strings.Fields(firstLine)
	if len(parts) < 2 {
		return nil, false
	}

	return &HttpResponse{
		Version:    parts[0],
		StatusCode: parts[1],
	}, true
}

func ParseGRPC(payload string) (*GrpcRequest, bool) {
	if !strings.Contains(payload, "application/grpc") && 
	   !strings.Contains(payload, "grpc-timeout") &&
	   !strings.Contains(payload, "grpc-encoding") {
		return nil, false
	}

	lines := strings.Split(payload, "\r\n")
	for _, line := range lines {
		if strings.HasPrefix(line, ":path:") {
			path := strings.TrimSpace(strings.TrimPrefix(line, ":path:"))
			if strings.HasPrefix(path, "/") {
				parts := strings.Split(strings.TrimPrefix(path, "/"), "/")
				if len(parts) >= 2 {
					return &GrpcRequest{
						Service: parts[0],
						Method:  parts[1],
					}, true
				}
			}
		}
	}

	return &GrpcRequest{
		Service: "unknown",
		Method:  "unknown",
	}, true
}

func DetectProtocol(payload string) string {
	if req, ok := ParseHTTPRequest(payload); ok && req.Method != "" {
		return "HTTP"
	}
	if resp, ok := ParseHTTPResponse(payload); ok && resp.StatusCode != "" {
		return "HTTP"
	}
	if _, ok := ParseGRPC(payload); ok {
		return "gRPC"
	}
	return "UNKNOWN"
}
