#include "MediaEncoder.h"
#include <QDebug>

MediaEncoder::MediaEncoder(QObject *parent)
    : QObject(parent)
    , m_formatCtx(nullptr)
    , m_videoCodecCtx(nullptr)
    , m_audioCodecCtx(nullptr)
    , m_swsCtx(nullptr)
    , m_videoStream(nullptr)
    , m_audioStream(nullptr)
    , m_width(0)
    , m_height(0)
    , m_fps(0.0)
    , m_audioSampleRate(44100)
    , m_isOpen(false)
    , m_videoFrameCount(0)
    , m_audioFrameCount(0)
    , m_videoFrame(nullptr)
    , m_audioFrame(nullptr)
{
}

MediaEncoder::~MediaEncoder()
{
    close();
}

bool MediaEncoder::create(const QString &filename, int width, int height, double fps, int audioSampleRate)
{
    QMutexLocker locker(&m_mutex);

    close();

    m_filename = filename;
    m_width = width;
    m_height = height;
    m_fps = fps;
    m_audioSampleRate = audioSampleRate;

    avformat_alloc_output_context2(&m_formatCtx, nullptr, nullptr, filename.toUtf8().constData());
    if (!m_formatCtx) {
        qDebug() << "Could not create output context";
        return false;
    }

    if (!initVideoCodec()) {
        qDebug() << "Could not initialize video codec";
        return false;
    }

    if (!initAudioCodec()) {
        qDebug() << "Could not initialize audio codec";
        return false;
    }

    if (!(m_formatCtx->oformat->flags & AVFMT_NOFILE)) {
        int ret = avio_open(&m_formatCtx->pb, filename.toUtf8().constData(), AVIO_FLAG_WRITE);
        if (ret < 0) {
            qDebug() << "Could not open output file";
            return false;
        }
    }

    avformat_write_header(m_formatCtx, nullptr);

    m_isOpen = true;
    return true;
}

bool MediaEncoder::initVideoCodec()
{
    const AVCodec *codec = avcodec_find_encoder(AV_CODEC_ID_H264);
    if (!codec) {
        qDebug() << "H264 codec not found";
        return false;
    }

    m_videoStream = avformat_new_stream(m_formatCtx, nullptr);
    m_videoCodecCtx = avcodec_alloc_context3(codec);

    m_videoCodecCtx->codec_id = AV_CODEC_ID_H264;
    m_videoCodecCtx->width = m_width;
    m_videoCodecCtx->height = m_height;
    
    AVRational fpsRational;
    if (m_fps == 29.97) {
        fpsRational = {30000, 1001};
    } else if (m_fps == 23.976) {
        fpsRational = {24000, 1001};
    } else if (m_fps == 59.94) {
        fpsRational = {60000, 1001};
    } else {
        fpsRational = {static_cast<int>(m_fps), 1};
    }
    
    m_videoCodecCtx->time_base = av_inv_q(fpsRational);
    m_videoCodecCtx->framerate = fpsRational;
    m_videoCodecCtx->pix_fmt = AV_PIX_FMT_YUV420P;
    m_videoCodecCtx->bit_rate = 4000000;
    m_videoCodecCtx->gop_size = 12;
    m_videoCodecCtx->max_b_frames = 2;

    if (m_formatCtx->oformat->flags & AVFMT_GLOBALHEADER) {
        m_videoCodecCtx->flags |= AV_CODEC_FLAG_GLOBAL_HEADER;
    }

    avcodec_open2(m_videoCodecCtx, codec, nullptr);
    avcodec_parameters_from_context(m_videoStream->codecpar, m_videoCodecCtx);

    m_swsCtx = sws_getContext(
        m_width, m_height, AV_PIX_FMT_RGB32,
        m_width, m_height, AV_PIX_FMT_YUV420P,
        SWS_BILINEAR, nullptr, nullptr, nullptr
    );

    m_videoFrame = av_frame_alloc();
    m_videoFrame->format = m_videoCodecCtx->pix_fmt;
    m_videoFrame->width = m_width;
    m_videoFrame->height = m_height;
    av_frame_get_buffer(m_videoFrame, 0);

    return true;
}

