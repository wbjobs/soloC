package main

import (
	"bytes"
	"compress/gzip"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

const uploadDir = "./uploads"

func init() {
	os.MkdirAll(uploadDir, 0755)
}

func uploadRecording(c *gin.Context) {
	uploadType := c.PostForm("type")
	
	if uploadType == "chunk" {
		uploadChunk(c)
		return
	}

	if uploadType == "complete" {
		completeUpload(c)
		return
	}

	uploadSingleFile(c)
}

func uploadSingleFile(c *gin.Context) {
	file, err := c.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "未找到文件"})
		return
	}

	src, err := file.Open()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "无法打开文件"})
		return
	}
	defer src.Close()

	tempPath := filepath.Join(uploadDir, uuid.New().String())
	dst, err := os.Create(tempPath)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "创建临时文件失败"})
		return
	}
	defer dst.Close()
	defer os.Remove(tempPath)

	buf := make([]byte, 32*1024)
	written, err := io.CopyBuffer(dst, src, buf)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "写入文件失败: " + err.Error()})
		return
	}

	dst.Close()
	fileReader, err := os.Open(tempPath)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "读取文件失败"})
		return
	}
	defer fileReader.Close()

	recordingID := uuid.New().String()
	
	recording := Recording{
		ID:          recordingID,
		Filename:    file.Filename,
		Size:        written,
		Description: c.PostForm("description"),
		Tags:        c.PostForm("tags"),
	}

	headerData := make([]byte, 4096)
	n, _ := fileReader.Read(headerData)
	if n > 0 {
		reader, err := gzip.NewReader(bytes.NewReader(headerData[:n]))
		if err == nil {
			decompressed, _ := io.ReadAll(reader)
			reader.Close()

			var header struct {
				Header struct {
					Shell      string  `json:"shell"`
					Duration   float64 `json:"duration"`
					EventCount int     `json:"event_count"`
					Cols       int     `json:"cols"`
					Rows       int     `json:"rows"`
					Encrypted  bool    `json:"encrypted"`
				} `json:"header"`
			}
			if err := json.Unmarshal(decompressed, &header); err == nil {
				recording.Shell = header.Header.Shell
				recording.Duration = header.Header.Duration
				recording.EventCount = header.Header.EventCount
				recording.Cols = header.Header.Cols
				recording.Rows = header.Header.Rows
				recording.Encrypted = header.Header.Encrypted
			}
		}
	}

	fileReader.Seek(0, io.SeekStart)
	if err := minioClient.UploadFile(c.Request.Context(), recordingID, fileReader, written); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "上传文件失败: " + err.Error()})
		return
	}

	if err := db.Create(&recording).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "保存元数据失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message":  "上传成功",
		"id":       recording.ID,
		"filename": recording.Filename,
		"size":     written,
	})
}

func uploadChunk(c *gin.Context) {
	uploadID := c.PostForm("upload_id")
	chunkIndex, _ := strconv.Atoi(c.PostForm("chunk_index"))
	totalChunks, _ := strconv.Atoi(c.PostForm("total_chunks"))
	checksum := c.PostForm("checksum")

	if uploadID == "" {
		uploadID = uuid.New().String()
	}

	chunkDir := filepath.Join(uploadDir, uploadID)
	os.MkdirAll(chunkDir, 0755)

	file, _, err := c.Request.FormFile("chunk")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "未找到分片文件"})
		return
	}
	defer file.Close()

	chunkData, err := io.ReadAll(file)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "读取分片失败"})
		return
	}

	if checksum != "" {
		hash := sha256.Sum256(chunkData)
		if hex.EncodeToString(hash[:]) != checksum {
			c.JSON(http.StatusBadRequest, gin.H{"error": "分片校验和不匹配"})
			return
		}
	}

	chunkPath := filepath.Join(chunkDir, fmt.Sprintf("chunk_%d", chunkIndex))
	if err := os.WriteFile(chunkPath, chunkData, 0644); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "保存分片失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"upload_id":    uploadID,
		"chunk_index":  chunkIndex,
		"total_chunks": totalChunks,
		"received":     chunkIndex + 1,
	})
}

