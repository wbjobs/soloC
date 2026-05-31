#ifndef MAINWINDOW_H
#define MAINWINDOW_H

#include <QMainWindow>
#include <QAction>
#include <QMenu>
#include <QToolBar>
#include <QStatusBar>
#include <QDockWidget>
#include <QTableWidget>
#include <QLabel>
#include <QGroupBox>
#include <QCheckBox>
#include <QComboBox>
#include <QDoubleSpinBox>
#include <QPushButton>
#include <QVBoxLayout>
#include <QHBoxLayout>
#include "StepParser.h"
#include "ModelProperties.h"
#include "StlExporter.h"
#include "OpenGLViewer.h"

class MainWindow : public QMainWindow {
    Q_OBJECT

public:
    explicit MainWindow(QWidget *parent = nullptr);
    ~MainWindow();

private slots:
    void onOpenFile();
    void onSaveFile();
    void onExportStl();
    void onExit();
    void onFitAll();
    void onResetView();
    void onAbout();

    void onClippingToggled(bool enabled);
    void onClippingAxisChanged(int index);
    void onClippingPositionChanged(double value);
    void onClippingSizeChanged(double value);

private:
    void createActions();
    void createMenus();
    void createToolBar();
    void createStatusBar();
    void createPropertyPanel();
    void createClippingPanel();
    void updatePropertyPanel();
    void loadFile(const QString& filePath);
    void exportToStl();

    OpenGLViewer *m_viewer;
    StepParser m_parser;
    ModelProperties m_properties;

    QMenu *m_fileMenu;
    QMenu *m_viewMenu;
    QMenu *m_helpMenu;

    QToolBar *m_fileToolBar;
    QToolBar *m_viewToolBar;

    QAction *m_openAction;
    QAction *m_saveAction;
    QAction *m_exportStlAction;
    QAction *m_exitAction;
    QAction *m_fitAllAction;
    QAction *m_resetViewAction;
    QAction *m_clippingAction;
    QAction *m_aboutAction;

    QDockWidget *m_propertyDock;
    QDockWidget *m_clippingDock;
    QTableWidget *m_propertyTable;
    QLabel *m_statusLabel;
    QString m_currentFilePath;

    QCheckBox *m_clippingEnabledCheckBox;
    QComboBox *m_clippingAxisComboBox;
    QDoubleSpinBox *m_clippingPositionSpinBox;
    QDoubleSpinBox *m_clippingSizeSpinBox;
    QPushButton *m_resetClippingButton;
};

#endif // MAINWINDOW_H
