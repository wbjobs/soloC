package main

import (
	"fmt"
	"log"
	"os"
	"os/signal"
	"path/filepath"
	"runtime"
	"strconv"
	"syscall"
	"time"

	"github.com/spf13/cobra"

	"syscalltracer/internal/db"
	ebpfpkg "syscalltracer/internal/ebpf"
	"syscalltracer/internal/export"
	"syscalltracer/internal/flamegraph"
	"syscalltracer/internal/ui"
)

var (
	dbPath       string
	targetPIDs   []string
	monitorAll   bool
	outputPath   string
	refreshRate  int
	useSimulate  bool
	showArgs     bool
	exportStats  bool
	limitEvents  int
)

func main() {
	var rootCmd = &cobra.Command{
		Use:   "syscalltracer",
		Short: "eBPF-based system call tracer",
		Long:  `A powerful system call tracing tool using eBPF for kernel-space tracing and Go for user-space processing.`,
	}

	rootCmd.PersistentFlags().StringVarP(&dbPath, "database", "d",
		filepath.Join(os.TempDir(), "syscalltracer.db"),
		"Path to SQLite database file")

	var traceCmd = &cobra.Command{
		Use:   "trace",
		Short: "Start tracing system calls",
		Long:  `Start tracing system calls for specified PIDs or all processes.`,
		Run:   runTrace,
	}

	traceCmd.Flags().StringSliceVarP(&targetPIDs, "pid", "p", []string{},
		"Target process IDs to trace (comma-separated or repeated)")
	traceCmd.Flags().BoolVarP(&monitorAll, "all", "a", false,
		"Monitor all processes (requires root on Linux)")
	traceCmd.Flags().IntVarP(&refreshRate, "refresh", "r", 1,
		"Refresh rate in seconds for real-time display")
	traceCmd.Flags().BoolVarP(&useSimulate, "simulate", "s", false,
		"Use simulated mode (useful for testing on non-Linux or without root)")
	traceCmd.Flags().BoolVarP(&showArgs, "args", "", false,
		"Show decoded system call arguments in real-time output")

	var statsCmd = &cobra.Command{
		Use:   "stats",
		Short: "Show statistics from database",
		Long:  `Display system call statistics from the SQLite database.`,
		Run:   runStats,
	}

	var eventsCmd = &cobra.Command{
		Use:   "events",
		Short: "Show recent events with decoded arguments",
		Long:  `Display recent system call events with full argument decoding.`,
		Run:   runEvents,
	}

	eventsCmd.Flags().IntVarP(&limitEvents, "limit", "n", 50,
		"Number of events to display")

	var flameCmd = &cobra.Command{
		Use:   "flamegraph",
		Short: "Generate system call flame graph",
		Long:  `Generate an HTML flame graph or text visualization of system call usage.`,
		Run:   runFlameGraph,
	}

	flameCmd.Flags().StringVarP(&outputPath, "output", "o", "flamegraph.html",
		"Output path for HTML flame graph")

	var exportCmd = &cobra.Command{
		Use:   "export",
		Short: "Export data to various formats",
		Long:  `Export tracing data to CSV or other formats.`,
	}

	var exportCsvCmd = &cobra.Command{
		Use:   "csv",
		Short: "Export events to CSV",
		Long:  `Export all system call events to a CSV file with decoded arguments.`,
		Run:   runExportCSV,
	}

	exportCsvCmd.Flags().StringVarP(&outputPath, "output", "o", "syscalls.csv",
		"Output path for CSV file")
	exportCsvCmd.Flags().BoolVarP(&exportStats, "stats", "", false,
		"Export statistics instead of raw events")

	exportCmd.AddCommand(exportCsvCmd)

	rootCmd.AddCommand(traceCmd, statsCmd, eventsCmd, flameCmd, exportCmd)

	if err := rootCmd.Execute(); err != nil {
		log.Fatal(err)
	}
}

