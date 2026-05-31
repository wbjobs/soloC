#include "MediaDecoder.h"
#include <QDebug>

MediaDecoder::MediaDecoder(QObject *parent)
    : QObject(parent)
    , m_formatCtx(nullptr)
    , m_videoCodecCtx(nullptr)
    , m_audioCodecCtx(nullptr)
    , m_swsCtx(nullptr)
    , m_swrCtx(nullptr)
    , m_videoStreamIdx(-1)
    , m_audioStreamIdx(-1)
    , m_duration(0)
    , m_videoWidth(0)
    , m_videoHeight(0)
    , m_fps(0.0)
    , m_sampleRate(0)
    , m_channels(0)
    , m_isOpen(false)
    , m_videoFrame(nullptr)
    , m_audioFrame(nullptr)
{
}

MediaDecoder::~MediaDecoder()
{
    close();
}

bool MediaDecoder::open(const QString &filename)
{
    QMutexLocker locker(&m_mutex);

    close();

    m_filename = filename;

    AVDictionary *options = nullptr;
    int ret = avformat_open_input(&m_formatCtx, filename.toUtf8().constData(), nullptr, &options);
    if (ret < 0) {
        qDebug() << "Could not open file:" << filename;
        return false;
    }

    ret = avformat_find_stream_info(m_formatCtx, nullptr);
    if (ret < 0) {
        qDebug() << "Could not find stream info";
        return false;
    }

    m_duration = m_formatCtx->duration / AV_TIME_BASE * 1000;

    for (unsigned int i = 0; i < m_formatCtx->nb_streams; i++) {
        AVStream *stream = m_formatCtx->streams[i];
        AVCodecParameters *codecpar = stream->codecpar;

        if (codecpar->codec_type == AVMEDIA_TYPE_VIDEO) {
            m_videoStreamIdx = i;
            const AVCodec *codec = avcodec_find_decoder(codecpar->codec_id);
            if (!codec) {
                qDebug() << "Video codec not found";
                continue;
            }

            m_videoCodecCtx = avcodec_alloc_context3(codec);
            avcodec_parameters_to_context(m_videoCodecCtx, codecpar);
            avcodec_open2(m_videoCodecCtx, codec, nullptr);

            m_videoWidth = codecpar->width;
            m_videoHeight = codecpar->height;
            m_fps = av_q2d(stream->avg_frame_rate);

            m_videoFrame = av_frame_alloc();
        } else if (codecpar->codec_type == AVMEDIA_TYPE_AUDIO) {
            m_audioStreamIdx = i;
            const AVCodec *codec = avcodec_find_decoder(codecpar->codec_id);
            if (!codec) {
                qDebug() << "Audio codec not found";
                continue;
            }

            m_audioCodecCtx = avcodec_alloc_context3(codec);
            avcodec_parameters_to_context(m_audioCodecCtx, codecpar);
            avcodec_open2(m_audioCodecCtx, codec, nullptr);

            m_sampleRate = codecpar->sample_rate;
            m_channels = codecpar->ch_layout.nb_channels;

            m_audioFrame = av_frame_alloc();
        }
    }

    if (m_videoStreamIdx >= 0) {
        m_swsCtx = sws_getContext(
            m_videoWidth, m_videoHeight, m_videoCodecCtx->pix_fmt,
            m_videoWidth, m_videoHeight, AV_PIX_FMT_RGB32,
            SWS_BILINEAR, nullptr, nullptr, nullptr
        );
    }

    if (m_audioStreamIdx >= 0) {
        m_swrCtx = swr_alloc();
        AVChannelLayout outLayout;
        av_channel_layout_default(&outLayout, 2);

        av_opt_set_chlayout(m_swrCtx, "in_chlayout", &m_audioCodecCtx->ch_layout, 0);
        av_opt_set_int(m_swrCtx, "in_sample_rate", m_audioCodecCtx->sample_rate, 0);
        av_opt_set_sample_fmt(m_swrCtx, "in_sample_fmt", m_audioCodecCtx->sample_fmt, 0);

        av_opt_set_chlayout(m_swrCtx, "out_chlayout", &outLayout, 0);
        av_opt_set_int(m_swrCtx, "out_sample_rate", 44100, 0);
        av_opt_set_sample_fmt(m_swrCtx, "out_sample_fmt", AV_SAMPLE_FMT_S16, 0);

        swr_init(m_swrCtx);
    }

    m_isOpen = true;
    return true;
}

