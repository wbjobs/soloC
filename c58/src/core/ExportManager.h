#ifndef EXPORTMANAGER_H
#define EXPORTMANAGER_H

#include <QObject>
#include <QThread>
#include <QString>
#include <QImage>
#include <QAtomicInt>

#include "MediaEncoder.h"
#include "TimelineModel.h"
#include "RenderPipeline.h"

class ExportManager : public QObject
{
    Q_OBJECT

public:
    enum ExportState {
        Idle = 0,
        Exporting,
        Paused,
        Completed,
        Error
    };
    Q_ENUM(ExportState)

    explicit ExportManager(QObject *parent = nullptr);
    ~ExportManager();

    Q_INVOKABLE void startExport(const QString &filename, TimelineModel *timeline,
                                  int width = 1920, int height = 1080, double fps = 30.0);
    Q_INVOKABLE void pauseExport();
    Q_INVOKABLE void resumeExport();
    Q_INVOKABLE void cancelExport();

    Q_INVOKABLE ExportState state() const { return m_state; }
    Q_INVOKABLE int progress() const { return m_progress; }
    Q_INVOKABLE QString errorMessage() const { return m_errorMessage; }

signals:
    void progressChanged(int progress);
    void stateChanged(ExportState state);
    void exportCompleted();
    void exportError(const QString &message);

private:
    void exportThread();
    bool processVideoFrame(int64_t timestampMs);
    bool processAudioFrame(int64_t timestampMs);

    MediaEncoder *m_encoder;
    RenderPipeline *m_renderPipeline;
    TimelineModel *m_timeline;

    ExportState m_state;
    QAtomicInt m_progress;
    QString m_errorMessage;

    QThread *m_exportThread;
    bool m_shouldCancel;
    bool m_shouldPause;

    int m_width;
    int m_height;
    double m_fps;
    int64_t m_totalDurationMs;
    int64_t m_currentTimestampMs;
};

#endif
