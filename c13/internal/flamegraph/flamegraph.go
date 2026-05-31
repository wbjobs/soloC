package flamegraph

import (
	"bytes"
	"context"
	"fmt"
	"html/template"
	"math"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"syscalltracer/internal/db"
)

type flamegraphNode struct {
	Name      string
	Value     uint64
	Depth     int
	StartX    float64
	Width     float64
	Children  []*flamegraphNode
	Parent    *flamegraphNode
}

type flamegraphData struct {
	Nodes      []*flamegraphNode
	Total      uint64
	Width      int
	Height     int
	CellHeight int
	MaxDepth   int
}

const maxNodes = 100
const maxBarLen = 60
const flamegraphTimeout = 10 * time.Second

var (
	parsedTemplate *template.Template
	templateErr    error
	templateOnce   = func() func() {
		once := make(chan struct{}, 1)
		once <- struct{}{}
		return func() {
			select {
			case <-once:
			default:
			}
		}
	}()
)

func getTemplate() (*template.Template, error) {
	templateOnce()
	return parsedTemplate, templateErr
}

func init() {
	funcMap := template.FuncMap{
		"formatTime": formatTime,
		"percent":    func(value uint64, total uint64) string { return fmt.Sprintf("%.2f", float64(value)/float64(total)*100) },
		"color":      getColor,
		"truncate":   func(s string, n int) string { if len(s) > n { return s[:n-3] + "..." }; return s },
	}

	parsedTemplate, templateErr = template.New("flamegraph").Funcs(funcMap).Parse(htmlTemplate)
}

func GenerateFlameGraph(stats []*db.SyscallStats, outputPath string) error {
	ctx, cancel := context.WithTimeout(context.Background(), flamegraphTimeout)
	defer cancel()

	done := make(chan error, 1)

	go func() {
		done <- generateFlameGraphInternal(stats, outputPath)
	}()

	select {
	case <-ctx.Done():
		return fmt.Errorf("flamegraph generation timed out after %v", flamegraphTimeout)
	case err := <-done:
		return err
	}
}

func generateFlameGraphInternal(stats []*db.SyscallStats, outputPath string) error {
	if len(stats) == 0 {
		return fmt.Errorf("no statistics available to generate flamegraph")
	}

	if err := os.MkdirAll(filepath.Dir(outputPath), 0755); err != nil {
		return fmt.Errorf("failed to create output directory: %w", err)
	}

	sortedStats := make([]*db.SyscallStats, len(stats))
	copy(sortedStats, stats)
	sort.Slice(sortedStats, func(i, j int) bool {
		return sortedStats[i].TotalTime > sortedStats[j].TotalTime
	})

	if len(sortedStats) > maxNodes {
		sortedStats = sortedStats[:maxNodes]
	}

	totalTime := uint64(0)
	for _, s := range sortedStats {
		totalTime += s.TotalTime
	}

	if totalTime == 0 {
		return fmt.Errorf("total time is zero")
	}

	nodes := make([]*flamegraphNode, 0, len(sortedStats))
	xOffset := float64(0)
	width := 800

	for _, s := range sortedStats {
		if s.TotalTime == 0 {
			continue
		}
		nodeWidth := (float64(s.TotalTime) / float64(totalTime)) * float64(width)
		nodes = append(nodes, &flamegraphNode{
			Name:   s.SyscallName,
			Value:  s.TotalTime,
			Depth:  0,
			StartX: xOffset,
			Width:  nodeWidth,
		})
		xOffset += nodeWidth
	}

	data := &flamegraphData{
		Nodes:      nodes,
		Total:      totalTime,
		Width:      width,
		Height:     300,
		CellHeight: 30,
		MaxDepth:   1,
	}

	return generateHTML(data, outputPath)
}

func generateHTML(data *flamegraphData, outputPath string) error {
	tmpl, err := getTemplate()
	if err != nil {
		return fmt.Errorf("failed to parse template: %w", err)
	}

	file, err := os.Create(outputPath)
	if err != nil {
		return fmt.Errorf("failed to create output file: %w", err)
	}
	defer file.Close()

	var buf bytes.Buffer
	if err := tmpl.Execute(&buf, data); err != nil {
		return fmt.Errorf("failed to execute template: %w", err)
	}

	if _, err := file.Write(buf.Bytes()); err != nil {
		return fmt.Errorf("failed to write file: %w", err)
	}

	return nil
}

