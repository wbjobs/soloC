const express = require('express')
const multer = require('multer')
const cors = require('cors')
const ffmpeg = require('fluent-ffmpeg')
const path = require('path')
const fs = require('fs')
const { generateSubtitleASS } = require('./subtitleGenerator')

const app = express()
const PORT = 4000

app.use((req, res, next) => {
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin')
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp')
  next()
})

app.use(cors())
app.use(express.json())

const uploadsDir = path.join(__dirname, 'uploads')
const outputDir = path.join(__dirname, 'output')

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true })
}
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true })
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir)
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9)
    cb(null, uniqueSuffix + path.extname(file.originalname))
  }
})

const upload = multer({ storage: storage })

app.post('/api/export', upload.single('video'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No video file uploaded' })
    }

    const regions = JSON.parse(req.body.regions)
    const videoInfo = JSON.parse(req.body.videoInfo)

    const videoPath = req.file.path
    const assPath = path.join(outputDir, `subtitles-${Date.now()}.ass`)
    const outputPath = path.join(outputDir, `output-${Date.now()}.mp4`)

    const assContent = generateSubtitleASS(regions, videoInfo)
    fs.writeFileSync(assPath, assContent, 'utf8')

    console.log('Starting video processing...')
    console.log('Video path:', videoPath)
    console.log('ASS path:', assPath)
    console.log('Output path:', outputPath)

    ffmpeg(videoPath)
      .videoCodec('libx264')
      .audioCodec('aac')
      .outputOptions([
        '-vf', `ass='${assPath.replace(/\\/g, '/')}'`,
        '-preset', 'medium',
        '-crf', '23',
        '-async', '1',
        '-vsync', '1',
        '-copyts'
      ])
      .on('start', (commandLine) => {
        console.log('FFmpeg command:', commandLine)
      })
      .on('progress', (progress) => {
        console.log('Processing:', Math.round(progress.percent || 0) + '%')
      })
      .on('end', () => {
        console.log('Processing finished successfully')
        
        res.sendFile(outputPath, (err) => {
          if (err) {
            console.error('Send file error:', err)
          }
          
          try {
            fs.unlinkSync(videoPath)
            fs.unlinkSync(assPath)
            fs.unlinkSync(outputPath)
          } catch (cleanupErr) {
            console.error('Cleanup error:', cleanupErr)
          }
        })
      })
      .on('error', (err) => {
        console.error('FFmpeg error:', err)
        res.status(500).json({ error: 'Video processing failed', details: err.message })
        
        try {
          if (fs.existsSync(videoPath)) fs.unlinkSync(videoPath)
          if (fs.existsSync(assPath)) fs.unlinkSync(assPath)
          if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath)
        } catch (cleanupErr) {
          console.error('Cleanup error:', cleanupErr)
        }
      })
      .save(outputPath)

  } catch (error) {
    console.error('Server error:', error)
    res.status(500).json({ error: 'Internal server error', details: error.message })
  }
})

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Server is running' })
})

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
  console.log('Make sure FFmpeg is installed and available in PATH')
})
