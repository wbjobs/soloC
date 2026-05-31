#ifndef TIMELINEMODEL_H
#define TIMELINEMODEL_H

#include <QObject>
#include <QAbstractListModel>
#include <QList>
#include <QImage>

class Transition
{
public:
    enum Type {
        None = 0,
        CrossDissolve
    };

    Transition() : m_type(None), m_startClipIndex(-1), m_endClipIndex(-1), m_durationMs(0) {}
    Transition(Type type, int startClipIdx, int endClipIdx, qint64 durationMs)
        : m_type(type), m_startClipIndex(startClipIdx), m_endClipIndex(endClipIdx), m_durationMs(durationMs) {}

    Type type() const { return m_type; }
    int startClipIndex() const { return m_startClipIndex; }
    int endClipIndex() const { return m_endClipIndex; }
    qint64 durationMs() const { return m_durationMs; }

    void setType(Type type) { m_type = type; }
    void setDurationMs(qint64 duration) { m_durationMs = duration; }

private:
    Type m_type;
    int m_startClipIndex;
    int m_endClipIndex;
    qint64 m_durationMs;
};

class Clip
{
public:
    Clip() {}
    Clip(const QString &mediaPath, const QString &name, qint64 startTime, qint64 duration,
         qint64 mediaStartTime, int trackIndex);

    QString mediaPath() const { return m_mediaPath; }
    QString name() const { return m_name; }
    qint64 startTime() const { return m_startTime; }
    qint64 duration() const { return m_duration; }
    qint64 endTime() const { return m_startTime + m_duration; }
    qint64 mediaStartTime() const { return m_mediaStartTime; }
    int trackIndex() const { return m_trackIndex; }
    QImage thumbnail() const { return m_thumbnail; }

    void setStartTime(qint64 time) { m_startTime = time; }
    void setDuration(qint64 duration) { m_duration = duration; }
    void setMediaStartTime(qint64 time) { m_mediaStartTime = time; }
    void setTrackIndex(int index) { m_trackIndex = index; }
    void setThumbnail(const QImage &thumb) { m_thumbnail = thumb; }

    bool containsTime(qint64 time) const { return time >= m_startTime && time < endTime(); }

private:
    QString m_mediaPath;
    QString m_name;
    qint64 m_startTime;
    qint64 m_duration;
    qint64 m_mediaStartTime;
    int m_trackIndex;
    QImage m_thumbnail;
};

class TimelineModel : public QAbstractListModel
{
    Q_OBJECT
    Q_PROPERTY(qint64 totalDuration READ totalDuration NOTIFY totalDurationChanged)
    Q_PROPERTY(int trackCount READ trackCount NOTIFY trackCountChanged)

public:
    enum ClipRoles {
        MediaPathRole = Qt::UserRole + 1,
        NameRole,
        StartTimeRole,
        DurationRole,
        EndTimeRole,
        MediaStartTimeRole,
        TrackIndexRole,
        ThumbnailRole,
        XPositionRole,
        WidthRole
    };

    explicit TimelineModel(QObject *parent = nullptr);
    ~TimelineModel();

    int rowCount(const QModelIndex &parent = QModelIndex()) const override;
    QVariant data(const QModelIndex &index, int role = Qt::DisplayRole) const override;
    QHash<int, QByteArray> roleNames() const override;

    Q_INVOKABLE void addClip(const QString &mediaPath, const QString &name, qint64 startTime,
                             qint64 duration, qint64 mediaStartTime, int trackIndex);
    Q_INVOKABLE void removeClip(int index);
    Q_INVOKABLE void clear();
    Q_INVOKABLE Clip getClip(int index) const;
    Q_INVOKABLE int count() const;
    Q_INVOKABLE QList<Clip> getClipsAtTime(qint64 time, int trackIndex = -1) const;

    qint64 totalDuration() const;
    int trackCount() const;

    Q_INVOKABLE void moveClip(int index, qint64 newStartTime, int newTrackIndex);
    Q_INVOKABLE void trimClipStart(int index, qint64 newStartTime);
    Q_INVOKABLE void trimClipEnd(int index, qint64 newEndTime);
    Q_INVOKABLE void splitClip(int index, qint64 splitTime);

    Q_INVOKABLE qint64 pixelsToTime(qreal pixels, qreal timelineWidth) const;
    Q_INVOKABLE qreal timeToPixels(qint64 time, qreal timelineWidth) const;

    Q_INVOKABLE void addTransition(int startClipIndex, int endClipIndex, int transitionType, qint64 durationMs);
    Q_INVOKABLE void removeTransition(int transitionIndex);
    Q_INVOKABLE int transitionCount() const;
    Q_INVOKABLE Transition getTransition(int index) const;
    Q_INVOKABLE QList<Transition> getTransitionsAtTime(qint64 time) const;
    Q_INVOKABLE qreal getTransitionProgress(qint64 time, const Transition &transition) const;

signals:
    void totalDurationChanged();
    void trackCountChanged();

private:
    void updateTotalDuration();

    QList<Clip> m_clips;
    QList<Transition> m_transitions;
    qint64 m_totalDuration;
    int m_trackCount;
};

#endif
