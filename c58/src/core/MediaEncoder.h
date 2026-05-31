#ifndef MEDIAENCODER_H
#define MEDIAENCODER_H

#include <QObject>
#include <QString>
#include <QImage>
#include <QMutex>

extern "C" {
#include <libavcodec/avcodec.h>
#include <libavformat/avformat.h>
#include <libswscale/swscale.h>
#include <libswresample/swresample.h>
#include <libavutil/avutil.h>
#include <libavutil/imgutils.h>
}

class MediaEncoder : public QObject
{
    Q_OBJECT

public:
    explicit MediaEncoder(QObject *parent = nullptr);
    ~MediaEncoder();

    bool create(const QString &filename, int width, int height, double fps, int audioSampleRate = 44100);
    void close();
    bool isOpen() const;

    bool writeVideoFrame(const QImage &image, int64_t timestampMs = -1);
    bool writeAudioFrame(const QByteArray &audioData, int64_t timestampMs = -1);

    bool finalize();

    double fps() const { return m_fps; }
    int audioSampleRate() const { return m_audioSampleRate; }
    int64_t nextVideoPts() const { return m_videoFrameCount; }
    int64_t nextAudioPts() const { return m_audioFrameCount; }

private:
    bool initVideoCodec();
    bool initAudioCodec();
    AVFrame *convertFromImage(const QImage &image);
    AVFrame *convertFromAudio(const QByteArray &audioData);

    AVFormatContext *m_formatCtx;
    AVCodecContext *m_videoCodecCtx;
    AVCodecContext *m_audioCodecCtx;
    SwsContext *m_swsCtx;

    AVStream *m_videoStream;
    AVStream *m_audioStream;

    int m_width;
    int m_height;
    double m_fps;
    int m_audioSampleRate;

    QString m_filename;
    bool m_isOpen;
    mutable QMutex m_mutex;

    int64_t m_videoFrameCount;
    int64_t m_audioFrameCount;

    AVFrame *m_videoFrame;
    AVFrame *m_audioFrame;
};

#endif
