#include "TimelineModel.h"
#include "MediaDecoder.h"
#include <QDebug>

Clip::Clip(const QString &mediaPath, const QString &name, qint64 startTime, qint64 duration,
           qint64 mediaStartTime, int trackIndex)
    : m_mediaPath(mediaPath), m_name(name), m_startTime(startTime), m_duration(duration),
      m_mediaStartTime(mediaStartTime), m_trackIndex(trackIndex)
{
}

TimelineModel::TimelineModel(QObject *parent)
    : QAbstractListModel(parent), m_totalDuration(0), m_trackCount(2)
{
}

TimelineModel::~TimelineModel()
{
}

int TimelineModel::rowCount(const QModelIndex &parent) const
{
    Q_UNUSED(parent)
    return m_clips.count();
}

QVariant TimelineModel::data(const QModelIndex &index, int role) const
{
    if (index.row() < 0 || index.row() >= m_clips.count())
        return QVariant();

    const Clip &clip = m_clips[index.row()];

    switch (role) {
    case MediaPathRole:
        return clip.mediaPath();
    case NameRole:
        return clip.name();
    case StartTimeRole:
        return clip.startTime();
    case DurationRole:
        return clip.duration();
    case EndTimeRole:
        return clip.endTime();
    case MediaStartTimeRole:
        return clip.mediaStartTime();
    case TrackIndexRole:
        return clip.trackIndex();
    case ThumbnailRole:
        return clip.thumbnail();
    default:
        return QVariant();
    }
}

QHash<int, QByteArray> TimelineModel::roleNames() const
{
    QHash<int, QByteArray> roles;
    roles[MediaPathRole] = "mediaPath";
    roles[NameRole] = "name";
    roles[StartTimeRole] = "startTime";
    roles[DurationRole] = "duration";
    roles[EndTimeRole] = "endTime";
    roles[MediaStartTimeRole] = "mediaStartTime";
    roles[TrackIndexRole] = "trackIndex";
    roles[ThumbnailRole] = "thumbnail";
    return roles;
}

void TimelineModel::addClip(const QString &mediaPath, const QString &name, qint64 startTime,
                            qint64 duration, qint64 mediaStartTime, int trackIndex)
{
    MediaDecoder decoder;
    QImage thumbnail;

    if (decoder.open(mediaPath)) {
        thumbnail = decoder.getVideoFrame(mediaStartTime);
        if (!thumbnail.isNull()) {
            thumbnail = thumbnail.scaled(320, 180, Qt::KeepAspectRatio, Qt::SmoothTransformation);
        }
        decoder.close();
    }

    Clip clip(mediaPath, name, startTime, duration, mediaStartTime, trackIndex);
    clip.setThumbnail(thumbnail);

    beginInsertRows(QModelIndex(), m_clips.count(), m_clips.count());
    m_clips.append(clip);
    endInsertRows();

    updateTotalDuration();
}

void TimelineModel::removeClip(int index)
{
    if (index < 0 || index >= m_clips.count())
        return;

    beginRemoveRows(QModelIndex(), index, index);
    m_clips.removeAt(index);
    endRemoveRows();

    updateTotalDuration();
}

void TimelineModel::clear()
{
    beginResetModel();
    m_clips.clear();
    endResetModel();

    updateTotalDuration();
}

Clip TimelineModel::getClip(int index) const
{
    if (index < 0 || index >= m_clips.count())
        return Clip();
    return m_clips[index];
}

int TimelineModel::count() const
{
    return m_clips.count();
}

QList<Clip> TimelineModel::getClipsAtTime(qint64 time, int trackIndex) const
{
    QList<Clip> result;
    for (const Clip &clip : m_clips) {
        if (clip.containsTime(time) && (trackIndex == -1 || clip.trackIndex() == trackIndex)) {
            result.append(clip);
        }
    }
    return result;
}

qint64 TimelineModel::totalDuration() const
{
    return m_totalDuration;
}

int TimelineModel::trackCount() const
{
    return m_trackCount;
}

void TimelineModel::moveClip(int index, qint64 newStartTime, int newTrackIndex)
{
    if (index < 0 || index >= m_clips.count())
        return;

    Clip &clip = m_clips[index];
    clip.setStartTime(newStartTime);
    clip.setTrackIndex(newTrackIndex);

    QModelIndex modelIndex = this->index(index);
    emit dataChanged(modelIndex, modelIndex);

    updateTotalDuration();
}

void TimelineModel::trimClipStart(int index, qint64 newStartTime)
{
    if (index < 0 || index >= m_clips.count())
        return;

    Clip &clip = m_clips[index];
    qint64 delta = newStartTime - clip.startTime();
    if (delta > 0 && delta < clip.duration()) {
        clip.setStartTime(newStartTime);
        clip.setDuration(clip.duration() - delta);
        clip.setMediaStartTime(clip.mediaStartTime() + delta);

        QModelIndex modelIndex = this->index(index);
        emit dataChanged(modelIndex, modelIndex);

        updateTotalDuration();
    }
}

