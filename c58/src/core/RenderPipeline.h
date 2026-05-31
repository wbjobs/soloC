#ifndef RENDERPIPELINE_H
#define RENDERPIPELINE_H

#include <QObject>
#include <QImage>
#include <QAudioFormat>

#include "TimelineModel.h"

class MediaDecoder;

class RenderPipeline : public QObject
{
    Q_OBJECT

public:
    explicit RenderPipeline(QObject *parent = nullptr);
    ~RenderPipeline();

    void setTimelineModel(TimelineModel *model);

    QImage getVideoFrame(qint64 time);
    QByteArray getAudioFrame(qint64 time);

    QImage renderFrame(qint64 time);
    QByteArray renderAudio(qint64 time);

private:
    QImage blendFrames(const QList<QImage> &frames);
    QImage resizeFrame(const QImage &frame, int width, int height);
    QImage applyTransition(const QImage &fromFrame, const QImage &toFrame, 
                           Transition::Type type, qreal progress);
    QImage crossDissolve(const QImage &fromFrame, const QImage &toFrame, qreal alpha);

    TimelineModel *m_timelineModel;
    QHash<QString, MediaDecoder*> m_decoders;

    int m_outputWidth;
    int m_outputHeight;
};

#endif
