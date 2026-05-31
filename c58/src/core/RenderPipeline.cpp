#include "RenderPipeline.h"
#include "MediaDecoder.h"
#include <QPainter>
#include <QDebug>

RenderPipeline::RenderPipeline(QObject *parent)
    : QObject(parent), m_timelineModel(nullptr), m_outputWidth(1920), m_outputHeight(1080)
{
}

RenderPipeline::~RenderPipeline()
{
    qDeleteAll(m_decoders);
    m_decoders.clear();
}

void RenderPipeline::setTimelineModel(TimelineModel *model)
{
    m_timelineModel = model;
}

QImage RenderPipeline::getVideoFrame(qint64 time)
{
    if (!m_timelineModel)
        return QImage();

    QList<Transition> transitions = m_timelineModel->getTransitionsAtTime(time);

    if (!transitions.isEmpty()) {
        const Transition &transition = transitions.first();
        qreal progress = m_timelineModel->getTransitionProgress(time, transition);

        const Clip &fromClip = m_timelineModel->getClip(transition.startClipIndex());
        const Clip &toClip = m_timelineModel->getClip(transition.endClipIndex());

        qint64 fromMediaTime = fromClip.mediaStartTime() + (time - fromClip.startTime());
        qint64 toMediaTime = toClip.mediaStartTime() + (time - toClip.startTime());

        QImage fromFrame;
        QImage toFrame;

        MediaDecoder *fromDecoder = nullptr;
        if (m_decoders.contains(fromClip.mediaPath())) {
            fromDecoder = m_decoders[fromClip.mediaPath()];
        } else {
            fromDecoder = new MediaDecoder();
            if (fromDecoder->open(fromClip.mediaPath())) {
                m_decoders[fromClip.mediaPath()] = fromDecoder;
            }
        }

        if (fromDecoder) {
            fromFrame = fromDecoder->getVideoFrame(fromMediaTime);
        }

        MediaDecoder *toDecoder = nullptr;
        if (m_decoders.contains(toClip.mediaPath())) {
            toDecoder = m_decoders[toClip.mediaPath()];
        } else {
            toDecoder = new MediaDecoder();
            if (toDecoder->open(toClip.mediaPath())) {
                m_decoders[toClip.mediaPath()] = toDecoder;
            }
        }

        if (toDecoder) {
            toFrame = toDecoder->getVideoFrame(toMediaTime);
        }

        if (fromFrame.isNull()) {
            fromFrame = QImage(m_outputWidth, m_outputHeight, QImage::Format_RGB32);
            fromFrame.fill(Qt::black);
        }
        if (toFrame.isNull()) {
            toFrame = QImage(m_outputWidth, m_outputHeight, QImage::Format_RGB32);
            toFrame.fill(Qt::black);
        }

        return applyTransition(fromFrame, toFrame, transition.type(), progress);
    }

    QList<Clip> clips = m_timelineModel->getClipsAtTime(time, 0);
    if (clips.isEmpty())
        return QImage(m_outputWidth, m_outputHeight, QImage::Format_RGB32);

    QList<QImage> frames;
    for (const Clip &clip : clips) {
        qint64 mediaTime = clip.mediaStartTime() + (time - clip.startTime());
        MediaDecoder *decoder = nullptr;

        if (m_decoders.contains(clip.mediaPath())) {
            decoder = m_decoders[clip.mediaPath()];
        } else {
            decoder = new MediaDecoder();
            if (decoder->open(clip.mediaPath())) {
                m_decoders[clip.mediaPath()] = decoder;
            } else {
                delete decoder;
                continue;
            }
        }

        QImage frame = decoder->getVideoFrame(mediaTime);
        if (!frame.isNull()) {
            frames.append(frame);
        }
    }

    return blendFrames(frames);
}

QByteArray RenderPipeline::getAudioFrame(qint64 time)
{
    if (!m_timelineModel)
        return QByteArray();

    QList<Clip> clips = m_timelineModel->getClipsAtTime(time);
    if (clips.isEmpty())
        return QByteArray();

    for (const Clip &clip : clips) {
        qint64 mediaTime = clip.mediaStartTime() + (time - clip.startTime());
        MediaDecoder *decoder = nullptr;

        if (m_decoders.contains(clip.mediaPath())) {
            decoder = m_decoders[clip.mediaPath()];
        } else {
            decoder = new MediaDecoder();
            if (decoder->open(clip.mediaPath())) {
                m_decoders[clip.mediaPath()] = decoder;
            } else {
                delete decoder;
                continue;
            }
        }

        QByteArray audio = decoder->getAudioFrame(mediaTime);
        if (!audio.isEmpty()) {
            return audio;
        }
    }

    return QByteArray();
}

QImage RenderPipeline::renderFrame(qint64 time)
{
    return getVideoFrame(time);
}

QByteArray RenderPipeline::renderAudio(qint64 time)
{
    return getAudioFrame(time);
}

QImage RenderPipeline::blendFrames(const QList<QImage> &frames)
{
    QImage result(m_outputWidth, m_outputHeight, QImage::Format_RGB32);
    result.fill(Qt::black);

    QPainter painter(&result);
    painter.setRenderHint(QPainter::SmoothPixmapTransform);

    for (const QImage &frame : frames) {
        QImage scaled = resizeFrame(frame, m_outputWidth, m_outputHeight);
        painter.drawImage(0, 0, scaled);
    }

    painter.end();
    return result;
}

QImage RenderPipeline::resizeFrame(const QImage &frame, int width, int height)
{
    return frame.scaled(width, height, Qt::KeepAspectRatio, Qt::SmoothTransformation);
}

QImage RenderPipeline::applyTransition(const QImage &fromFrame, const QImage &toFrame,
                                       Transition::Type type, qreal progress)
{
    switch (type) {
    case Transition::CrossDissolve:
        return crossDissolve(fromFrame, toFrame, progress);
    case Transition::None:
    default:
        return fromFrame;
    }
}

QImage RenderPipeline::crossDissolve(const QImage &fromFrame, const QImage &toFrame, qreal alpha)
{
    QImage fromScaled = resizeFrame(fromFrame, m_outputWidth, m_outputHeight);
    QImage toScaled = resizeFrame(toFrame, m_outputWidth, m_outputHeight);

    QImage result(m_outputWidth, m_outputHeight, QImage::Format_RGB32);

    alpha = qBound(0.0, alpha, 1.0);

    for (int y = 0; y < m_outputHeight; y++) {
        const QRgb *fromLine = reinterpret_cast<const QRgb*>(fromScaled.scanLine(y));
        const QRgb *toLine = reinterpret_cast<const QRgb*>(toScaled.scanLine(y));
        QRgb *resultLine = reinterpret_cast<QRgb*>(result.scanLine(y));

        for (int x = 0; x < m_outputWidth; x++) {
            int r = static_cast<int>(qRed(fromLine[x]) * (1 - alpha) + qRed(toLine[x]) * alpha);
            int g = static_cast<int>(qGreen(fromLine[x]) * (1 - alpha) + qGreen(toLine[x]) * alpha);
            int b = static_cast<int>(qBlue(fromLine[x]) * (1 - alpha) + qBlue(toLine[x]) * alpha);

            resultLine[x] = qRgb(qBound(0, r, 255), qBound(0, g, 255), qBound(0, b, 255));
        }
    }

    return result;
}