func formatTime(ns uint64) string {
	switch {
	case ns >= 1000000000:
		return fmt.Sprintf("%.2f s", float64(ns)/1000000000.0)
	case ns >= 1000000:
		return fmt.Sprintf("%.2f ms", float64(ns)/1000000.0)
	case ns >= 1000:
		return fmt.Sprintf("%.2f us", float64(ns)/1000.0)
	default:
		return fmt.Sprintf("%d ns", ns)
	}
}

func getColor(name string) string {
	hash := 0
	for i, c := range name {
		hash = (hash*31 + int(c)) & 0xffff
		if i > 50 {
			break
		}
	}
	
	hue := float64(hash % 360)
	saturation := 0.7 + 0.3*math.Sin(float64(hash)/100)
	lightness := 0.45 + 0.15*math.Cos(float64(hash)/50)
	
	return hslToHex(hue, saturation, lightness)
}

func hslToHex(h, s, l float64) string {
	c := (1 - math.Abs(2*l-1)) * s
	x := c * (1 - math.Abs(math.Mod(h/60, 2)-1))
	m := l - c/2

	var r, g, b float64
	switch {
	case h < 60:
		r, g, b = c, x, 0
	case h < 120:
		r, g, b = x, c, 0
	case h < 180:
		r, g, b = 0, c, x
	case h < 240:
		r, g, b = 0, x, c
	case h < 300:
		r, g, b = x, 0, c
	default:
		r, g, b = c, 0, x
	}

	return fmt.Sprintf("#%02x%02x%02x",
		int((r+m)*255),
		int((g+m)*255),
		int((b+m)*255))
}

func GenerateTextFlameGraph(stats []*db.SyscallStats) string {
	if len(stats) == 0 {
		return "No data available"
	}

	sortedStats := make([]*db.SyscallStats, len(stats))
	copy(sortedStats, stats)
	sort.Slice(sortedStats, func(i, j int) bool {
		return sortedStats[i].TotalTime > sortedStats[j].TotalTime
	})

	if len(sortedStats) > 50 {
		sortedStats = sortedStats[:50]
	}

	totalTime := uint64(0)
	for _, s := range sortedStats {
		totalTime += s.TotalTime
	}

	if totalTime == 0 {
		return "No timing data available"
	}

	maxCountLen := 0
	maxNameLen := 0
	for _, s := range sortedStats {
		nameLen := len(s.SyscallName)
		if nameLen > 20 {
			nameLen = 20
		}
		if nameLen > maxNameLen {
			maxNameLen = nameLen
		}
		countStr := fmt.Sprintf("%d", s.Count)
		if len(countStr) > maxCountLen {
			maxCountLen = len(countStr)
		}
	}
	if maxNameLen > 20 {
		maxNameLen = 20
	}

	var builder strings.Builder
	builder.Grow(4096)

	builder.WriteString("\n" + strings.Repeat("=", 100) + "\n")
	builder.WriteString("  System Call Flame Graph (Text Mode)\n")
	builder.WriteString(strings.Repeat("=", 100) + "\n")
	builder.WriteString(fmt.Sprintf("  Total Time: %s\n\n", formatTime(totalTime)))
	builder.WriteString(fmt.Sprintf("  %-*s  %-*s  %-15s  %-6s  Bar\n",
		maxNameLen+2, "Syscall", maxCountLen, "Count", "Total", "%"))
	builder.WriteString(strings.Repeat("-", 100) + "\n")

	for _, s := range sortedStats {
		percent := float64(s.TotalTime) / float64(totalTime) * 100
		barLen := int(float64(maxBarLen) * float64(s.TotalTime) / float64(totalTime))
		if barLen < 1 && s.TotalTime > 0 {
			barLen = 1
		}
		if barLen > maxBarLen {
			barLen = maxBarLen
		}

		name := s.SyscallName
		if len(name) > 20 {
			name = name[:17] + "..."
		}

		var bar string
		if barLen > 0 {
			bar = strings.Repeat("█", barLen)
		} else {
			bar = ""
		}

		builder.WriteString(fmt.Sprintf("  %-*s  %*d  %-15s  %5.2f%%  %s\n",
			maxNameLen+2, name,
			maxCountLen, s.Count,
			formatTime(s.TotalTime),
			percent,
			bar))
	}

	builder.WriteString(strings.Repeat("=", 100) + "\n")
	return builder.String()
}

