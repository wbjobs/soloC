import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

Rectangle {
    id: root
    color: "#2d2d2d"

    ColumnLayout {
        anchors.fill: parent
        anchors.margins: 10
        spacing: 8

        RowLayout {
            Layout.fillWidth: true

            Text {
                text: formatTime(playerController.currentTime)
                color: "#ffffff"
                font.pixelSize: 12
                font.family: "Courier"
            }

            Slider {
                id: timeSlider
                Layout.fillWidth: true
                from: 0
                to: timelineModel.totalDuration > 0 ? timelineModel.totalDuration : 1
                value: playerController.currentTime
                onValueChanged: {
                    if (timeSlider.pressed) {
                        playerController.seek(timeSlider.value)
                    }
                }

                background: Rectangle {
                    height: 4
                    color: "#444444"
                    radius: 2

                    Rectangle {
                        height: 4
                        width: timeSlider.visualPosition * parent.width
                        color: "#0078d4"
                        radius: 2
                    }
                }

                handle: Rectangle {
                    width: 12
                    height: 12
                    radius: 6
                    color: "#0078d4"
                    x: timeSlider.visualPosition * (timeSlider.width - width)
                    anchors.verticalCenter: parent.verticalCenter
                }
            }

            Text {
                text: formatTime(timelineModel.totalDuration)
                color: "#ffffff"
                font.pixelSize: 12
                font.family: "Courier"
            }
        }

        RowLayout {
            Layout.alignment: Qt.AlignHCenter
            spacing: 15

            Button {
                text: "<<"
                font.pixelSize: 14
                width: 40
                height: 30
                onClicked: playerController.stepBackward()
            }

            Button {
                text: playerController.isPlaying ? "||" : ">"
                font.pixelSize: 16
                width: 50
                height: 35
                onClicked: playerController.togglePlayPause()
            }

            Button {
                text: ">>"
                font.pixelSize: 14
                width: 40
                height: 30
                onClicked: playerController.stepForward()
            }

            Button {
                text: "[]"
                font.pixelSize: 12
                width: 40
                height: 30
                onClicked: playerController.stop()
            }
        }
    }

    function formatTime(ms) {
        var seconds = Math.floor(ms / 1000)
        var minutes = Math.floor(seconds / 60)
        var hours = Math.floor(minutes / 60)

        seconds = seconds % 60
        minutes = minutes % 60

        if (hours > 0) {
            return String(hours).padStart(2, '0') + ":" +
                   String(minutes).padStart(2, '0') + ":" +
                   String(seconds).padStart(2, '0')
        } else {
            return String(minutes).padStart(2, '0') + ":" +
                   String(seconds).padStart(2, '0')
        }
    }

    Connections {
        target: playerController
        function onCurrentTimeChanged() {
            if (!timeSlider.pressed) {
                timeSlider.value = playerController.currentTime
            }
        }
    }

    Connections {
        target: timelineModel
        function onTotalDurationChanged() {
            timeSlider.to = timelineModel.totalDuration > 0 ? timelineModel.totalDuration : 1
        }
    }
}