func completeUpload(c *gin.Context) {
	uploadID := c.PostForm("upload_id")
	filename := c.PostForm("filename")
	totalChunks, _ := strconv.Atoi(c.PostForm("total_chunks"))
	totalChecksum := c.PostForm("checksum")

	chunkDir := filepath.Join(uploadDir, uploadID)
	defer os.RemoveAll(chunkDir)

	mergedPath := filepath.Join(uploadDir, uploadID+"_merged")
	mergedFile, err := os.Create(mergedPath)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "创建合并文件失败"})
		return
	}
	defer mergedFile.Close()
	defer os.Remove(mergedPath)

	hasher := sha256.New()
	for i := 0; i < totalChunks; i++ {
		chunkPath := filepath.Join(chunkDir, fmt.Sprintf("chunk_%d", i))
		chunkData, err := os.ReadFile(chunkPath)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("缺少分片 %d", i)})
			return
		}
		
		mergedFile.Write(chunkData)
		hasher.Write(chunkData)
	}

	mergedFile.Close()

	if totalChecksum != "" {
		finalHash := hex.EncodeToString(hasher.Sum(nil))
		if finalHash != totalChecksum {
			c.JSON(http.StatusBadRequest, gin.H{"error": "文件校验和不匹配"})
			return
		}
	}

	fileInfo, err := os.Stat(mergedPath)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "获取文件信息失败"})
		return
	}

	fileReader, err := os.Open(mergedPath)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "读取合并文件失败"})
		return
	}
	defer fileReader.Close()

	recordingID := uuid.New().String()
	
	recording := Recording{
		ID:          recordingID,
		Filename:    filename,
		Size:        fileInfo.Size(),
		Description: c.PostForm("description"),
		Tags:        c.PostForm("tags"),
	}

	headerData := make([]byte, 4096)
	n, _ := fileReader.Read(headerData)
	if n > 0 {
		reader, err := gzip.NewReader(bytes.NewReader(headerData[:n]))
		if err == nil {
			decompressed, _ := io.ReadAll(reader)
			reader.Close()

			var header struct {
				Header struct {
					Shell      string  `json:"shell"`
					Duration   float64 `json:"duration"`
					EventCount int     `json:"event_count"`
					Cols       int     `json:"cols"`
					Rows       int     `json:"rows"`
					Encrypted  bool    `json:"encrypted"`
				} `json:"header"`
			}
			if err := json.Unmarshal(decompressed, &header); err == nil {
				recording.Shell = header.Header.Shell
				recording.Duration = header.Header.Duration
				recording.EventCount = header.Header.EventCount
				recording.Cols = header.Header.Cols
				recording.Rows = header.Header.Rows
				recording.Encrypted = header.Header.Encrypted
			}
		}
	}

	fileReader.Seek(0, io.SeekStart)
	if err := minioClient.UploadFile(c.Request.Context(), recordingID, fileReader, fileInfo.Size()); err != nil {
		log.Printf("MinIO 上传失败: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "上传文件失败: " + err.Error()})
		return
	}

	if err := db.Create(&recording).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "保存元数据失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message":  "上传成功",
		"id":       recording.ID,
		"filename": recording.Filename,
		"size":     fileInfo.Size(),
	})
}

func downloadRecording(c *gin.Context) {
	id := c.Param("id")

	var recording Recording
	if err := db.First(&recording, "id = ?", id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "录制不存在"})
		return
	}

	obj, err := minioClient.DownloadFile(c.Request.Context(), id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "下载文件失败"})
		return
	}
	defer obj.Close()

	c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=%s", recording.Filename))
	c.Header("Content-Type", "application/octet-stream")
	c.Header("Content-Length", fmt.Sprintf("%d", recording.Size))
	c.Header("Accept-Ranges", "bytes")

	buf := make([]byte, 32*1024)
	written, err := io.CopyBuffer(c.Writer, obj, buf)
	if err != nil {
		log.Printf("下载中断: %v, 已传输: %d bytes", err, written)
		return
	}
}

