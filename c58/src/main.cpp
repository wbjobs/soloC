#include <QGuiApplication>
#include <QQmlApplicationEngine>
#include <QQmlContext>
#include <QQuickStyle>

#include "core/MediaLibrary.h"
#include "core/TimelineModel.h"
#include "core/PlayerController.h"
#include "qml/VideoSurface.h"

int main(int argc, char *argv[])
{
    QGuiApplication app(argc, argv);

    QQuickStyle::setStyle("Material");

    qmlRegisterType<MediaLibrary>("VideoEditor", 1, 0, "MediaLibrary");
    qmlRegisterType<TimelineModel>("VideoEditor", 1, 0, "TimelineModel");
    qmlRegisterType<PlayerController>("VideoEditor", 1, 0, "PlayerController");
    qmlRegisterType<VideoSurface>("VideoEditor", 1, 0, "VideoSurface");

    QQmlApplicationEngine engine;

    MediaLibrary mediaLibrary;
    TimelineModel timelineModel;
    PlayerController playerController;

    playerController.setTimelineModel(&timelineModel);

    engine.rootContext()->setContextProperty("mediaLibrary", &mediaLibrary);
    engine.rootContext()->setContextProperty("timelineModel", &timelineModel);
    engine.rootContext()->setContextProperty("playerController", &playerController);

    const QUrl url(u"qrc:/qml/main.qml"_qs);
    QObject::connect(&engine, &QQmlApplicationEngine::objectCreated,
                     &app, [url](QObject *obj, const QUrl &objUrl) {
        if (!obj && url == objUrl)
            QCoreApplication::exit(-1);
    }, Qt::QueuedConnection);
    engine.load(url);

    return app.exec();
}
