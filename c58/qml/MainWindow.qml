import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

Rectangle {
    id: root
    color: "#1e1e1e"

    ColumnLayout {
        anchors.fill: parent
        spacing: 0

        RowLayout {
            Layout.fillWidth: true
            Layout.preferredHeight: 40

            ToolBar {
                Layout.fillWidth: true
                background: Rectangle {
                    color: "#2d2d2d"
                }

                RowLayout {
                    anchors.fill: parent
                    spacing: 10

                    ToolButton {
                        text: "Import"
                        font.pixelSize: 13
                        onClicked: mediaLibraryPanel.openFileDialog()
                    }

                    ToolButton {
                        text: "Export"
                        font.pixelSize: 13
                    }

                    ToolButton {
                        text: "Add Transition"
                        font.pixelSize: 13
                        onClicked: transitionDialog.open()
                    }

                    Item { Layout.fillWidth: true }

                    ComboBox {
                        width: 100
                        model: ["0.5x", "1x", "1.5x", "2x"]
                        currentIndex: 1
                        onCurrentIndexChanged: {
                            var rates = [0.5, 1.0, 1.5, 2.0]
                            playerController.playbackRate = rates[currentIndex]
                        }
                    }
                }
            }
        }

        RowLayout {
            Layout.fillWidth: true
            Layout.fillHeight: true
            spacing: 1

            MediaLibraryPanel {
                id: mediaLibraryPanel
                Layout.preferredWidth: 300
                Layout.fillHeight: true
            }

            PreviewWindow {
                id: previewWindow
                Layout.fillWidth: true
                Layout.fillHeight: true
            }
        }

        PlayerControls {
            id: playerControls
            Layout.fillWidth: true
            Layout.preferredHeight: 60
        }

        TimelineView {
            id: timelineView
            Layout.fillWidth: true
            Layout.preferredHeight: 300
        }
    }

    Dialog {
        id: transitionDialog
        title: "Add Transition"
        width: 400
        height: 300
        modal: true

        ColumnLayout {
            anchors.fill: parent
            spacing: 20
            anchors.margins: 20

            RowLayout {
                Layout.fillWidth: true
                Label {
                    text: "From Clip:"
                    font.pixelSize: 13
                }
                ComboBox {
                    id: fromClipCombo
                    Layout.fillWidth: true
                    model: timelineModel.count
                }
            }

            RowLayout {
                Layout.fillWidth: true
                Label {
                    text: "To Clip:"
                    font.pixelSize: 13
                }
                ComboBox {
                    id: toClipCombo
                    Layout.fillWidth: true
                    model: timelineModel.count
                }
            }

            RowLayout {
                Layout.fillWidth: true
                Label {
                    text: "Transition Type:"
                    font.pixelSize: 13
                }
                ComboBox {
                    id: transitionTypeCombo
                    Layout.fillWidth: true
                    model: ["Cross Dissolve"]
                }
            }

            RowLayout {
                Layout.fillWidth: true
                Label {
                    text: "Duration (ms):"
                    font.pixelSize: 13
                }
                TextField {
                    id: durationField
                    Layout.fillWidth: true
                    text: "1000"
                    validator: IntValidator {
                        bottom: 100
                        top: 5000
                    }
                }
            }

            Item { Layout.fillHeight: true }

            RowLayout {
                Layout.alignment: Qt.AlignRight

                Button {
                    text: "Cancel"
                    onClicked: transitionDialog.close()
                }

                Button {
                    text: "Add"
                    onClicked: {
                        var fromIdx = fromClipCombo.currentIndex
                        var toIdx = toClipCombo.currentIndex
                        var transitionType = transitionTypeCombo.currentIndex + 1
                        var duration = parseInt(durationField.text)

                        if (fromIdx !== toIdx && fromIdx >= 0 && toIdx >= 0) {
                            timelineModel.addTransition(fromIdx, toIdx, transitionType, duration)
                            transitionDialog.close()
                        }
                    }
                }
            }
        }

        onOpened: {
            fromClipCombo.model = timelineModel.count
            toClipCombo.model = timelineModel.count
        }
    }
}
