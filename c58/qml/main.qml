import QtQuick
import QtQuick.Controls
import QtQuick.Layouts

ApplicationWindow {
    id: root
    visible: true
    width: 1920
    height: 1080
    title: qsTr("Video Editor")

    color: "#1e1e1e"

    MainWindow {
        anchors.fill: parent
    }
}
