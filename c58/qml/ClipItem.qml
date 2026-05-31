import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

Rectangle {
    id: root
    color: "#0078d4"
    border.color: "#005a9e"
    border.width: 2
    radius: 4

    property int clipStart: 0
    property int clipDuration: 0
    property string clipName: ""
    property var clipThumbnail: null
    property int totalDuration: 1
    property real timelineWidth: 0

    x: (clipStart / totalDuration) * timelineWidth
    width: (clipDuration / totalDuration) * timelineWidth
    height: parent.height - 10
    anchors.verticalCenter: parent.verticalCenter

    Row {
        anchors.fill: parent
        anchors.margins: 5
        spacing: 5

        Image {
            width: 60
            height: parent.height
            source: clipThumbnail
            fillMode: Image.PreserveAspectCrop
            visible: clipThumbnail !== null
        }

        Text {
            anchors.verticalCenter: parent.verticalCenter
            text: clipName
            color: "#ffffff"
            font.pixelSize: 11
            elide: Text.ElideRight
            maximumLineCount: 2
            wrapMode: Text.Wrap
        }
    }

    MouseArea {
        anchors.fill: parent
        hoverEnabled: true

        onEntered: parent.border.color = "#1e90ff"
        onExited: parent.border.color = "#005a9e"

        onClicked: {
            console.log("Clip clicked:", clipName)
        }

        Rectangle {
            id: leftHandle
            width: 8
            height: parent.height
            anchors.left: parent.left
            color: "transparent"

            MouseArea {
                anchors.fill: parent
                cursorShape: Qt.SplitHCursor
                hoverEnabled: true
            }
        }

        Rectangle {
            id: rightHandle
            width: 8
            height: parent.height
            anchors.right: parent.right
            color: "transparent"

            MouseArea {
                anchors.fill: parent
                cursorShape: Qt.SplitHCursor
                hoverEnabled: true
            }
        }
    }
}