func runTrace(cmd *cobra.Command, args []string) {
	if runtime.GOOS != "linux" && !useSimulate {
		fmt.Println("Note: Running on non-Linux system, enabling simulation mode...")
		useSimulate = true
	}

	if !useSimulate && os.Geteuid() != 0 {
		fmt.Println("Note: Running without root privileges, enabling simulation mode...")
		useSimulate = true
	}

	if !useSimulate && !monitorAll && len(targetPIDs) == 0 {
		log.Fatal("Please specify --pid, --all flag, or use --simulate")
	}

	database, err := db.NewDatabase(dbPath)
	if err != nil {
		log.Fatalf("Failed to initialize database: %v", err)
	}
	defer database.Close()

	fmt.Printf("Database initialized at: %s\n", dbPath)

	var tracer *ebpfpkg.Tracer
	if useSimulate {
		fmt.Println("Running in SIMULATION mode (no actual eBPF tracing)")
		tracer = ebpfpkg.NewSimulatedTracer()
	} else {
		tracer, err = ebpfpkg.NewTracer()
		if err != nil {
			log.Fatalf("Failed to create tracer: %v", err)
		}
	}
	defer tracer.Close()

	if err := tracer.Load(); err != nil {
		log.Fatalf("Failed to load eBPF program: %v", err)
	}

	if monitorAll {
		fmt.Println("Monitoring ALL processes...")
		if err := tracer.MonitorAll(); err != nil {
			log.Fatalf("Failed to enable all-process monitoring: %v", err)
		}
	} else {
		for _, pidStr := range targetPIDs {
			pid, err := strconv.ParseUint(pidStr, 10, 32)
			if err != nil {
				log.Printf("Invalid PID: %s, skipping", pidStr)
				continue
			}
			fmt.Printf("Monitoring PID: %d\n", pid)
			if err := tracer.AddTargetPID(uint32(pid)); err != nil {
				log.Printf("Failed to add PID %d: %v", pid, err)
			}
		}
	}

	if err := tracer.Start(); err != nil {
		log.Fatalf("Failed to start tracer: %v", err)
	}

	if tracer.IsSimulated() {
		fmt.Println("Tracing simulation started. Press Ctrl+C to stop.")
	} else {
		fmt.Println("Tracing started. Press Ctrl+C to stop.")
	}

	if showArgs {
		fmt.Println("Argument decoding enabled - will show decoded args in console")
	}

	rtStats := ui.NewRealtimeStats()
	startTime := time.Now()
	var eventsBatch []*db.SyscallEvent
	batchSize := 100

	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)

	ticker := time.NewTicker(time.Duration(refreshRate) * time.Second)
	defer ticker.Stop()

	go func() {
		for {
			select {
			case event, ok := <-tracer.Events():
				if !ok {
					return
				}

				syscallName := ebpfpkg.GetSyscallName(event.SyscallNr)
				rtStats.Record(syscallName, event.DurationNS)

				dbEvent := &db.SyscallEvent{
					PID:         event.PID,
					TID:         event.TID,
					SyscallNr:   event.SyscallNr,
					SyscallName: syscallName,
					DurationNS:  event.DurationNS,
					Timestamp:   event.Timestamp,
					Ret:         event.Ret,
					Args:        event.Args,
				}

				eventsBatch = append(eventsBatch, dbEvent)
				if len(eventsBatch) >= batchSize {
					if err := database.InsertEvents(eventsBatch); err != nil {
						log.Printf("Warning: failed to insert events: %v", err)
					}
					eventsBatch = nil
				}

				if showArgs {
					decoded := ebpfpkg.DecodeArgs(event.SyscallNr, event.Args, event.Ret)
					argsStr := ebpfpkg.FormatEvent(syscallName, decoded)
					fmt.Printf("[PID=%d] %s (%.2f us)\n", event.PID, argsStr, float64(event.DurationNS)/1000.0)
				}

			case <-ticker.C:
				if len(eventsBatch) > 0 {
					if err := database.InsertEvents(eventsBatch); err != nil {
						log.Printf("Warning: failed to insert events: %v", err)
					}
					eventsBatch = nil
				}

				if !showArgs {
					dbStats, err := database.GetAllStats()
					if err != nil {
						log.Printf("Warning: failed to get stats: %v", err)
						continue
					}
					ui.PrintRealtimeStats(rtStats, dbStats, startTime)
				}
			}
		}
	}()

	<-sigChan
	fmt.Println("\nStopping trace...")

	if len(eventsBatch) > 0 {
		if err := database.InsertEvents(eventsBatch); err != nil {
			log.Printf("Warning: failed to insert events: %v", err)
		}
	}

	count, err := database.GetTotalEventCount()
	if err == nil {
		fmt.Printf("Total events recorded: %d\n", count)
	}

	fmt.Println("\nAvailable commands:")
	fmt.Println("  syscalltracer stats       - View statistics")
	fmt.Println("  syscalltracer events      - View recent events with decoded args")
	fmt.Println("  syscalltracer export csv  - Export to CSV")
	fmt.Println("  syscalltracer flamegraph  - Generate flame graph")
}

