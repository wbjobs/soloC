#include "MainWindow.h"
#include "OpenGLViewer.h"
#include <QFileDialog>
#include <QMessageBox>
#include <QHeaderView>
#include <QVBoxLayout>
#include <QHBoxLayout>
#include <QIcon>
#include <QApplication>
#include <QGroupBox>
#include <QLabel>
#include <QFormLayout>
#include <QFileInfo>

MainWindow::MainWindow(QWidget *parent)
    : QMainWindow(parent)
    , m_viewer(nullptr)
    , m_propertyTable(nullptr)
    , m_statusLabel(nullptr)
    , m_clippingEnabledCheckBox(nullptr)
    , m_clippingAxisComboBox(nullptr)
    , m_clippingPositionSpinBox(nullptr)
    , m_clippingSizeSpinBox(nullptr)
    , m_resetClippingButton(nullptr) {
    setWindowTitle(tr("CAD Viewer - OpenGL STEP Viewer"));
    setMinimumSize(1000, 700);

    m_viewer = new OpenGLViewer(this);
    setCentralWidget(m_viewer);

    createActions();
    createMenus();
    createToolBar();
    createStatusBar();
    createPropertyPanel();
    createClippingPanel();

    m_statusLabel->setText(tr("Ready. Open a STEP file to view."));
}

MainWindow::~MainWindow() {
}

void MainWindow::createActions() {
    m_openAction = new QAction(tr("&Open..."), this);
    m_openAction->setShortcut(QKeySequence::Open);
    m_openAction->setStatusTip(tr("Open a STEP file"));
    connect(m_openAction, &QAction::triggered, this, &MainWindow::onOpenFile);

    m_saveAction = new QAction(tr("&Save"), this);
    m_saveAction->setShortcut(QKeySequence::Save);
    m_saveAction->setStatusTip(tr("Save current file"));
    m_saveAction->setEnabled(false);
    connect(m_saveAction, &QAction::triggered, this, &MainWindow::onSaveFile);

    m_exportStlAction = new QAction(tr("&Export STL..."), this);
    m_exportStlAction->setShortcut(QKeySequence(tr("Ctrl+E")));
    m_exportStlAction->setStatusTip(tr("Export model to STL format"));
    m_exportStlAction->setEnabled(false);
    connect(m_exportStlAction, &QAction::triggered, this, &MainWindow::onExportStl);

    m_exitAction = new QAction(tr("E&xit"), this);
    m_exitAction->setShortcut(QKeySequence::Quit);
    m_exitAction->setStatusTip(tr("Exit the application"));
    connect(m_exitAction, &QAction::triggered, this, &MainWindow::onExit);

    m_fitAllAction = new QAction(tr("&Fit All"), this);
    m_fitAllAction->setStatusTip(tr("Fit model to view"));
    connect(m_fitAllAction, &QAction::triggered, this, &MainWindow::onFitAll);

    m_resetViewAction = new QAction(tr("&Reset View"), this);
    m_resetViewAction->setStatusTip(tr("Reset view to default"));
    connect(m_resetViewAction, &QAction::triggered, this, &MainWindow::onResetView);

    m_clippingAction = new QAction(tr("&Clipping Plane"), this);
    m_clippingAction->setCheckable(true);
    m_clippingAction->setStatusTip(tr("Toggle clipping plane"));
    connect(m_clippingAction, &QAction::toggled, this, &MainWindow::onClippingToggled);

    m_aboutAction = new QAction(tr("&About"), this);
    m_aboutAction->setStatusTip(tr("Show about dialog"));
    connect(m_aboutAction, &QAction::triggered, this, &MainWindow::onAbout);
}

void MainWindow::createMenus() {
    m_fileMenu = menuBar()->addMenu(tr("&File"));
    m_fileMenu->addAction(m_openAction);
    m_fileMenu->addAction(m_saveAction);
    m_fileMenu->addAction(m_exportStlAction);
    m_fileMenu->addSeparator();
    m_fileMenu->addAction(m_exitAction);

    m_viewMenu = menuBar()->addMenu(tr("&View"));
    m_viewMenu->addAction(m_fitAllAction);
    m_viewMenu->addAction(m_resetViewAction);
    m_viewMenu->addSeparator();
    m_viewMenu->addAction(m_clippingAction);

    m_helpMenu = menuBar()->addMenu(tr("&Help"));
    m_helpMenu->addAction(m_aboutAction);
}

