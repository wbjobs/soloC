#ifndef MEDIADECODER_H
#define MEDIADECODER_H

#include <QObject>
#include <QString>
#include <QImage>
#include <QMutex>
#include <QAudioFormat>

extern "C" {
#include <libavcodec/avcodec.h>
#include <libavformat/avformat.h>
#include <libswscale/swscale.h>
#include <libswresample/swresample.h>
#include <libavutil/avutil.h>
#include <libavutil/imgutils.h>
}

class MediaDecoder : public QObject
{
    Q_OBJECT

public:
    explicit MediaDecoder(QObject *parent = nullptr);
    ~MediaDecoder();

    bool open(const QString &filename);
    void close();
    bool isOpen() const;

    QImage getVideoFrame(qint64 timestampMs);
    QByteArray getAudioFrame(qint64 timestampMs);

    qint64 duration() const;
    int videoWidth() const;
    int videoHeight() const;
    double fps() const;
    int sampleRate() const;
    int channels() const;

    QString filename() const;

private:
    bool decodeVideoFrame(AVPacket *pkt, AVFrame *frame);
    bool decodeAudioFrame(AVPacket *pkt, AVFrame *frame);
    QImage convertToImage(AVFrame *frame);
    QByteArray convertToAudio(AVFrame *frame);

    AVFormatContext *m_formatCtx;
    AVCodecContext *m_videoCodecCtx;
    AVCodecContext *m_audioCodecCtx;
    SwsContext *m_swsCtx;
    SwrContext *m_swrCtx;

    int m_videoStreamIdx;
    int m_audioStreamIdx;

    qint64 m_duration;
    int m_videoWidth;
    int m_videoHeight;
    double m_fps;
    int m_sampleRate;
    int m_channels;

    QString m_filename;
    bool m_isOpen;
    mutable QMutex m_mutex;

    AVFrame *m_videoFrame;
    AVFrame *m_audioFrame;
};

#endif