const htmlTemplate = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>System Call Flame Graph</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            margin: 20px;
            background-color: #1a1a2e;
            color: #eee;
        }
        .container {
            max-width: 900px;
            margin: 0 auto;
        }
        h1 {
            text-align: center;
            color: #00d4ff;
        }
        .stats {
            background: #16213e;
            padding: 15px;
            border-radius: 8px;
            margin-bottom: 20px;
            text-align: center;
        }
        .flamegraph-container {
            background: #0f3460;
            border-radius: 8px;
            padding: 20px;
            overflow-x: auto;
        }
        .bar {
            position: absolute;
            display: flex;
            align-items: center;
            justify-content: center;
            overflow: hidden;
            font-size: 11px;
            font-weight: 500;
            cursor: pointer;
            transition: opacity 0.2s;
            border: 1px solid rgba(255,255,255,0.1);
            box-sizing: border-box;
        }
        .bar:hover {
            opacity: 0.8;
            z-index: 100;
        }
        .bar-label {
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            padding: 0 4px;
            text-shadow: 0 1px 2px rgba(0,0,0,0.5);
        }
        .axis {
            display: flex;
            justify-content: space-between;
            margin-top: 10px;
            font-size: 12px;
            color: #888;
        }
        .legend {
            margin-top: 20px;
            display: flex;
            flex-wrap: wrap;
            gap: 10px;
            justify-content: center;
        }
        .legend-item {
            display: flex;
            align-items: center;
            gap: 5px;
            font-size: 12px;
        }
        .legend-color {
            width: 16px;
            height: 16px;
            border-radius: 3px;
        }
        .tooltip {
            position: fixed;
            background: rgba(0,0,0,0.9);
            color: white;
            padding: 8px 12px;
            border-radius: 6px;
            font-size: 12px;
            pointer-events: none;
            z-index: 1000;
            display: none;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>&#128269; System Call Flame Graph</h1>
        
        <div class="stats">
            <strong>Total Execution Time:</strong> {{.Total | formatTime}} &nbsp;&nbsp;|&nbsp;&nbsp;
            <strong>System Calls:</strong> {{len .Nodes}}
        </div>

        <div class="flamegraph-container">
            <div id="flamegraph" style="position: relative; width: {{.Width}}px; height: {{.CellHeight}}px;">
                {{range $index, $node := .Nodes}}
                <div class="bar" 
                     style="left: {{$node.StartX}}px; width: {{$node.Width}}px; height: {{$.CellHeight}}px; background-color: {{$node.Name | color}}; bottom: 0;"
                     data-name="{{$node.Name}}"
                     data-value="{{$node.Value}}"
                     data-percent="{{percent $node.Value $.Total}}"
                     onmouseover="showTooltip(event, this)"
                     onmouseout="hideTooltip()">
                    <span class="bar-label">{{truncate $node.Name 12}}</span>
                </div>
                {{end}}
            </div>
            <div class="axis">
                <span>0%</span>
                <span>25%</span>
                <span>50%</span>
                <span>75%</span>
                <span>100%</span>
            </div>
        </div>

        <div class="legend">
            {{range $index, $node := .Nodes}}
            <div class="legend-item">
                <div class="legend-color" style="background-color: {{$node.Name | color}};"></div>
                <span>{{$node.Name}} ({{percent $node.Value $.Total}}%)</span>
            </div>
            {{end}}
        </div>
    </div>

    <div id="tooltip" class="tooltip"></div>

    <script>
        function showTooltip(event, element) {
            const tooltip = document.getElementById('tooltip');
            const name = element.dataset.name;
            const value = parseInt(element.dataset.value);
            const percent = element.dataset.percent;
            
            function formatTime(ns) {
                if (ns >= 1000000000) return (ns / 1000000000).toFixed(2) + ' s';
                if (ns >= 1000000) return (ns / 1000000).toFixed(2) + ' ms';
                if (ns >= 1000) return (ns / 1000).toFixed(2) + ' us';
                return ns + ' ns';
            }
            
            tooltip.innerHTML = '<strong>' + name + '</strong><br/>' +
                               'Time: ' + formatTime(value) + '<br/>' +
                               'Percent: ' + percent + '%';
            
            tooltip.style.display = 'block';
            tooltip.style.left = (event.clientX + 15) + 'px';
            tooltip.style.top = (event.clientY + 15) + 'px';
        }

        function hideTooltip() {
            document.getElementById('tooltip').style.display = 'none';
        }
    </script>
</body>
</html>
`