void MediaDecoder::close()
{
    if (m_swsCtx) {
        sws_freeContext(m_swsCtx);
        m_swsCtx = nullptr;
    }

    if (m_swrCtx) {
        swr_free(&m_swrCtx);
        m_swrCtx = nullptr;
    }

    if (m_videoCodecCtx) {
        avcodec_free_context(&m_videoCodecCtx);
        m_videoCodecCtx = nullptr;
    }

    if (m_audioCodecCtx) {
        avcodec_free_context(&m_audioCodecCtx);
        m_audioCodecCtx = nullptr;
    }

    if (m_formatCtx) {
        avformat_close_input(&m_formatCtx);
        m_formatCtx = nullptr;
    }

    if (m_videoFrame) {
        av_frame_free(&m_videoFrame);
        m_videoFrame = nullptr;
    }

    if (m_audioFrame) {
        av_frame_free(&m_audioFrame);
        m_audioFrame = nullptr;
    }

    m_isOpen = false;
    m_videoStreamIdx = -1;
    m_audioStreamIdx = -1;
}

bool MediaDecoder::isOpen() const
{
    return m_isOpen;
}

QImage MediaDecoder::getVideoFrame(qint64 timestampMs)
{
    QMutexLocker locker(&m_mutex);

    if (!m_isOpen || m_videoStreamIdx < 0)
        return QImage();

    int64_t targetPts = timestampMs * AV_TIME_BASE / 1000;
    avformat_seek_file(m_formatCtx, m_videoStreamIdx, 0, targetPts, targetPts, 0);

    AVPacket *pkt = av_packet_alloc();
    QImage result;

    while (av_read_frame(m_formatCtx, pkt) >= 0) {
        if (pkt->stream_index == m_videoStreamIdx) {
            avcodec_send_packet(m_videoCodecCtx, pkt);
            if (avcodec_receive_frame(m_videoCodecCtx, m_videoFrame) == 0) {
                result = convertToImage(m_videoFrame);
                av_packet_unref(pkt);
                break;
            }
        }
        av_packet_unref(pkt);
    }

    av_packet_free(&pkt);
    return result;
}

QByteArray MediaDecoder::getAudioFrame(qint64 timestampMs)
{
    QMutexLocker locker(&m_mutex);

    if (!m_isOpen || m_audioStreamIdx < 0)
        return QByteArray();

    int64_t targetPts = timestampMs * AV_TIME_BASE / 1000;
    avformat_seek_file(m_formatCtx, m_audioStreamIdx, 0, targetPts, targetPts, 0);

    AVPacket *pkt = av_packet_alloc();
    QByteArray result;

    while (av_read_frame(m_formatCtx, pkt) >= 0) {
        if (pkt->stream_index == m_audioStreamIdx) {
            avcodec_send_packet(m_audioCodecCtx, pkt);
            if (avcodec_receive_frame(m_audioCodecCtx, m_audioFrame) == 0) {
                result = convertToAudio(m_audioFrame);
                av_packet_unref(pkt);
                break;
            }
        }
        av_packet_unref(pkt);
    }

    av_packet_free(&pkt);
    return result;
}

QImage MediaDecoder::convertToImage(AVFrame *frame)
{
    if (!frame || !m_swsCtx)
        return QImage();

    QImage image(m_videoWidth, m_videoHeight, QImage::Format_RGB32);

    uint8_t *dest[4] = { image.bits() };
    int destLinesize[4] = { static_cast<int>(image.bytesPerLine()) };

    sws_scale(m_swsCtx, frame->data, frame->linesize, 0, frame->height, dest, destLinesize);

    return image;
}

QByteArray MediaDecoder::convertToAudio(AVFrame *frame)
{
    if (!frame || !m_swrCtx)
        return QByteArray();

    const int outSamples = 4096;
    uint8_t *outBuffer;
    av_samples_alloc(&outBuffer, nullptr, 2, outSamples, AV_SAMPLE_FMT_S16, 0);

    int samplesConverted = swr_convert(m_swrCtx, &outBuffer, outSamples,
                                        const_cast<const uint8_t**>(frame->data), frame->nb_samples);

    QByteArray result(reinterpret_cast<char*>(outBuffer), samplesConverted * 2 * 2);

    av_freep(&outBuffer);
    return result;
}

qint64 MediaDecoder::duration() const
{
    return m_duration;
}

int MediaDecoder::videoWidth() const
{
    return m_videoWidth;
}

int MediaDecoder::videoHeight() const
{
    return m_videoHeight;
}

double MediaDecoder::fps() const
{
    return m_fps;
}

int MediaDecoder::sampleRate() const
{
    return m_sampleRate;
}

int MediaDecoder::channels() const
{
    return m_channels;
}

QString MediaDecoder::filename() const
{
    return m_filename;
}