func listRecordings(c *gin.Context) {
	var recordings []Recording
	if err := db.Order("created_at desc").Find(&recordings).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "查询失败"})
		return
	}
	c.JSON(http.StatusOK, recordings)
}

func getRecording(c *gin.Context) {
	id := c.Param("id")

	var recording Recording
	if err := db.First(&recording, "id = ?", id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "录制不存在"})
		return
	}

	c.JSON(http.StatusOK, recording)
}

func deleteRecording(c *gin.Context) {
	id := c.Param("id")

	var recording Recording
	if err := db.First(&recording, "id = ?", id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "录制不存在"})
		return
	}

	if err := minioClient.DeleteFile(c.Request.Context(), id); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "删除文件失败"})
		return
	}

	if err := db.Delete(&recording).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "删除记录失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "删除成功"})
}

func createShareLink(c *gin.Context) {
	id := c.Param("id")

	var recording Recording
	if err := db.First(&recording, "id = ?", id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "录制不存在"})
		return
	}

	var req struct {
		ExpireHours int `json:"expire_hours"`
		MaxViews    int `json:"max_views"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		req.ExpireHours = 24
		req.MaxViews = 0
	}

	share := ShareToken{
		RecordingID: id,
		ExpiresAt:   time.Now().Add(time.Duration(req.ExpireHours) * time.Hour),
		MaxViews:    req.MaxViews,
		Views:       0,
	}

	if err := db.Create(&share).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "创建分享链接失败"})
		return
	}

	scheme := "http"
	if c.Request.TLS != nil {
		scheme = "https"
	}
	shareURL := fmt.Sprintf("%s://%s/api/share/%s", scheme, c.Request.Host, share.Token)

	c.JSON(http.StatusOK, gin.H{
		"share_url": shareURL,
		"token":     share.Token,
		"expires_at": share.ExpiresAt,
		"max_views": share.MaxViews,
	})
}

func accessShareLink(c *gin.Context) {
	token := c.Param("token")

	var share ShareToken
	if err := db.First(&share, "token = ?", token).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "分享链接无效"})
		return
	}

	if time.Now().After(share.ExpiresAt) {
		c.JSON(http.StatusGone, gin.H{"error": "分享链接已过期"})
		return
	}

	if share.MaxViews > 0 && share.Views >= share.MaxViews {
		c.JSON(http.StatusForbidden, gin.H{"error": "分享链接已达到最大访问次数"})
		return
	}

	share.Views++
	db.Save(&share)

	var recording Recording
	if err := db.First(&recording, "id = ?", share.RecordingID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "录制不存在"})
		return
	}

	obj, err := minioClient.DownloadFile(c.Request.Context(), recording.ID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "下载文件失败"})
		return
	}
	defer obj.Close()

	data, err := io.ReadAll(obj)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "读取文件失败"})
		return
	}

	c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=%s", recording.Filename))
	c.Header("Content-Type", "application/octet-stream")
	c.Data(http.StatusOK, "application/octet-stream", data)
}

func searchRecordings(c *gin.Context) {
	query := c.Query("q")
	if query == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请提供搜索关键词"})
		return
	}

	var recordings []Recording
	if err := db.Where(
		"filename LIKE ? OR description LIKE ? OR tags LIKE ? OR shell LIKE ?",
		"%"+query+"%", "%"+query+"%", "%"+query+"%", "%"+query+"%",
	).Order("created_at desc").Find(&recordings).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "搜索失败"})
		return
	}

	c.JSON(http.StatusOK, recordings)
}

func setRecordingPermissions(c *gin.Context) {
	id := c.Param("id")

	var req struct {
		IsPublic bool   `json:"is_public"`
		OwnerID  string `json:"owner_id"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请求格式错误"})
		return
	}

	var recording Recording
	if err := db.First(&recording, "id = ?", id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "录制不存在"})
		return
	}

	recording.IsPublic = req.IsPublic
	if req.OwnerID != "" {
		recording.OwnerID = req.OwnerID
	}

	if err := db.Save(&recording).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "保存权限设置失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message":   "权限设置成功",
		"is_public": recording.IsPublic,
		"owner_id":  recording.OwnerID,
	})
}

