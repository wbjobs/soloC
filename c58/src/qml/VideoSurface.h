#ifndef VIDEOSURFACE_H
#define VIDEOSURFACE_H

#include <QQuickPaintedItem>
#include <QImage>

class VideoSurface : public QQuickPaintedItem
{
    Q_OBJECT
    Q_PROPERTY(QImage frame READ frame WRITE setFrame NOTIFY frameChanged)

public:
    explicit VideoSurface(QQuickItem *parent = nullptr);

    QImage frame() const;
    void setFrame(const QImage &frame);

    void paint(QPainter *painter) override;

signals:
    void frameChanged();

private:
    QImage m_frame;
};

#endif
