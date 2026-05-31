package collector

import (
	"bufio"
	"context"
	"fmt"
	"io"
	"logalyzer/types"
	"path/filepath"
	"time"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/tools/clientcmd"
	"k8s.io/client-go/util/homedir"
)

type K8sCollector struct {
	Namespace string
	PodName   string
	Container string
	Tail      bool
	KubeConfig string
}

func NewK8sCollector(namespace, podName, container, kubeConfig string, tail bool) *K8sCollector {
	if namespace == "" {
		namespace = "default"
	}
	if kubeConfig == "" {
		if home := homedir.HomeDir(); home != "" {
			kubeConfig = filepath.Join(home, ".kube", "config")
		}
	}

	return &K8sCollector{
		Namespace: namespace,
		PodName:   podName,
		Container: container,
		Tail:      tail,
		KubeConfig: kubeConfig,
	}
}

func (c *K8sCollector) getClient() (*kubernetes.Clientset, error) {
	config, err := clientcmd.BuildConfigFromFlags("", c.KubeConfig)
	if err != nil {
		return nil, fmt.Errorf("无法构建 Kubernetes 配置: %v", err)
	}

	clientset, err := kubernetes.NewForConfig(config)
	if err != nil {
		return nil, fmt.Errorf("无法创建 Kubernetes 客户端: %v", err)
	}

	return clientset, nil
}

func (c *K8sCollector) Collect(ctx context.Context) (<-chan types.LogEntry, <-chan error) {
	logChan := make(chan types.LogEntry)
	errChan := make(chan error, 1)

	go func() {
		defer close(logChan)
		defer close(errChan)

		clientset, err := c.getClient()
		if err != nil {
			errChan <- err
			return
		}

		podLogOptions := &corev1.PodLogOptions{
			Container: c.Container,
			Follow:    c.Tail,
		}

		if !c.Tail {
			tailLines := int64(100)
			podLogOptions.TailLines = &tailLines
		}

		req := clientset.CoreV1().Pods(c.Namespace).GetLogs(c.PodName, podLogOptions)

		stream, err := req.Stream(ctx)
		if err != nil {
			errChan <- fmt.Errorf("获取 Pod 日志流失败: %v", err)
			return
		}
		defer stream.Close()

		reader := bufio.NewReader(stream)
		source := fmt.Sprintf("k8s://%s/%s/%s", c.Namespace, c.PodName, c.Container)
		if c.Container == "" {
			source = fmt.Sprintf("k8s://%s/%s", c.Namespace, c.PodName)
		}

		for {
			select {
			case <-ctx.Done():
				return
			default:
				line, err := reader.ReadString('\n')
				if err != nil {
					if err == io.EOF {
						if c.Tail {
							time.Sleep(100 * time.Millisecond)
							continue
						}
						return
					}
					errChan <- fmt.Errorf("读取 Pod 日志错误: %v", err)
					return
				}

				logChan <- types.LogEntry{
					TimeStamp:  time.Now(),
					Source:     source,
					RawMessage: line,
					Fields:     make(map[string]interface{}),
				}
			}
		}
	}()

	return logChan, errChan
}

func (c *K8sCollector) ListPods(ctx context.Context) ([]string, error) {
	clientset, err := c.getClient()
	if err != nil {
		return nil, err
	}

	pods, err := clientset.CoreV1().Pods(c.Namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, fmt.Errorf("获取 Pod 列表失败: %v", err)
	}

	var podNames []string
	for _, pod := range pods.Items {
		podNames = append(podNames, pod.Name)
	}

	return podNames, nil
}
