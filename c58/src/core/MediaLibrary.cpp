#include "MediaLibrary.h"
#include "MediaDecoder.h"
#include <QFileInfo>
#include <QDebug>

MediaItem::MediaItem(const QString &path, const QString &name, qint64 duration,
                     int width, int height, bool hasAudio, const QImage &thumbnail)
    : m_path(path), m_name(name), m_duration(duration), m_width(width), m_height(height),
      m_hasAudio(hasAudio), m_thumbnail(thumbnail)
{
}

MediaLibrary::MediaLibrary(QObject *parent)
    : QAbstractListModel(parent)
{
}

MediaLibrary::~MediaLibrary()
{
}

int MediaLibrary::rowCount(const QModelIndex &parent) const
{
    Q_UNUSED(parent)
    return m_mediaItems.count();
}

QVariant MediaLibrary::data(const QModelIndex &index, int role) const
{
    if (index.row() < 0 || index.row() >= m_mediaItems.count())
        return QVariant();

    const MediaItem &item = m_mediaItems[index.row()];

    switch (role) {
    case PathRole:
        return item.path();
    case NameRole:
        return item.name();
    case DurationRole:
        return formatDuration(item.duration());
    case WidthRole:
        return item.width();
    case HeightRole:
        return item.height();
    case HasAudioRole:
        return item.hasAudio();
    case ThumbnailRole:
        return item.thumbnail();
    default:
        return QVariant();
    }
}

QHash<int, QByteArray> MediaLibrary::roleNames() const
{
    QHash<int, QByteArray> roles;
    roles[PathRole] = "path";
    roles[NameRole] = "name";
    roles[DurationRole] = "duration";
    roles[WidthRole] = "width";
    roles[HeightRole] = "height";
    roles[HasAudioRole] = "hasAudio";
    roles[ThumbnailRole] = "thumbnail";
    return roles;
}

bool MediaLibrary::addMedia(const QUrl &url)
{
    return addMedia(url.toLocalFile());
}

bool MediaLibrary::addMedia(const QString &path)
{
    if (path.isEmpty())
        return false;

    QFileInfo fileInfo(path);
    if (!fileInfo.exists()) {
        qDebug() << "File does not exist:" << path;
        return false;
    }

    MediaDecoder decoder;
    if (!decoder.open(path)) {
        qDebug() << "Could not open media file:" << path;
        return false;
    }

    QImage thumbnail = decoder.getVideoFrame(0);
    if (!thumbnail.isNull()) {
        thumbnail = thumbnail.scaled(160, 90, Qt::KeepAspectRatio, Qt::SmoothTransformation);
    }

    MediaItem item(
        path,
        fileInfo.fileName(),
        decoder.duration(),
        decoder.videoWidth(),
        decoder.videoHeight(),
        decoder.sampleRate() > 0,
        thumbnail
    );

    decoder.close();

    beginInsertRows(QModelIndex(), m_mediaItems.count(), m_mediaItems.count());
    m_mediaItems.append(item);
    endInsertRows();

    return true;
}

void MediaLibrary::removeMedia(int index)
{
    if (index < 0 || index >= m_mediaItems.count())
        return;

    beginRemoveRows(QModelIndex(), index, index);
    m_mediaItems.removeAt(index);
    endRemoveRows();
}

void MediaLibrary::clear()
{
    beginResetModel();
    m_mediaItems.clear();
    endResetModel();
}

MediaItem MediaLibrary::getMedia(int index) const
{
    if (index < 0 || index >= m_mediaItems.count())
        return MediaItem();
    return m_mediaItems[index];
}

int MediaLibrary::count() const
{
    return m_mediaItems.count();
}

QString MediaLibrary::formatDuration(qint64 ms) const
{
    int seconds = ms / 1000;
    int minutes = seconds / 60;
    int hours = minutes / 60;

    seconds = seconds % 60;
    minutes = minutes % 60;

    if (hours > 0) {
        return QString("%1:%2:%3")
            .arg(hours, 2, 10, QChar('0'))
            .arg(minutes, 2, 10, QChar('0'))
            .arg(seconds, 2, 10, QChar('0'));
    } else {
        return QString("%1:%2")
            .arg(minutes, 2, 10, QChar('0'))
            .arg(seconds, 2, 10, QChar('0'));
    }
}