void MainWindow::createToolBar() {
    m_fileToolBar = addToolBar(tr("File"));
    m_fileToolBar->addAction(m_openAction);
    m_fileToolBar->addAction(m_saveAction);
    m_fileToolBar->addAction(m_exportStlAction);

    m_viewToolBar = addToolBar(tr("View"));
    m_viewToolBar->addAction(m_fitAllAction);
    m_viewToolBar->addAction(m_resetViewAction);
    m_viewToolBar->addSeparator();
    m_viewToolBar->addAction(m_clippingAction);
}

void MainWindow::createStatusBar() {
    m_statusLabel = new QLabel(this);
    statusBar()->addWidget(m_statusLabel);
}

void MainWindow::createPropertyPanel() {
    m_propertyDock = new QDockWidget(tr("Model Properties"), this);
    m_propertyDock->setAllowedAreas(Qt::RightDockWidgetArea | Qt::LeftDockWidgetArea);
    m_propertyDock->setMinimumWidth(280);

    m_propertyTable = new QTableWidget(m_propertyDock);
    m_propertyTable->setColumnCount(2);
    m_propertyTable->setHorizontalHeaderLabels(QStringList() << tr("Property") << tr("Value"));
    m_propertyTable->horizontalHeader()->setStretchLastSection(true);
    m_propertyTable->verticalHeader()->setVisible(false);
    m_propertyTable->setEditTriggers(QAbstractItemView::NoEditTriggers);
    m_propertyTable->setSelectionMode(QAbstractItemView::NoSelection);
    m_propertyTable->setAlternatingRowColors(true);

    m_propertyDock->setWidget(m_propertyTable);
    addDockWidget(Qt::RightDockWidgetArea, m_propertyDock);

    updatePropertyPanel();
}

void MainWindow::createClippingPanel() {
    m_clippingDock = new QDockWidget(tr("Clipping Plane"), this);
    m_clippingDock->setAllowedAreas(Qt::RightDockWidgetArea | Qt::LeftDockWidgetArea | Qt::BottomDockWidgetArea);
    m_clippingDock->setMinimumWidth(250);

    QWidget* container = new QWidget(m_clippingDock);
    QVBoxLayout* mainLayout = new QVBoxLayout(container);

    QGroupBox* controlGroup = new QGroupBox(tr("Clipping Control"), container);
    QFormLayout* formLayout = new QFormLayout(controlGroup);

    m_clippingEnabledCheckBox = new QCheckBox(tr("Enable Clipping"), controlGroup);
    m_clippingEnabledCheckBox->setChecked(false);
    connect(m_clippingEnabledCheckBox, &QCheckBox::toggled, this, &MainWindow::onClippingToggled);

    m_clippingAxisComboBox = new QComboBox(controlGroup);
    m_clippingAxisComboBox->addItem(tr("X Axis"), static_cast<int>(ClippingPlaneAxis::X));
    m_clippingAxisComboBox->addItem(tr("Y Axis"), static_cast<int>(ClippingPlaneAxis::Y));
    m_clippingAxisComboBox->addItem(tr("Z Axis"), static_cast<int>(ClippingPlaneAxis::Z));
    m_clippingAxisComboBox->setCurrentIndex(2);
    connect(m_clippingAxisComboBox, QOverload<int>::of(&QComboBox::currentIndexChanged),
            this, &MainWindow::onClippingAxisChanged);

    m_clippingPositionSpinBox = new QDoubleSpinBox(controlGroup);
    m_clippingPositionSpinBox->setRange(-1000.0, 1000.0);
    m_clippingPositionSpinBox->setSingleStep(1.0);
    m_clippingPositionSpinBox->setDecimals(2);
    m_clippingPositionSpinBox->setValue(0.0);
    m_clippingPositionSpinBox->setSuffix(" mm");
    connect(m_clippingPositionSpinBox, QOverload<double>::of(&QDoubleSpinBox::valueChanged),
            this, &MainWindow::onClippingPositionChanged);

    m_clippingSizeSpinBox = new QDoubleSpinBox(controlGroup);
    m_clippingSizeSpinBox->setRange(1.0, 10000.0);
    m_clippingSizeSpinBox->setSingleStep(10.0);
    m_clippingSizeSpinBox->setDecimals(0);
    m_clippingSizeSpinBox->setValue(100.0);
    m_clippingSizeSpinBox->setSuffix(" mm");
    connect(m_clippingSizeSpinBox, QOverload<double>::of(&QDoubleSpinBox::valueChanged),
            this, &MainWindow::onClippingSizeChanged);

    m_resetClippingButton = new QPushButton(tr("Reset"), controlGroup);
    connect(m_resetClippingButton, &QPushButton::clicked, [this]() {
        const QSignalBlocker blocker1(m_clippingPositionSpinBox);
        const QSignalBlocker blocker2(m_clippingSizeSpinBox);
        m_clippingPositionSpinBox->setValue(0.0);
        m_clippingSizeSpinBox->setValue(100.0);
        m_viewer->setClippingPosition(0.0);
        m_viewer->setClippingPlaneSize(100.0);
    });

    formLayout->addRow(m_clippingEnabledCheckBox);
    formLayout->addRow(tr("Plane Axis:"), m_clippingAxisComboBox);
    formLayout->addRow(tr("Position:"), m_clippingPositionSpinBox);
    formLayout->addRow(tr("Plane Size:"), m_clippingSizeSpinBox);

    QHBoxLayout* buttonLayout = new QHBoxLayout();
    buttonLayout->addStretch();
    buttonLayout->addWidget(m_resetClippingButton);
    formLayout->addRow(buttonLayout);

    QLabel* infoLabel = new QLabel(tr(
        "<b>Usage:</b><br>"
        "• Check 'Enable Clipping' to activate<br>"
        "• Select axis and adjust position<br>"
        "• The plane is shown in orange (semi-transparent)"
    ), controlGroup);
    infoLabel->setWordWrap(true);
    infoLabel->setStyleSheet("color: #666; font-size: 10px;");

    mainLayout->addWidget(controlGroup);
    mainLayout->addWidget(infoLabel);
    mainLayout->addStretch();

    m_clippingDock->setWidget(container);
    addDockWidget(Qt::RightDockWidgetArea, m_clippingDock);
    tabifyDockWidget(m_propertyDock, m_clippingDock);
    m_propertyDock->raise();
}

