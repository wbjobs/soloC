#ifndef PLAYERCONTROLLER_H
#define PLAYERCONTROLLER_H

#include <QObject>
#include <QTimer>
#include <QImage>

class TimelineModel;
class RenderPipeline;

class PlayerController : public QObject
{
    Q_OBJECT
    Q_PROPERTY(qint64 currentTime READ currentTime WRITE setCurrentTime NOTIFY currentTimeChanged)
    Q_PROPERTY(bool isPlaying READ isPlaying NOTIFY isPlayingChanged)
    Q_PROPERTY(qreal playbackRate READ playbackRate WRITE setPlaybackRate NOTIFY playbackRateChanged)
    Q_PROPERTY(QImage currentFrame READ currentFrame NOTIFY currentFrameChanged)

public:
    explicit PlayerController(QObject *parent = nullptr);
    ~PlayerController();

    void setTimelineModel(TimelineModel *model);

    qint64 currentTime() const;
    bool isPlaying() const;
    qreal playbackRate() const;
    QImage currentFrame() const;

public slots:
    void play();
    void pause();
    void togglePlayPause();
    void stop();
    void seek(qint64 time);
    void setCurrentTime(qint64 time);
    void setPlaybackRate(qreal rate);
    void stepForward();
    void stepBackward();

signals:
    void currentTimeChanged();
    void isPlayingChanged();
    void playbackRateChanged();
    void currentFrameChanged();

private slots:
    void updatePlayback();

private:
    TimelineModel *m_timelineModel;
    RenderPipeline *m_renderPipeline;

    qint64 m_currentTime;
    bool m_isPlaying;
    qreal m_playbackRate;
    QImage m_currentFrame;

    QTimer *m_playbackTimer;
    qint64 m_lastUpdateTime;
};

#endif
