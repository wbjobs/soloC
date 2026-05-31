#include "PlayerController.h"
#include "TimelineModel.h"
#include "RenderPipeline.h"
#include <QElapsedTimer>
#include <QDebug>

PlayerController::PlayerController(QObject *parent)
    : QObject(parent), m_timelineModel(nullptr), m_renderPipeline(new RenderPipeline(this)),
      m_currentTime(0), m_isPlaying(false), m_playbackRate(1.0),
      m_playbackTimer(new QTimer(this)), m_lastUpdateTime(0)
{
    connect(m_playbackTimer, &QTimer::timeout, this, &PlayerController::updatePlayback);
    m_playbackTimer->setInterval(33);
}

PlayerController::~PlayerController()
{
}

void PlayerController::setTimelineModel(TimelineModel *model)
{
    m_timelineModel = model;
    m_renderPipeline->setTimelineModel(model);
}

qint64 PlayerController::currentTime() const
{
    return m_currentTime;
}

bool PlayerController::isPlaying() const
{
    return m_isPlaying;
}

qreal PlayerController::playbackRate() const
{
    return m_playbackRate;
}

QImage PlayerController::currentFrame() const
{
    return m_currentFrame;
}

void PlayerController::play()
{
    if (m_isPlaying)
        return;

    m_isPlaying = true;
    m_lastUpdateTime = QDateTime::currentMSecsSinceEpoch();
    m_playbackTimer->start();
    emit isPlayingChanged();
}

void PlayerController::pause()
{
    if (!m_isPlaying)
        return;

    m_isPlaying = false;
    m_playbackTimer->stop();
    emit isPlayingChanged();
}

void PlayerController::togglePlayPause()
{
    if (m_isPlaying) {
        pause();
    } else {
        play();
    }
}

void PlayerController::stop()
{
    pause();
    setCurrentTime(0);
}

void PlayerController::seek(qint64 time)
{
    setCurrentTime(time);
}

void PlayerController::setCurrentTime(qint64 time)
{
    if (m_timelineModel && time > m_timelineModel->totalDuration()) {
        time = m_timelineModel->totalDuration();
    }

    if (time < 0) {
        time = 0;
    }

    if (m_currentTime == time)
        return;

    m_currentTime = time;

    if (m_renderPipeline) {
        m_currentFrame = m_renderPipeline->renderFrame(m_currentTime);
        emit currentFrameChanged();
    }

    emit currentTimeChanged();
}

void PlayerController::setPlaybackRate(qreal rate)
{
    if (m_playbackRate == rate)
        return;

    m_playbackRate = rate;
    emit playbackRateChanged();
}

void PlayerController::stepForward()
{
    setCurrentTime(m_currentTime + 100);
}

void PlayerController::stepBackward()
{
    setCurrentTime(m_currentTime - 100);
}

void PlayerController::updatePlayback()
{
    if (!m_timelineModel || !m_isPlaying)
        return;

    qint64 currentTime = QDateTime::currentMSecsSinceEpoch();
    qint64 delta = static_cast<qint64>((currentTime - m_lastUpdateTime) * m_playbackRate);
    m_lastUpdateTime = currentTime;

    qint64 newTime = m_currentTime + delta;

    if (newTime >= m_timelineModel->totalDuration()) {
        newTime = m_timelineModel->totalDuration();
        pause();
    }

    setCurrentTime(newTime);
}
