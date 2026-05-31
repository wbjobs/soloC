import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import VideoEditor 1.0

Rectangle {
    id: root
    color: "#000000"

    VideoSurface {
        id: videoSurface
        anchors.fill: parent
        frame: playerController.currentFrame
    }

    Connections {
        target: playerController
        function onCurrentFrameChanged() {
            videoSurface.frame = playerController.currentFrame
        }
    }

    Text {
        anchors.centerIn: parent
        text: "Preview Window"
        color: "#ffffff"
        font.pixelSize: 24
        visible: playerController.currentFrame.isNull
    }
}
