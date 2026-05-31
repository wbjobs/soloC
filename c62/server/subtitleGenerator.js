function formatTimeASS(seconds) {
  const adjustedSeconds = Math.max(0, seconds - 2)
  const hours = Math.floor(adjustedSeconds / 3600)
  const minutes = Math.floor((adjustedSeconds % 3600) / 60)
  const secs = Math.floor(adjustedSeconds % 60)
  const centiseconds = Math.floor((adjustedSeconds % 1) * 100)
  return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${centiseconds.toString().padStart(2, '0')}`
}

function generateSubtitleASS(regions, videoInfo) {
  const width = videoInfo.width || 1920
  const height = videoInfo.height || 1080

  let assContent = `[Script Info]
Title: Generated Subtitles
ScriptType: v4.00+
WrapStyle: 0
PlayResX: ${width}
PlayResY: ${height}
ScaledBorderAndShadow: yes
YCbCr Matrix: TV.601

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,20,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,0,2,10,10,10,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`

  regions.forEach((region, index) => {
    const startTime = formatTimeASS(region.startTime)
    const endTime = formatTimeASS(region.endTime)
    
    const x = region.x
    const y = region.y
    const w = region.width
    const h = region.height

    const drawingCommands = `m 0 0 l ${w} 0 l ${w} ${h} l 0 ${h}`
    
    const line = `Dialogue: 0,${startTime},${endTime},Default,,0,0,0,,{\\an7\\pos(${x},${y})\\p1}${drawingCommands}{\\p0}\n`
    assContent += line
  })

  return assContent
}

module.exports = { generateSubtitleASS }
