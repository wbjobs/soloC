package collector

import (
	"bufio"
	"context"
	"fmt"
	"io"
	"logalyzer/types"
	"os"
	"time"

	"github.com/fsnotify/fsnotify"
)

type FileCollector struct {
	Path string
	Tail bool
}

func NewFileCollector(path string, tail bool) *FileCollector {
	return &FileCollector{
		Path: path,
		Tail: tail,
	}
}

func (c *FileCollector) Collect(ctx context.Context) (<-chan types.LogEntry, <-chan error) {
	logChan := make(chan types.LogEntry)
	errChan := make(chan error, 1)

	go func() {
		defer close(logChan)
		defer close(errChan)

		file, err := os.Open(c.Path)
		if err != nil {
			errChan <- fmt.Errorf("无法打开文件 %s: %v", c.Path, err)
			return
		}
		defer file.Close()

		if c.Tail {
			_, _ = file.Seek(0, io.SeekEnd)
		}

		reader := bufio.NewReader(file)

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
					errChan <- fmt.Errorf("读取文件错误: %v", err)
					return
				}

				logChan <- types.LogEntry{
					TimeStamp:  time.Now(),
					Source:     c.Path,
					RawMessage: line,
					Fields:     make(map[string]interface{}),
				}
			}
		}
	}()

	return logChan, errChan
}

func (c *FileCollector) Watch(ctx context.Context) (<-chan types.LogEntry, <-chan error) {
	logChan := make(chan types.LogEntry)
	errChan := make(chan error, 1)

	go func() {
		defer close(logChan)
		defer close(errChan)

		watcher, err := fsnotify.NewWatcher()
		if err != nil {
			errChan <- fmt.Errorf("创建文件监视器失败: %v", err)
			return
		}
		defer watcher.Close()

		file, err := os.Open(c.Path)
		if err != nil {
			errChan <- fmt.Errorf("无法打开文件 %s: %v", c.Path, err)
			return
		}
		defer file.Close()

		_, _ = file.Seek(0, io.SeekEnd)
		reader := bufio.NewReader(file)

		err = watcher.Add(c.Path)
		if err != nil {
			errChan <- fmt.Errorf("无法监视文件 %s: %v", c.Path, err)
			return
		}

		for {
			select {
			case <-ctx.Done():
				return
			case event, ok := <-watcher.Events:
				if !ok {
					return
				}
				if event.Op&fsnotify.Write == fsnotify.Write {
					for {
						line, err := reader.ReadString('\n')
						if err != nil {
							if err == io.EOF {
								break
							}
							errChan <- fmt.Errorf("读取文件错误: %v", err)
							return
						}

						logChan <- types.LogEntry{
							TimeStamp:  time.Now(),
							Source:     c.Path,
							RawMessage: line,
							Fields:     make(map[string]interface{}),
						}
					}
				}
			case err, ok := <-watcher.Errors:
				if !ok {
					return
				}
				errChan <- fmt.Errorf("文件监视错误: %v", err)
				return
			}
		}
	}()

	return logChan, errChan
}
