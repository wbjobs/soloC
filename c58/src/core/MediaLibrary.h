#ifndef MEDIALIBRARY_H
#define MEDIALIBRARY_H

#include <QObject>
#include <QAbstractListModel>
#include <QStringList>
#include <QUrl>
#include <QImage>

class MediaDecoder;

class MediaItem
{
public:
    MediaItem() {}
    MediaItem(const QString &path, const QString &name, qint64 duration,
              int width, int height, bool hasAudio, const QImage &thumbnail);

    QString path() const { return m_path; }
    QString name() const { return m_name; }
    qint64 duration() const { return m_duration; }
    int width() const { return m_width; }
    int height() const { return m_height; }
    bool hasAudio() const { return m_hasAudio; }
    QImage thumbnail() const { return m_thumbnail; }

private:
    QString m_path;
    QString m_name;
    qint64 m_duration;
    int m_width;
    int m_height;
    bool m_hasAudio;
    QImage m_thumbnail;
};

class MediaLibrary : public QAbstractListModel
{
    Q_OBJECT

public:
    enum MediaRoles {
        PathRole = Qt::UserRole + 1,
        NameRole,
        DurationRole,
        WidthRole,
        HeightRole,
        HasAudioRole,
        ThumbnailRole
    };

    explicit MediaLibrary(QObject *parent = nullptr);
    ~MediaLibrary();

    int rowCount(const QModelIndex &parent = QModelIndex()) const override;
    QVariant data(const QModelIndex &index, int role = Qt::DisplayRole) const override;
    QHash<int, QByteArray> roleNames() const override;

    Q_INVOKABLE bool addMedia(const QUrl &url);
    Q_INVOKABLE bool addMedia(const QString &path);
    Q_INVOKABLE void removeMedia(int index);
    Q_INVOKABLE void clear();
    Q_INVOKABLE MediaItem getMedia(int index) const;
    Q_INVOKABLE int count() const;

private:
    QString formatDuration(qint64 ms) const;

    QList<MediaItem> m_mediaItems;
};

#endif
