import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import QtQuick.Dialogs

Rectangle {
    id: root
    color: "#252526"

    ColumnLayout {
        anchors.fill: parent
        spacing: 0

        Rectangle {
            Layout.fillWidth: true
            Layout.preferredHeight: 40
            color: "#2d2d2d"

            Text {
                anchors.verticalCenter: parent.verticalCenter
                anchors.left: parent.left
                anchors.leftMargin: 15
                text: "Media Library"
                color: "#cccccc"
                font.pixelSize: 14
                font.bold: true
            }

            Button {
                anchors.verticalCenter: parent.verticalCenter
                anchors.right: parent.right
                anchors.rightMargin: 10
                text: "+"
                font.pixelSize: 16
                width: 30
                height: 30
                onClicked: openFileDialog()
            }
        }

        ScrollView {
            Layout.fillWidth: true
            Layout.fillHeight: true

            GridView {
                id: mediaGridView
                anchors.fill: parent
                cellWidth: 140
                cellHeight: 120
                model: mediaLibrary

                delegate: Rectangle {
                    width: mediaGridView.cellWidth - 10
                    height: mediaGridView.cellHeight - 10
                    color: "#3c3c3c"
                    border.color: "#555555"
                    radius: 4

                    MouseArea {
                        anchors.fill: parent
                        onClicked: {
                            mediaGridView.currentIndex = index
                        }
                        onDoubleClicked: {
                            var item = mediaLibrary.getMedia(index)
                            timelineModel.addClip(
                                item.path,
                                item.name,
                                timelineModel.totalDuration > 0 ? timelineModel.totalDuration : 0,
                                item.duration,
                                0,
                                0
                            )
                        }
                    }

                    Column {
                        anchors.fill: parent
                        anchors.margins: 5

                        Image {
                            width: parent.width - 10
                            height: 60
                            source: thumbnail
                            fillMode: Image.PreserveAspectCrop
                        }

                        Text {
                            width: parent.width - 10
                            text: name
                            color: "#ffffff"
                            font.pixelSize: 11
                            elide: Text.ElideRight
                            wrapMode: Text.Wrap
                            maximumLineCount: 2
                        }

                        Text {
                            text: duration
                            color: "#999999"
                            font.pixelSize: 10
                        }
                    }
                }
            }
        }
    }

    FileDialog {
        id: fileDialog
        title: "Select Media Files"
        nameFilters: ["Video Files (*.mp4 *.avi *.mov *.mkv *.wmv)", "Audio Files (*.mp3 *.wav *.aac *.flac)", "All Files (*)"]
        selectMultiple: true
        onAccepted: {
            for (var i = 0; i < fileDialog.files.length; i++) {
                mediaLibrary.addMedia(fileDialog.files[i])
            }
        }
    }

    function openFileDialog() {
        fileDialog.open()
    }
}