void MainWindow::updatePropertyPanel() {
    m_propertyTable->setRowCount(0);

    if (!m_properties.isValid()) {
        m_propertyTable->setRowCount(1);
        m_propertyTable->setItem(0, 0, new QTableWidgetItem(tr("Status")));
        m_propertyTable->setItem(0, 1, new QTableWidgetItem(tr("No model loaded")));
        return;
    }

    const ModelInfo& info = m_properties.getInfo();

    int row = 0;
    auto addProperty = [&](const QString& name, const QString& value) {
        m_propertyTable->insertRow(row);
        m_propertyTable->setItem(row, 0, new QTableWidgetItem(name));
        m_propertyTable->setItem(row, 1, new QTableWidgetItem(value));
        row++;
    };

    addProperty(tr("Shape Type"), info.shapeType);
    addProperty(tr("Volume"), QString("%1 mm³").arg(info.volume, 0, 'f', 3));
    addProperty(tr("Surface Area"), QString("%1 mm²").arg(info.surfaceArea, 0, 'f', 3));
    addProperty(tr("Mass (Steel)"), QString("%1 kg").arg(info.mass, 0, 'f', 3));
    addProperty(tr("Vertices"), QString::number(info.vertexCount));
    addProperty(tr("Edges"), QString::number(info.edgeCount));
    addProperty(tr("Faces"), QString::number(info.faceCount));
    addProperty(tr("Solids"), QString::number(info.solidCount));

    addProperty(tr("Bounding Box Min"), 
        QString("(%1, %2, %3)")
            .arg(info.boundingBoxMinX, 0, 'f', 2)
            .arg(info.boundingBoxMinY, 0, 'f', 2)
            .arg(info.boundingBoxMinZ, 0, 'f', 2));

    addProperty(tr("Bounding Box Max"), 
        QString("(%1, %2, %3)")
            .arg(info.boundingBoxMaxX, 0, 'f', 2)
            .arg(info.boundingBoxMaxY, 0, 'f', 2)
            .arg(info.boundingBoxMaxZ, 0, 'f', 2));

    addProperty(tr("Center of Mass"), 
        QString("(%1, %2, %3)")
            .arg(info.centerX, 0, 'f', 2)
            .arg(info.centerY, 0, 'f', 2)
            .arg(info.centerZ, 0, 'f', 2));
}

void MainWindow::loadFile(const QString& filePath) {
    m_statusLabel->setText(tr("Loading: %1").arg(filePath));
    QApplication::processEvents();

    bool success = m_parser.loadStepFile(filePath);

    if (!success) {
        QMessageBox::critical(this, tr("Error"), 
            tr("Failed to load STEP file:\n%1").arg(filePath));
        m_statusLabel->setText(tr("Ready"));
        return;
    }

    m_currentFilePath = filePath;
    m_viewer->setShape(m_parser.getShape());
    
    if (m_parser.hasShape()) {
        m_properties.calculateProperties(m_parser.getShape());
        m_viewer->fitAll();
        m_exportStlAction->setEnabled(true);
    }

    updatePropertyPanel();
    m_statusLabel->setText(tr("Loaded: %1").arg(filePath));
    setWindowTitle(tr("CAD Viewer - %1").arg(filePath));
}

