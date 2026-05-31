#include "ExportManager.h"
#include <QDebug>

ExportManager::ExportManager(QObject *parent)
    : QObject(parent)
    , m_encoder(new MediaEncoder(this))
    , m_renderPipeline(new RenderPipeline(this))
    , m_timeline(nullptr)
    , m_state(Idle)
    , m_progress(0)
    , m_exportThread(nullptr)
    , m_shouldCancel(false)
    , m_shouldPause(false)
    , m_width(1920)
    , m_height(1080)
    , m_fps(30.0)
    , m_totalDurationMs(0)
    , m_currentTimestampMs(0)
{
}

ExportManager::~ExportManager()
{
    cancelExport();
}

void ExportManager::startExport(const QString &filename, TimelineModel *timeline,
                               int width, int height, double fps)
{
    if (m_state == Exporting) {
        emit exportError("Export already in progress");
        return;
    }

    if (!timeline || timeline->totalDuration() <= 0) {
        emit exportError("Invalid timeline or empty timeline");
        return;
    }

    m_timeline = timeline;
    m_width = width;
    m_height = height;
    m_fps = fps;
    m_totalDurationMs = timeline->totalDuration();
    m_currentTimestampMs = 0;
    m_progress = 0;
    m_shouldCancel = false;
    m_shouldPause = false;

    m_renderPipeline->setTimelineModel(timeline);

    if (!m_encoder->create(filename, width, height, fps)) {
        m_state = Error;
        m_errorMessage = "Failed to create encoder";
        emit stateChanged(Error);
        emit exportError(m_errorMessage);
        return;
    }

    m_state = Exporting;
    emit stateChanged(Exporting);

    m_exportThread = QThread::create([this]() {
        exportThread();
    });
    m_exportThread->start();
}

void ExportManager::pauseExport()
{
    if (m_state == Exporting) {
        m_shouldPause = true;
        m_state = Paused;
        emit stateChanged(Paused);
    }
}

void ExportManager::resumeExport()
{
    if (m_state == Paused) {
        m_shouldPause = false;
        m_state = Exporting;
        emit stateChanged(Exporting);
    }
}

void ExportManager::cancelExport()
{
    if (m_exportThread) {
        m_shouldCancel = true;
        m_shouldPause = false;
        m_exportThread->wait();
        m_exportThread->deleteLater();
        m_exportThread = nullptr;
    }

    if (m_encoder->isOpen()) {
        m_encoder->close();
    }

    m_state = Idle;
    emit stateChanged(Idle);
}

void ExportManager::exportThread()
{
    const int64_t frameIntervalMs = static_cast<int64_t>(1000.0 / m_fps + 0.5);
    const int audioFrameSize = 1024;
    const int64_t audioFrameIntervalMs = static_cast<int64_t>((audioFrameSize * 1000.0) / 44100.0 + 0.5);

    int64_t videoTimestamp = 0;
    int64_t audioTimestamp = 0;

    while (!m_shouldCancel && videoTimestamp < m_totalDurationMs) {
        while (m_shouldPause && !m_shouldCancel) {
            QThread::msleep(100);
        }

        if (m_shouldCancel) break;

        if (videoTimestamp < m_totalDurationMs) {
            if (!processVideoFrame(videoTimestamp)) {
                qWarning() << "Failed to process video frame at" << videoTimestamp << "ms";
            }
            videoTimestamp += frameIntervalMs;
        }

        while (audioTimestamp < videoTimestamp && audioTimestamp < m_totalDurationMs) {
            if (!processAudioFrame(audioTimestamp)) {
                qWarning() << "Failed to process audio frame at" << audioTimestamp << "ms";
            }
            audioTimestamp += audioFrameIntervalMs;
        }

        int newProgress = static_cast<int>((videoTimestamp * 100) / m_totalDurationMs);
        if (newProgress != m_progress) {
            m_progress = newProgress;
            emit progressChanged(newProgress);
        }

        QThread::usleep(100);
    }

    if (!m_shouldCancel) {
        while (audioTimestamp < m_totalDurationMs) {
            processAudioFrame(audioTimestamp);
            audioTimestamp += audioFrameIntervalMs;
        }

        m_encoder->finalize();
        m_encoder->close();

        m_state = Completed;
        m_progress = 100;
        emit progressChanged(100);
        emit stateChanged(Completed);
        emit exportCompleted();
    } else {
        m_encoder->close();
        m_state = Idle;
        emit stateChanged(Idle);
    }
}

bool ExportManager::processVideoFrame(int64_t timestampMs)
{
    QImage frame = m_renderPipeline->getVideoFrame(timestampMs);
    if (frame.isNull()) {
        frame = QImage(m_width, m_height, QImage::Format_RGB32);
        frame.fill(Qt::black);
    }

    return m_encoder->writeVideoFrame(frame, timestampMs);
}

bool ExportManager::processAudioFrame(int64_t timestampMs)
{
    QByteArray audio = m_renderPipeline->getAudioFrame(timestampMs);
    if (audio.isEmpty()) {
        audio.fill(0, 1024 * 4);
    }

    return m_encoder->writeAudioFrame(audio, timestampMs);
}