func runStats(cmd *cobra.Command, args []string) {
	database, err := db.NewDatabase(dbPath)
	if err != nil {
		log.Fatalf("Failed to initialize database: %v", err)
	}
	defer database.Close()

	stats, err := database.GetAllStats()
	if err != nil {
		log.Fatalf("Failed to get statistics: %v", err)
	}

	if len(stats) == 0 {
		fmt.Println("No data found in database. Run 'syscalltracer trace' first.")
		return
	}

	ui.PrintDatabaseStats(stats)

	count, err := database.GetTotalEventCount()
	if err == nil {
		fmt.Printf("\nTotal events in database: %d\n", count)
	}
}

func runEvents(cmd *cobra.Command, args []string) {
	database, err := db.NewDatabase(dbPath)
	if err != nil {
		log.Fatalf("Failed to initialize database: %v", err)
	}
	defer database.Close()

	err = export.ExportRawEvents(database, "", limitEvents)
	if err != nil {
		log.Fatalf("Failed to export events: %v", err)
	}
}

func runFlameGraph(cmd *cobra.Command, args []string) {
	database, err := db.NewDatabase(dbPath)
	if err != nil {
		log.Fatalf("Failed to initialize database: %v", err)
	}
	defer database.Close()

	stats, err := database.GetAllStats()
	if err != nil {
		log.Fatalf("Failed to get statistics: %v", err)
	}

	if len(stats) == 0 {
		fmt.Println("No data found in database to generate flame graph. Run 'syscalltracer trace' first.")
		return
	}

	fmt.Println(flamegraph.GenerateTextFlameGraph(stats))

	if err := flamegraph.GenerateFlameGraph(stats, outputPath); err != nil {
		log.Printf("Warning: failed to generate HTML flame graph: %v", err)
	} else {
		fmt.Printf("HTML flame graph saved to: %s\n", outputPath)
		absPath, _ := filepath.Abs(outputPath)
		fmt.Printf("Open in browser: file://%s\n", absPath)
	}
}

func runExportCSV(cmd *cobra.Command, args []string) {
	database, err := db.NewDatabase(dbPath)
	if err != nil {
		log.Fatalf("Failed to initialize database: %v", err)
	}
	defer database.Close()

	if exportStats {
		stats, err := database.GetAllStats()
		if err != nil {
			log.Fatalf("Failed to get statistics: %v", err)
		}

		if len(stats) == 0 {
			fmt.Println("No data found in database. Run 'syscalltracer trace' first.")
			return
		}

		if err := export.ExportStatsToCSV(stats, outputPath); err != nil {
			log.Fatalf("Failed to export statistics: %v", err)
		}
	} else {
		count, err := database.GetTotalEventCount()
		if err != nil {
			log.Fatalf("Failed to get event count: %v", err)
		}

		if count == 0 {
			fmt.Println("No data found in database. Run 'syscalltracer trace' first.")
			return
		}

		fmt.Printf("Exporting %d events to CSV...\n", count)
		if err := export.ExportToCSV(database, outputPath); err != nil {
			log.Fatalf("Failed to export to CSV: %v", err)
		}

		absPath, _ := filepath.Abs(outputPath)
		fmt.Printf("File location: %s\n", absPath)
	}
}
