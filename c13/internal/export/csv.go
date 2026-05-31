package export

import (
	"bufio"
	"context"
	"database/sql"
	"encoding/csv"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strconv"
	"time"

	"syscalltracer/internal/db"
	ebpfpkg "syscalltracer/internal/ebpf"
)

const csvTimeout = 5 * time.Minute

func ExportToCSV(database *db.Database, outputPath string) error {
	ctx, cancel := context.WithTimeout(context.Background(), csvTimeout)
	defer cancel()

	done := make(chan error, 1)

	go func() {
		done <- exportToCSVInternal(database, outputPath)
	}()

	select {
	case <-ctx.Done():
		return fmt.Errorf("CSV export timed out after %v", csvTimeout)
	case err := <-done:
		return err
	}
}

func exportToCSVInternal(database *db.Database, outputPath string) error {
	if err := os.MkdirAll(filepath.Dir(outputPath), 0755); err != nil {
		return fmt.Errorf("failed to create output directory: %w", err)
	}

	file, err := os.Create(outputPath)
	if err != nil {
		return fmt.Errorf("failed to create output file: %w", err)
	}
	defer file.Close()

	writer := bufio.NewWriterSize(file, 4*1024*1024)
	defer writer.Flush()

	csvWriter := csv.NewWriter(writer)
	defer csvWriter.Flush()

	headers := []string{
		"id",
		"pid",
		"tid",
		"syscall_nr",
		"syscall_name",
		"duration_ns",
		"duration_us",
		"duration_ms",
		"timestamp",
		"ret",
		"ret_decoded",
		"arg0",
		"arg1",
		"arg2",
		"arg3",
		"arg4",
		"arg5",
		"args_decoded",
		"created_at",
	}

	if err := csvWriter.Write(headers); err != nil {
		return fmt.Errorf("failed to write CSV headers: %w", err)
	}

	rows, err := database.GetAllEventsForExport()
	if err != nil {
		return fmt.Errorf("failed to query events: %w", err)
	}
	defer rows.Close()

	count := 0
	batchSize := 1000
	records := make([][]string, 0, batchSize)

	for rows.Next() {
		var e db.SyscallEvent
		if err := rows.Scan(&e.ID, &e.PID, &e.TID, &e.SyscallNr, &e.SyscallName,
			&e.DurationNS, &e.Timestamp, &e.Ret,
			&e.Args[0], &e.Args[1], &e.Args[2], &e.Args[3], &e.Args[4], &e.Args[5],
			&e.CreatedAt); err != nil {
			return fmt.Errorf("failed to scan row: %w", err)
		}

		decoded := ebpfpkg.DecodeArgs(e.SyscallNr, e.Args, e.Ret)
		argsDecoded := ebpfpkg.FormatEvent(e.SyscallName, decoded)

		record := []string{
			strconv.FormatInt(e.ID, 10),
			strconv.FormatUint(uint64(e.PID), 10),
			strconv.FormatUint(uint64(e.TID), 10),
			strconv.FormatInt(int64(e.SyscallNr), 10),
			e.SyscallName,
			strconv.FormatUint(e.DurationNS, 10),
			fmt.Sprintf("%.2f", float64(e.DurationNS)/1000.0),
			fmt.Sprintf("%.4f", float64(e.DurationNS)/1000000.0),
			strconv.FormatUint(e.Timestamp, 10),
			strconv.FormatInt(e.Ret, 10),
			decoded.RetDecoded,
			strconv.FormatUint(e.Args[0], 10),
			strconv.FormatUint(e.Args[1], 10),
			strconv.FormatUint(e.Args[2], 10),
			strconv.FormatUint(e.Args[3], 10),
			strconv.FormatUint(e.Args[4], 10),
			strconv.FormatUint(e.Args[5], 10),
			argsDecoded,
			e.CreatedAt.Format(time.RFC3339Nano),
		}

		records = append(records, record)
		count++

		if len(records) >= batchSize {
			if err := csvWriter.WriteAll(records); err != nil {
				return fmt.Errorf("failed to write records: %w", err)
			}
			if err := writer.Flush(); err != nil {
				return fmt.Errorf("failed to flush buffer: %w", err)
			}
			records = records[:0]
		}
	}

	if len(records) > 0 {
		if err := csvWriter.WriteAll(records); err != nil {
			return fmt.Errorf("failed to write remaining records: %w", err)
		}
	}

	if err := rows.Err(); err != nil && err != io.EOF {
		return fmt.Errorf("error iterating rows: %w", err)
	}

	csvWriter.Flush()
	if err := csvWriter.Error(); err != nil {
		return fmt.Errorf("CSV writer error: %w", err)
	}

	if err := writer.Flush(); err != nil {
		return fmt.Errorf("failed to flush final buffer: %w", err)
	}

	fileInfo, err := file.Stat()
	if err == nil {
		fmt.Printf("Exported %d events to: %s (%.2f MB)\n",
			count, outputPath, float64(fileInfo.Size())/(1024*1024))
	} else {
		fmt.Printf("Exported %d events to: %s\n", count, outputPath)
	}

	return nil
}

