package collector

import (
	"bufio"
	"context"
	"fmt"
	"io"
	"logalyzer/types"
	"net"
	"os"
	"time"

	"golang.org/x/crypto/ssh"
)

const (
	maxReconnectAttempts = 10
	baseReconnectDelay   = 2 * time.Second
	maxReconnectDelay    = 30 * time.Second
	heartbeatInterval    = 30 * time.Second
)

type SSHCollector struct {
	Host           string
	Port           int
	User           string
	Password       string
	KeyPath        string
	FilePath       string
	Tail           bool
	client         *ssh.Client
	reconnectCount int
}

func NewSSHCollector(host string, port int, user, password, keyPath, filePath string, tail bool) *SSHCollector {
	return &SSHCollector{
		Host:           host,
		Port:           port,
		User:           user,
		Password:       password,
		KeyPath:        keyPath,
		FilePath:       filePath,
		Tail:           tail,
		reconnectCount: 0,
	}
}

func (c *SSHCollector) getSSHConfig() (*ssh.ClientConfig, error) {
	var authMethods []ssh.AuthMethod

	if c.Password != "" {
		authMethods = append(authMethods, ssh.Password(c.Password))
	}

	if c.KeyPath != "" {
		key, err := os.ReadFile(c.KeyPath)
		if err != nil {
			return nil, fmt.Errorf("无法读取私钥文件: %v", err)
		}

		signer, err := ssh.ParsePrivateKey(key)
		if err != nil {
			return nil, fmt.Errorf("无法解析私钥: %v", err)
		}

		authMethods = append(authMethods, ssh.PublicKeys(signer))
	}

	if len(authMethods) == 0 {
		return nil, fmt.Errorf("必须提供密码或私钥路径")
	}

	return &ssh.ClientConfig{
		User:            c.User,
		Auth:            authMethods,
		HostKeyCallback: ssh.InsecureIgnoreHostKey(),
		Timeout:         15 * time.Second,
	}, nil
}

func (c *SSHCollector) connect() (*ssh.Client, error) {
	config, err := c.getSSHConfig()
	if err != nil {
		return nil, err
	}

	conn, err := net.DialTimeout("tcp", fmt.Sprintf("%s:%d", c.Host, c.Port), config.Timeout)
	if err != nil {
		return nil, fmt.Errorf("网络连接失败: %v", err)
	}

	sshConn, chans, reqs, err := ssh.NewClientConn(conn, fmt.Sprintf("%s:%d", c.Host, c.Port), config)
	if err != nil {
		conn.Close()
		return nil, fmt.Errorf("SSH 握手失败: %v", err)
	}

	return ssh.NewClient(sshConn, chans, reqs), nil
}

func (c *SSHCollector) reconnect() (*ssh.Client, error) {
	c.reconnectCount++

	delay := baseReconnectDelay
	for i := 0; i < c.reconnectCount-1; i++ {
		delay *= 2
		if delay > maxReconnectDelay {
			delay = maxReconnectDelay
			break
		}
	}

	if c.reconnectCount > maxReconnectAttempts {
		return nil, fmt.Errorf("已达到最大重连次数 (%d)", maxReconnectAttempts)
	}

	time.Sleep(delay)

	client, err := c.connect()
	if err == nil {
		c.reconnectCount = 0
		return client, nil
	}

	return nil, err
}

func (c *SSHCollector) startHeartbeat(ctx context.Context, client *ssh.Client, stopChan chan struct{}) {
	ticker := time.NewTicker(heartbeatInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-stopChan:
			return
		case <-ticker.C:
			_, _, err := client.SendRequest("keepalive@golang.org", true, nil)
			if err != nil {
				close(stopChan)
				return
			}
		}
	}
}

func (c *SSHCollector) runSession(ctx context.Context, client *ssh.Client, logChan chan<- types.LogEntry) error {
	session, err := client.NewSession()
	if err != nil {
		return fmt.Errorf("创建 SSH session 失败: %v", err)
	}
	defer session.Close()

	var cmd string
	if c.Tail {
		cmd = fmt.Sprintf("tail -f %s", c.FilePath)
	} else {
		cmd = fmt.Sprintf("cat %s", c.FilePath)
	}

	stdout, err := session.StdoutPipe()
	if err != nil {
		return fmt.Errorf("创建标准输出管道失败: %v", err)
	}

	stderr, err := session.StderrPipe()
	if err != nil {
		return fmt.Errorf("创建标准错误管道失败: %v", err)
	}

	if err := session.Start(cmd); err != nil {
		return fmt.Errorf("执行命令失败: %v", err)
	}

	heartbeatStop := make(chan struct{})
	go c.startHeartbeat(ctx, client, heartbeatStop)
	defer close(heartbeatStop)

	reader := bufio.NewReader(stdout)
	source := fmt.Sprintf("ssh://%s@%s:%d%s", c.User, c.Host, c.Port, c.FilePath)

	sessionErrChan := make(chan error, 1)
	go func() {
		stderrContent, _ := io.ReadAll(stderr)
		if len(stderrContent) > 0 {
			sessionErrChan <- fmt.Errorf("远程命令错误: %s", string(stderrContent))
		}
	}()

	waitChan := make(chan error, 1)
	go func() {
		waitChan <- session.Wait()
	}()

	for {
		select {
		case <-ctx.Done():
			return nil
		case <-heartbeatStop:
			return fmt.Errorf("心跳检测失败，连接可能已断开")
		case err := <-waitChan:
			if err != nil && c.Tail {
				return fmt.Errorf("SSH session 异常结束: %v", err)
			}
			return nil
		case err := <-sessionErrChan:
			return err
		default:
			line, err := reader.ReadString('\n')
			if err != nil {
				if err == io.EOF {
					if c.Tail {
						time.Sleep(100 * time.Millisecond)
						continue
					}
					return nil
				}
				return fmt.Errorf("读取远程日志错误: %v", err)
			}

			select {
			case logChan <- types.LogEntry{
				TimeStamp:  time.Now(),
				Source:     source,
				RawMessage: line,
				Fields:     make(map[string]interface{}),
			}:
			case <-ctx.Done():
				return nil
			}
		}
	}
}

func (c *SSHCollector) Collect(ctx context.Context) (<-chan types.LogEntry, <-chan error) {
	logChan := make(chan types.LogEntry)
	errChan := make(chan error, 1)

	go func() {
		defer close(logChan)
		defer close(errChan)

		client, err := c.connect()
		if err != nil {
			errChan <- err
			return
		}
		defer client.Close()

		c.client = client
		c.reconnectCount = 0

		for {
			err := c.runSession(ctx, client, logChan)

			select {
			case <-ctx.Done():
				return
			default:
			}

			if !c.Tail {
				if err != nil {
					errChan <- err
				}
				return
			}

			if err != nil {
				errChan <- fmt.Errorf("连接中断: %v，尝试重连...", err)
			}

			client, err = c.reconnect()
			if err != nil {
				errChan <- fmt.Errorf("重连失败: %v", err)
				return
			}

			c.client = client
			errChan <- fmt.Errorf("已成功重连到 %s:%d", c.Host, c.Port)
		}
	}()

	return logChan, errChan
}
