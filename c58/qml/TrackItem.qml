import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

Rectangle {
    id: root
    color: "#2d2d2d"

    property int trackIndex: 0
    property real timelineWidth: 0

    Row {
        anchors.fill: parent
        spacing: 0

        Rectangle {
            width: 150
            height: parent.height
            color: "#3c3c3c"
            border.color: "#555555"

            Text {
                anchors.centerIn: parent
                text: "Track " + (trackIndex + 1)
                color: "#cccccc"
                font.pixelSize: 12
            }
        }

        Rectangle {
            width: parent.width - 150
            height: parent.height
            color: "#252526"

            Repeater {
                model: timelineModel

                ClipItem {
                    visible: model.trackIndex === root.trackIndex
                    clipStart: model.startTime
                    clipDuration: model.duration
                    clipName: model.name
                    clipThumbnail: model.thumbnail
                    totalDuration: timelineModel.totalDuration
                    timelineWidth: root.timelineWidth
                }
            }
        }
    }
}
