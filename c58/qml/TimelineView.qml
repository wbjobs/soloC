import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

Rectangle {
    id: root
    color: "#1e1e1e"

    property int trackHeight: 80
    property int trackCount: 2

    ColumnLayout {
        anchors.fill: parent
        spacing: 0

        Rectangle {
            Layout.fillWidth: true
            Layout.preferredHeight: 30
            color: "#2d2d2d"

            RowLayout {
                anchors.fill: parent
                anchors.leftMargin: 150
                spacing: 0

                Repeater {
                    model: 10
                    Rectangle {
                        width: (parent.width - 100) / 10
                        height: parent.height
                        border.color: "#3c3c3c"
                        border.width: 1

                        Text {
                            anchors.centerIn: parent
                            text: String(index * 10) + "s"
                            color: "#999999"
                            font.pixelSize: 10
                        }
                    }
                }
            }

            Rectangle {
                id: playhead
                width: 2
                height: parent.height
                color: "#ff0000"
                x: 150 + (playerController.currentTime / Math.max(timelineModel.totalDuration, 1)) * (parent.width - 150)
            }
        }

        ScrollView {
            Layout.fillWidth: true
            Layout.fillHeight: true

            Column {
                width: parent.width
                spacing: 1

                Repeater {
                    model: trackCount

                    TrackItem {
                        width: parent.width
                        height: trackHeight
                        trackIndex: index
                        timelineWidth: parent.width - 150
                    }
                }
            }
        }
    }

    MouseArea {
        anchors.fill: parent
        onClicked: {
            var timelineX = mouse.x - 150
            var timelineWidth = parent.width - 150
            if (timelineX >= 0 && timelineWidth > 0) {
                var time = (timelineX / timelineWidth) * timelineModel.totalDuration
                playerController.seek(time)
            }
        }
    }
}
