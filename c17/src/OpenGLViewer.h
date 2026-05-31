#ifndef OPENGLVIEWER_H
#define OPENGLVIEWER_H

#include <QOpenGLWidget>
#include <QOpenGLFunctions>
#include <QMouseEvent>
#include <QWheelEvent>
#include <QElapsedTimer>
#include <TopoDS_Shape.hxx>
#include <gp_Pln.hxx>
#include <vector>
#include <atomic>

struct VertexData {
    float x, y, z;
    float nx, ny, nz;
};

enum class ClippingPlaneAxis {
    X,
    Y,
    Z
};

class OpenGLViewer : public QOpenGLWidget, protected QOpenGLFunctions {
    Q_OBJECT

public:
    explicit OpenGLViewer(QWidget *parent = nullptr);
    ~OpenGLViewer();

    void setShape(const TopoDS_Shape& shape);
    void clearShape();
    void fitAll();
    void resetView();
    void setDisplayMode(int mode);
    const TopoDS_Shape& getShape() const { return m_originalShape; }

    void setClippingEnabled(bool enabled);
    bool isClippingEnabled() const { return m_clippingEnabled; }
    void setClippingPlane(ClippingPlaneAxis axis, double position, double size = 100.0);
    void setClippingAxis(ClippingPlaneAxis axis);
    void setClippingPosition(double position);
    void setClippingPlaneSize(double size);
    double getClippingPosition() const { return m_clippingPosition; }
    ClippingPlaneAxis getClippingAxis() const { return m_clippingAxis; }

signals:
    void clippingChanged();

protected:
    void initializeGL() override;
    void paintGL() override;
    void resizeGL(int w, int h) override;
    void mousePressEvent(QMouseEvent *event) override;
    void mouseMoveEvent(QMouseEvent *event) override;
    void mouseReleaseEvent(QMouseEvent *event) override;
    void wheelEvent(QWheelEvent *event) override;

private:
    bool buildMeshData(const TopoDS_Shape& shape);
    void updateClippedShape();
    void clearMeshData();
    void renderAxes();
    void renderMesh();
    void renderClippingPlane();
    void scheduleUpdate();

    TopoDS_Shape m_originalShape;
    TopoDS_Shape m_displayShape;
    std::vector<VertexData> m_vertices;
    GLuint m_displayList;
    bool m_displayListValid;

    bool m_clippingEnabled;
    ClippingPlaneAxis m_clippingAxis;
    double m_clippingPosition;
    double m_clippingPlaneSize;

    QElapsedTimer m_frameTimer;
    qint64 m_lastFrameTime;
    std::atomic<bool> m_updatePending;

    QPoint m_lastPos;
    Qt::MouseButton m_button;
    bool m_isDragging;
    double m_zoom;
    double m_rotX;
    double m_rotY;
    double m_panX;
    double m_panY;
};

#endif // OPENGLVIEWER_H