void TimelineModel::trimClipEnd(int index, qint64 newEndTime)
{
    if (index < 0 || index >= m_clips.count())
        return;

    Clip &clip = m_clips[index];
    qint64 newDuration = newEndTime - clip.startTime();
    if (newDuration > 0 && newDuration < clip.duration()) {
        clip.setDuration(newDuration);

        QModelIndex modelIndex = this->index(index);
        emit dataChanged(modelIndex, modelIndex);

        updateTotalDuration();
    }
}

void TimelineModel::splitClip(int index, qint64 splitTime)
{
    if (index < 0 || index >= m_clips.count())
        return;

    Clip original = m_clips[index];
    if (!original.containsTime(splitTime) || splitTime == original.startTime())
        return;

    qint64 firstDuration = splitTime - original.startTime();
    qint64 secondDuration = original.duration() - firstDuration;

    beginRemoveRows(QModelIndex(), index, index);
    m_clips.removeAt(index);
    endRemoveRows();

    Clip firstClip(original.mediaPath(), original.name(),
                   original.startTime(), firstDuration,
                   original.mediaStartTime(), original.trackIndex());
    firstClip.setThumbnail(original.thumbnail());

    Clip secondClip(original.mediaPath(), original.name(),
                    splitTime, secondDuration,
                    original.mediaStartTime() + firstDuration, original.trackIndex());
    secondClip.setThumbnail(original.thumbnail());

    beginInsertRows(QModelIndex(), index, index + 1);
    m_clips.insert(index, firstClip);
    m_clips.insert(index + 1, secondClip);
    endInsertRows();

    updateTotalDuration();
}

qint64 TimelineModel::pixelsToTime(qreal pixels, qreal timelineWidth) const
{
    if (timelineWidth <= 0 || m_totalDuration <= 0)
        return 0;
    return static_cast<qint64>(pixels * m_totalDuration / timelineWidth);
}

qreal TimelineModel::timeToPixels(qint64 time, qreal timelineWidth) const
{
    if (m_totalDuration <= 0)
        return 0;
    return static_cast<qreal>(time) * timelineWidth / m_totalDuration;
}

void TimelineModel::updateTotalDuration()
{
    qint64 maxEndTime = 0;
    for (const Clip &clip : m_clips) {
        if (clip.endTime() > maxEndTime) {
            maxEndTime = clip.endTime();
        }
    }

    if (maxEndTime != m_totalDuration) {
        m_totalDuration = maxEndTime;
        emit totalDurationChanged();
    }
}

void TimelineModel::addTransition(int startClipIndex, int endClipIndex, int transitionType, qint64 durationMs)
{
    if (startClipIndex < 0 || startClipIndex >= m_clips.size()) return;
    if (endClipIndex < 0 || endClipIndex >= m_clips.size()) return;
    if (startClipIndex == endClipIndex) return;

    const Clip &startClip = m_clips[startClipIndex];
    const Clip &endClip = m_clips[endClipIndex];

    if (startClip.trackIndex() != endClip.trackIndex()) return;

    Transition::Type type = static_cast<Transition::Type>(transitionType);
    Transition transition(type, startClipIndex, endClipIndex, durationMs);
    m_transitions.append(transition);
}

void TimelineModel::removeTransition(int transitionIndex)
{
    if (transitionIndex >= 0 && transitionIndex < m_transitions.size()) {
        m_transitions.removeAt(transitionIndex);
    }
}

int TimelineModel::transitionCount() const
{
    return m_transitions.size();
}

Transition TimelineModel::getTransition(int index) const
{
    if (index >= 0 && index < m_transitions.size()) {
        return m_transitions[index];
    }
    return Transition();
}

QList<Transition> TimelineModel::getTransitionsAtTime(qint64 time) const
{
    QList<Transition> result;
    for (const Transition &transition : m_transitions) {
        if (transition.startClipIndex() < 0 || transition.startClipIndex() >= m_clips.size()) continue;
        if (transition.endClipIndex() < 0 || transition.endClipIndex() >= m_clips.size()) continue;

        const Clip &startClip = m_clips[transition.startClipIndex()];
        qint64 transitionStartTime = startClip.endTime() - transition.durationMs();
        qint64 transitionEndTime = startClip.endTime();

        if (time >= transitionStartTime && time < transitionEndTime) {
            result.append(transition);
        }
    }
    return result;
}

qreal TimelineModel::getTransitionProgress(qint64 time, const Transition &transition) const
{
    if (transition.startClipIndex() < 0 || transition.startClipIndex() >= m_clips.size()) {
        return 0.0;
    }

    const Clip &startClip = m_clips[transition.startClipIndex()];
    qint64 transitionStartTime = startClip.endTime() - transition.durationMs();

    if (transition.durationMs() <= 0) return 0.0;

    qreal progress = static_cast<qreal>(time - transitionStartTime) / transition.durationMs();
    return qBound(0.0, progress, 1.0);
}