bool MediaEncoder::initAudioCodec()
{
    const AVCodec *codec = avcodec_find_encoder(AV_CODEC_ID_AAC);
    if (!codec) {
        qDebug() << "AAC codec not found";
        return false;
    }

    m_audioStream = avformat_new_stream(m_formatCtx, nullptr);
    m_audioCodecCtx = avcodec_alloc_context3(codec);

    m_audioCodecCtx->codec_id = AV_CODEC_ID_AAC;
    m_audioCodecCtx->sample_rate = m_audioSampleRate;
    m_audioCodecCtx->bit_rate = 128000;
    av_channel_layout_from_mask(&m_audioCodecCtx->ch_layout, AV_CH_LAYOUT_STEREO);
    m_audioCodecCtx->sample_fmt = AV_SAMPLE_FMT_FLTP;
    m_audioCodecCtx->time_base = {1, m_audioSampleRate};

    if (m_formatCtx->oformat->flags & AVFMT_GLOBALHEADER) {
        m_audioCodecCtx->flags |= AV_CODEC_FLAG_GLOBAL_HEADER;
    }

    avcodec_open2(m_audioCodecCtx, codec, nullptr);
    avcodec_parameters_from_context(m_audioStream->codecpar, m_audioCodecCtx);

    m_audioFrame = av_frame_alloc();
    m_audioFrame->format = m_audioCodecCtx->sample_fmt;
    m_audioFrame->ch_layout = m_audioCodecCtx->ch_layout;
    m_audioFrame->sample_rate = m_audioCodecCtx->sample_rate;
    m_audioFrame->nb_samples = 1024;
    av_frame_get_buffer(m_audioFrame, 0);

    return true;
}