func ExportStatsToCSV(stats []*db.SyscallStats, outputPath string) error {
	if err := os.MkdirAll(filepath.Dir(outputPath), 0755); err != nil {
		return fmt.Errorf("failed to create output directory: %w", err)
	}

	file, err := os.Create(outputPath)
	if err != nil {
		return fmt.Errorf("failed to create output file: %w", err)
	}
	defer file.Close()

	csvWriter := csv.NewWriter(file)
	defer csvWriter.Flush()

	headers := []string{
		"syscall_nr",
		"syscall_name",
		"count",
		"total_time_ns",
		"total_time_us",
		"total_time_ms",
		"avg_time_ns",
		"avg_time_us",
		"avg_time_ms",
	}

	if err := csvWriter.Write(headers); err != nil {
		return fmt.Errorf("failed to write CSV headers: %w", err)
	}

	for _, s := range stats {
		record := []string{
			strconv.FormatInt(int64(s.SyscallNr), 10),
			s.SyscallName,
			strconv.FormatInt(s.Count, 10),
			strconv.FormatUint(s.TotalTime, 10),
			fmt.Sprintf("%.2f", float64(s.TotalTime)/1000.0),
			fmt.Sprintf("%.4f", float64(s.TotalTime)/1000000.0),
			strconv.FormatUint(s.AvgTime, 10),
			fmt.Sprintf("%.2f", float64(s.AvgTime)/1000.0),
			fmt.Sprintf("%.4f", float64(s.AvgTime)/1000000.0),
		}
		if err := csvWriter.Write(record); err != nil {
			return fmt.Errorf("failed to write record: %w", err)
		}
	}

	fmt.Printf("Exported statistics for %d system calls to: %s\n", len(stats), outputPath)
	return nil
}

func ExportRawEvents(database *db.Database, outputPath string, limit int) error {
	events, err := database.GetAllEvents(limit)
	if err != nil {
		return fmt.Errorf("failed to get events: %w", err)
	}

	if len(events) == 0 {
		fmt.Println("No events to export")
		return nil
	}

	for i, e := range events {
		decoded := ebpfpkg.DecodeArgs(e.SyscallNr, e.Args, e.Ret)
		fmt.Printf("[%d] %s (PID=%d, TID=%d) - %s\n",
			i+1,
			ebpfpkg.FormatEvent(e.SyscallName, decoded),
			e.PID,
			e.TID,
			e.CreatedAt.Format("2006-01-02 15:04:05.000000000"))

		fmt.Printf("    Duration: %.2f us, Return: %s\n",
			float64(e.DurationNS)/1000.0,
			decoded.RetDecoded)

		if len(decoded.Args) > 0 {
			fmt.Printf("    Arguments:\n")
			for _, arg := range decoded.Args {
				fmt.Printf("      %s (%s): %s (raw: 0x%x)\n",
					arg.Name, arg.Type, arg.Decoded, arg.RawValue)
			}
		}
		fmt.Println()
	}

	fmt.Printf("Displayed %d events\n", len(events))
	return nil
}

func QueryRows(database *db.Database, query string) (*sql.Rows, error) {
	return nil, nil
}