func addAnnotation(c *gin.Context) {
	id := c.Param("id")

	var req struct {
		Timestamp float64 `json:"timestamp" binding:"required"`
		Text      string  `json:"text" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请求格式错误"})
		return
	}

	var recording Recording
	if err := db.First(&recording, "id = ?", id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "录制不存在"})
		return
	}

	annotations, err := recording.GetAnnotations()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "读取注释失败"})
		return
	}

	newAnnotation := Annotation{
		ID:        uuid.New().String(),
		Timestamp: req.Timestamp,
		Text:      req.Text,
		CreatedAt: time.Now().Format(time.RFC3339),
	}

	annotations = append(annotations, newAnnotation)

	if err := recording.SetAnnotations(annotations); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "保存注释失败"})
		return
	}

	if err := db.Save(&recording).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "保存失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message":    "注释添加成功",
		"annotation": newAnnotation,
	})
}

func deleteAnnotation(c *gin.Context) {
	id := c.Param("id")
	annotationID := c.Param("annotation_id")

	var recording Recording
	if err := db.First(&recording, "id = ?", id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "录制不存在"})
		return
	}

	annotations, err := recording.GetAnnotations()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "读取注释失败"})
		return
	}

	newAnnotations := []Annotation{}
	found := false
	for _, ann := range annotations {
		if ann.ID != annotationID {
			newAnnotations = append(newAnnotations, ann)
		} else {
			found = true
		}
	}

	if !found {
		c.JSON(http.StatusNotFound, gin.H{"error": "注释不存在"})
		return
	}

	if err := recording.SetAnnotations(newAnnotations); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "保存注释失败"})
		return
	}

	if err := db.Save(&recording).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "保存失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "注释删除成功"})
}

func getAnnotations(c *gin.Context) {
	id := c.Param("id")

	var recording Recording
	if err := db.First(&recording, "id = ?", id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "录制不存在"})
		return
	}

	annotations, err := recording.GetAnnotations()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "读取注释失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"annotations": annotations,
	})
}

func trimRecording(c *gin.Context) {
	id := c.Param("id")

	var req struct {
		StartTime float64 `json:"start_time" binding:"required"`
		EndTime   float64 `json:"end_time" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请求格式错误: " + err.Error()})
		return
	}

	var recording Recording
	if err := db.First(&recording, "id = ?", id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "录制不存在"})
		return
	}

	obj, err := minioClient.DownloadFile(c.Request.Context(), id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "下载原文件失败"})
		return
	}
	defer obj.Close()

	data, err := io.ReadAll(obj)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "读取文件失败"})
		return
	}

	reader, err := gzip.NewReader(bytes.NewReader(data))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "解压文件失败"})
		return
	}
	defer reader.Close()

	decompressed, err := io.ReadAll(reader)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "读取解压数据失败"})
		return
	}

	var recordingData struct {
		Header   map[string]interface{} `json:"header"`
		Events   []json.RawMessage      `json:"events"`
		RawEvents []map[string]interface{}
	}

	if err := json.Unmarshal(decompressed, &recordingData); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "解析录制数据失败"})
		return
	}

	var events []map[string]interface{}
	for _, rawEvent := range recordingData.Events {
		var event map[string]interface{}
		if err := json.Unmarshal(rawEvent, &event); err != nil {
			continue
		}
		events = append(events, event)
	}

	trimmedEvents := []map[string]interface{}{}
	timeOffset := req.StartTime

	for _, event := range events {
		timestamp, ok := event["timestamp"].(float64)
		if !ok {
			continue
		}

		if timestamp >= req.StartTime && timestamp <= req.EndTime {
			event["timestamp"] = timestamp - timeOffset
			trimmedEvents = append(trimmedEvents, event)
		}
	}

	if recordingData.Header == nil {
		recordingData.Header = make(map[string]interface{})
	}
	recordingData.Header["duration"] = req.EndTime - req.StartTime
	recordingData.Header["event_count"] = len(trimmedEvents)
	recordingData.Header["trimmed"] = true
	recordingData.Header["original_duration"] = recording.Duration

	newRecordingData := map[string]interface{}{
		"header": recordingData.Header,
		"events": trimmedEvents,
	}

	trimmedJSON, err := json.Marshal(newRecordingData)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "序列化裁剪数据失败"})
		return
	}

	var compressedBuffer bytes.Buffer
	gzipWriter := gzip.NewWriter(&compressedBuffer)
	if _, err := gzipWriter.Write(trimmedJSON); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "压缩失败"})
		return
	}
	gzipWriter.Close()

	trimmedID := uuid.New().String()
	trimmedFilename := "trimmed_" + recording.Filename

	if err := minioClient.UploadFile(
		c.Request.Context(),
		trimmedID,
		bytes.NewReader(compressedBuffer.Bytes()),
		int64(compressedBuffer.Len()),
	); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "上传裁剪文件失败"})
		return
	}

	trimmedRecording := Recording{
		ID:          trimmedID,
		Filename:    trimmedFilename,
		Size:        int64(compressedBuffer.Len()),
		Shell:       recording.Shell,
		Duration:    req.EndTime - req.StartTime,
		EventCount:  len(trimmedEvents),
		Cols:        recording.Cols,
		Rows:        recording.Rows,
		Encrypted:   recording.Encrypted,
		Description: recording.Description + " (裁剪)",
		Tags:        recording.Tags,
		IsPublic:    recording.IsPublic,
		OwnerID:     recording.OwnerID,
	}

	if err := db.Create(&trimmedRecording).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "保存裁剪记录失败"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message":      "裁剪成功",
		"trimmed_id":   trimmedID,
		"filename":     trimmedFilename,
		"duration":     trimmedRecording.Duration,
		"event_count":  len(trimmedEvents),
		"start_time":   req.StartTime,
		"end_time":     req.EndTime,
	})
}