void MainWindow::onOpenFile() {
    QString filePath = QFileDialog::getOpenFileName(this,
        tr("Open STEP File"),
        "",
        tr("STEP Files (*.step *.stp);;All Files (*)"));

    if (!filePath.isEmpty()) {
        loadFile(filePath);
    }
}

void MainWindow::onSaveFile() {
    QMessageBox::information(this, tr("Information"), tr("Save functionality not implemented yet."));
}

void MainWindow::onExportStl() {
    exportToStl();
}

void MainWindow::exportToStl() {
    if (!m_parser.hasShape()) {
        QMessageBox::warning(this, tr("Warning"), tr("No model loaded to export."));
        return;
    }

    QString defaultName = "model.stl";
    if (!m_currentFilePath.isEmpty()) {
        QFileInfo fi(m_currentFilePath);
        defaultName = fi.completeBaseName() + ".stl";
    }

    QString filePath = QFileDialog::getSaveFileName(this,
        tr("Export STL File"),
        defaultName,
        tr("Binary STL (*.stl);;ASCII STL (*.stl)"));

    if (filePath.isEmpty()) {
        return;
    }

    StlExportMode mode = StlExportMode::Binary;
    if (filePath.toLower().endsWith("_ascii.stl") || 
        QMessageBox::question(this, tr("STL Format"),
            tr("Export as binary STL?\n\n(Select 'No' for ASCII format)"),
            QMessageBox::Yes | QMessageBox::No, QMessageBox::Yes) == QMessageBox::No) {
        mode = StlExportMode::ASCII;
    }

    m_statusLabel->setText(tr("Exporting to STL..."));
    QApplication::processEvents();

    bool success = StlExporter::exportShape(
        m_parser.getShape(),
        filePath,
        mode,
        0.1
    );

    if (success) {
        m_statusLabel->setText(tr("Exported: %1").arg(filePath));
        QMessageBox::information(this, tr("Success"), 
            tr("Model exported successfully:\n%1").arg(filePath));
    } else {
        m_statusLabel->setText(tr("Export failed"));
        QMessageBox::critical(this, tr("Error"), 
            tr("Failed to export STL file:\n%1").arg(filePath));
    }
}

void MainWindow::onExit() {
    close();
}

void MainWindow::onFitAll() {
    m_viewer->fitAll();
}

void MainWindow::onResetView() {
    m_viewer->resetView();
}

void MainWindow::onAbout() {
    QMessageBox::about(this, tr("About CAD Viewer"),
        tr("<h3>CAD Viewer</h3>"
           "<p>OpenGL-based STEP file viewer</p>"
           "<p><b>Features:</b></p>"
           "<ul>"
           "<li>Load and view STEP (*.step, *.stp) files</li>"
           "<li>Rotate model with left mouse button</li>"
           "<li>Pan with right or middle mouse button</li>"
           "<li>Zoom with mouse wheel</li>"
           "<li>View model properties (volume, surface area, etc.)</li>"
           "<li>Clipping plane (X/Y/Z axis)</li>"
           "<li>Export to STL format</li>"
           "</ul>"
           "<p><b>Powered by:</b> Qt5, OpenGL, OpenCASCADE</p>"));
}

void MainWindow::onClippingToggled(bool enabled) {
    if (m_clippingAction->isChecked() != enabled) {
        m_clippingAction->setChecked(enabled);
    }
    if (m_clippingEnabledCheckBox->isChecked() != enabled) {
        m_clippingEnabledCheckBox->setChecked(enabled);
    }
    m_viewer->setClippingEnabled(enabled);

    if (enabled) {
        m_statusLabel->setText(tr("Clipping plane enabled"));
    } else {
        m_statusLabel->setText(tr("Clipping plane disabled"));
    }
}

void MainWindow::onClippingAxisChanged(int index) {
    ClippingPlaneAxis axis = static_cast<ClippingPlaneAxis>(
        m_clippingAxisComboBox->itemData(index).toInt());
    m_viewer->setClippingAxis(axis);
}

void MainWindow::onClippingPositionChanged(double value) {
    m_viewer->setClippingPosition(value);
}

void MainWindow::onClippingSizeChanged(double value) {
    m_viewer->setClippingPlaneSize(value);
}