void MediaEncoder::close()
{
    if (m_isOpen) {
        finalize();
    }

    if (m_swsCtx) {
        sws_freeContext(m_swsCtx);
        m_swsCtx = nullptr;
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
        if (!(m_formatCtx->oformat->flags & AVFMT_NOFILE)) {
            avio_closep(&m_formatCtx->pb);
        }
        avformat_free_context(m_formatCtx);
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
}

bool MediaEncoder::isOpen() const
{
    return m_isOpen;
}

bool MediaEncoder::writeVideoFrame(const QImage &image, int64_t timestampMs)
{
    QMutexLocker locker(&m_mutex);

    if (!m_isOpen)
        return false;

    AVFrame *frame = convertFromImage(image);
    if (!frame)
        return false;

    if (timestampMs >= 0) {
        AVRational msTimeBase = {1, 1000};
        frame->pts = av_rescale_q(timestampMs, msTimeBase, m_videoCodecCtx->time_base);
    } else {
        frame->pts = m_videoFrameCount;
    }
    
    m_videoFrameCount = frame->pts + 1;

    AVPacket *pkt = av_packet_alloc();

    int ret = avcodec_send_frame(m_videoCodecCtx, frame);
    if (ret < 0) {
        av_packet_free(&pkt);
        return false;
    }

    while (ret >= 0) {
        ret = avcodec_receive_packet(m_videoCodecCtx, pkt);
        if (ret == AVERROR(EAGAIN) || ret == AVERROR_EOF) {
            break;
        }
        if (ret < 0) {
            av_packet_free(&pkt);
            return false;
        }

        av_packet_rescale_ts(pkt, m_videoCodecCtx->time_base, m_videoStream->time_base);
        pkt->stream_index = m_videoStream->index;
        pkt->dts = pkt->pts;
        av_interleaved_write_frame(m_formatCtx, pkt);
        av_packet_unref(pkt);
    }

    av_packet_free(&pkt);
    return true;
}

bool MediaEncoder::writeAudioFrame(const QByteArray &audioData, int64_t timestampMs)
{
    QMutexLocker locker(&m_mutex);

    if (!m_isOpen)
        return false;

    AVFrame *frame = convertFromAudio(audioData);
    if (!frame)
        return false;

    if (timestampMs >= 0) {
        AVRational msTimeBase = {1, 1000};
        frame->pts = av_rescale_q(timestampMs, msTimeBase, m_audioCodecCtx->time_base);
    } else {
        frame->pts = m_audioFrameCount;
    }
    
    m_audioFrameCount = frame->pts + frame->nb_samples;

    AVPacket *pkt = av_packet_alloc();

    int ret = avcodec_send_frame(m_audioCodecCtx, frame);
    if (ret < 0) {
        av_packet_free(&pkt);
        return false;
    }

    while (ret >= 0) {
        ret = avcodec_receive_packet(m_audioCodecCtx, pkt);
        if (ret == AVERROR(EAGAIN) || ret == AVERROR_EOF) {
            break;
        }
        if (ret < 0) {
            av_packet_free(&pkt);
            return false;
        }

        av_packet_rescale_ts(pkt, m_audioCodecCtx->time_base, m_audioStream->time_base);
        pkt->stream_index = m_audioStream->index;
        pkt->dts = pkt->pts;
        av_interleaved_write_frame(m_formatCtx, pkt);
        av_packet_unref(pkt);
    }

    av_packet_free(&pkt);
    return true;
}

AVFrame *MediaEncoder::convertFromImage(const QImage &image)
{
    if (!m_swsCtx)
        return nullptr;

    QImage rgbImage = image.convertToFormat(QImage::Format_RGB32);

    uint8_t *src[4] = { rgbImage.bits() };
    int srcLinesize[4] = { static_cast<int>(rgbImage.bytesPerLine()) };

    sws_scale(m_swsCtx, src, srcLinesize, 0, m_height, m_videoFrame->data, m_videoFrame->linesize);

    return m_videoFrame;
}

AVFrame *MediaEncoder::convertFromAudio(const QByteArray &audioData)
{
    const int16_t *samples = reinterpret_cast<const int16_t*>(audioData.constData());
    int sampleCount = audioData.size() / 4;

    int samplesToCopy = qMin(sampleCount, m_audioFrame->nb_samples);
    
    float *left = reinterpret_cast<float*>(m_audioFrame->data[0]);
    float *right = reinterpret_cast<float*>(m_audioFrame->data[1]);
    
    for (int i = 0; i < samplesToCopy; i++) {
        left[i] = samples[i * 2] / 32768.0f;
        right[i] = samples[i * 2 + 1] / 32768.0f;
    }
    
    for (int i = samplesToCopy; i < m_audioFrame->nb_samples; i++) {
        left[i] = 0.0f;
        right[i] = 0.0f;
    }

    return m_audioFrame;
}

bool MediaEncoder::finalize()
{
    if (!m_isOpen)
        return false;

    AVPacket *pkt = av_packet_alloc();

    int ret = avcodec_send_frame(m_videoCodecCtx, nullptr);
    while (ret >= 0) {
        ret = avcodec_receive_packet(m_videoCodecCtx, pkt);
        if (ret == AVERROR_EOF) break;
        if (ret >= 0) {
            av_packet_rescale_ts(pkt, m_videoCodecCtx->time_base, m_videoStream->time_base);
            pkt->stream_index = m_videoStream->index;
            av_interleaved_write_frame(m_formatCtx, pkt);
            av_packet_unref(pkt);
        }
    }

    ret = avcodec_send_frame(m_audioCodecCtx, nullptr);
    while (ret >= 0) {
        ret = avcodec_receive_packet(m_audioCodecCtx, pkt);
        if (ret == AVERROR_EOF) break;
        if (ret >= 0) {
            av_packet_rescale_ts(pkt, m_audioCodecCtx->time_base, m_audioStream->time_base);
            pkt->stream_index = m_audioStream->index;
            av_interleaved_write_frame(m_formatCtx, pkt);
            av_packet_unref(pkt);
        }
    }

    av_packet_free(&pkt);
    av_write_trailer(m_formatCtx);

    return true;
}