func downloadRecordingStream(c *gin.Context) {
	id := c.Param("id")

	var recording Recording
	if err := db.First(&recording, "id = ?", id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "录制不存在"})
		return
	}

	if !recording.IsPublic {
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "需要授权"})
			return
		}
	}

	obj, err := minioClient.DownloadFile(c.Request.Context(), id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "下载文件失败"})
		return
	}
	defer obj.Close()

	c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=%s", recording.Filename))
	c.Header("Content-Type", "application/octet-stream")
	c.Header("Content-Length", fmt.Sprintf("%d", recording.Size))
	c.Header("Accept-Ranges", "bytes")
	c.Header("Cache-Control", "public, max-age=3600")

	buf := make([]byte, 64*1024)
	written, err := io.CopyBuffer(c.Writer, obj, buf)
	if err != nil {
		log.Printf("流式下载中断: %v, 已传输: %d bytes", err, written)
		return
	}
}

func getRecordingHeader(c *gin.Context) {
	id := c.Param("id")

	var recording Recording
	if err := db.First(&recording, "id = ?", id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "录制不存在"})
		return
	}

	if !recording.IsPublic {
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "需要授权"})
			return
		}
	}

	annotations, _ := recording.GetAnnotations()

	c.JSON(http.StatusOK, gin.H{
		"id":          recording.ID,
		"filename":    recording.Filename,
		"size":        recording.Size,
		"shell":       recording.Shell,
		"duration":    recording.Duration,
		"event_count": recording.EventCount,
		"cols":        recording.Cols,
		"rows":        recording.Rows,
		"encrypted":   recording.Encrypted,
		"created_at":  recording.CreatedAt,
		"description": recording.Description,
		"tags":        recording.Tags,
		"is_public":   recording.IsPublic,
		"annotations": annotations,
	})
}
