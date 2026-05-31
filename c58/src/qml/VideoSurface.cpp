#include "VideoSurface.h"
#include <QPainter>

VideoSurface::VideoSurface(QQuickItem *parent)
    : QQuickPaintedItem(parent)
{
    setRenderTarget(FramebufferObject);
}

QImage VideoSurface::frame() const
{
    return m_frame;
}

void VideoSurface::setFrame(const QImage &frame)
{
    if (m_frame == frame)
        return;

    m_frame = frame;
    emit frameChanged();
    update();
}

void VideoSurface::paint(QPainter *painter)
{
    if (m_frame.isNull()) {
        painter->fillRect(boundingRect(), Qt::black);
        return;
    }

    QRectF targetRect = boundingRect();
    QSizeF scaledSize = m_frame.size().scaled(targetRect.size(), Qt::KeepAspectRatio);

    QRectF centeredRect(
        targetRect.left() + (targetRect.width() - scaledSize.width()) / 2,
        targetRect.top() + (targetRect.height() - scaledSize.height()) / 2,
        scaledSize.width(),
        scaledSize.height()
    );

    painter->fillRect(boundingRect(), Qt::black);
    painter->drawImage(centeredRect, m_frame);
}
