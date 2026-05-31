#include "OpenGLViewer.h"
#include <QMatrix4x4>
#include <QVector3D>
#include <QColor>
#include <QThread>
#include <BRepMesh_IncrementalMesh.hxx>
#include <Poly_Triangulation.hxx>
#include <Poly_Array1OfTriangle.hxx>
#include <TColgp_Array1OfPnt.hxx>
#include <TopExp_Explorer.hxx>
#include <TopoDS_Face.hxx>
#include <TopoDS.hxx>
#include <BRep_Tool.hxx>
#include <TopLoc_Location.hxx>
#include <gp_Pnt.hxx>
#include <gp_Vec.hxx>
#include <gp_Dir.hxx>
#include <gp_Pln.hxx>
#include <BRepPrimAPI_MakeHalfSpace.hxx>
#include <BRepAlgoAPI_Cut.hxx>
#include <TopoDS_Solid.hxx>
#include <TopoDS_Shell.hxx>
#include <TopoDS_Face.hxx>
#include <BRepBuilderAPI_MakeFace.hxx>
#include <GL/glu.h>
#include <cmath>

constexpr qint64 MIN_FRAME_INTERVAL_MS = 16;

OpenGLViewer::OpenGLViewer(QWidget *parent)
    : QOpenGLWidget(parent)
    , m_displayList(0)
    , m_displayListValid(false)
    , m_clippingEnabled(false)
    , m_clippingAxis(ClippingPlaneAxis::Z)
    , m_clippingPosition(0.0)
    , m_clippingPlaneSize(100.0)
    , m_lastFrameTime(0)
    , m_updatePending(false)
    , m_isDragging(false)
    , m_zoom(1.0)
    , m_rotX(-30.0)
    , m_rotY(45.0)
    , m_panX(0.0)
    , m_panY(0.0) {
    setMouseTracking(true);
    setFocusPolicy(Qt::StrongFocus);
    setAutoFillBackground(false);
    setAttribute(Qt::WA_OpaquePaintEvent, true);
    setAttribute(Qt::WA_NoSystemBackground, true);
    setUpdateBehavior(QOpenGLWidget::PartialUpdate);
    m_frameTimer.start();
}

void OpenGLViewer::initializeGL() {
    initializeOpenGLFunctions();

    glEnable(GL_DEPTH_TEST);
    glDepthFunc(GL_LEQUAL);
    
    glEnable(GL_LIGHTING);
    glEnable(GL_LIGHT0);
    
    GLfloat lightAmbient[] = { 0.3f, 0.3f, 0.3f, 1.0f };
    GLfloat lightDiffuse[] = { 0.9f, 0.9f, 0.9f, 1.0f };
    GLfloat lightSpecular[] = { 0.5f, 0.5f, 0.5f, 1.0f };
    GLfloat lightPosition[] = { 10.0f, 10.0f, 10.0f, 0.0f };
    
    glLightfv(GL_LIGHT0, GL_AMBIENT, lightAmbient);
    glLightfv(GL_LIGHT0, GL_DIFFUSE, lightDiffuse);
    glLightfv(GL_LIGHT0, GL_SPECULAR, lightSpecular);
    glLightfv(GL_LIGHT0, GL_POSITION, lightPosition);

    glEnable(GL_COLOR_MATERIAL);
    glColorMaterial(GL_FRONT_AND_BACK, GL_AMBIENT_AND_DIFFUSE);
    
    glEnable(GL_NORMALIZE);
    glShadeModel(GL_SMOOTH);
    
    glEnable(GL_CULL_FACE);
    glCullFace(GL_BACK);
    
    glClearColor(0.95f, 0.95f, 0.95f, 1.0f);
    
    m_displayList = glGenLists(1);
}

void OpenGLViewer::paintGL() {
    m_lastFrameTime = m_frameTimer.elapsed();
    m_updatePending.store(false);

    glClear(GL_COLOR_BUFFER_BIT | GL_DEPTH_BUFFER_BIT);

    glMatrixMode(GL_MODELVIEW);
    glLoadIdentity();

    gluLookAt(0.0, 0.0, 8.0 / m_zoom,
              0.0, 0.0, 0.0,
              0.0, 1.0, 0.0);

    glTranslated(m_panX, m_panY, 0.0);
    glRotated(m_rotX, 1.0, 0.0, 0.0);
    glRotated(m_rotY, 0.0, 1.0, 0.0);

    renderAxes();

    if (m_clippingEnabled) {
        renderClippingPlane();
    }

    if (!m_displayShape.IsNull() && !m_vertices.empty()) {
        glColor3f(0.3f, 0.6f, 0.9f);
        glPolygonMode(GL_FRONT_AND_BACK, GL_FILL);
        renderMesh();
    }
}

void OpenGLViewer::scheduleUpdate() {
    if (m_updatePending.exchange(true)) {
        return;
    }

    qint64 currentTime = m_frameTimer.elapsed();
    qint64 elapsed = currentTime - m_lastFrameTime;

    if (elapsed >= MIN_FRAME_INTERVAL_MS) {
        update();
    } else {
        QThread::msleep(MIN_FRAME_INTERVAL_MS - elapsed);
        update();
    }
}

void OpenGLViewer::renderAxes() {
    glDisable(GL_LIGHTING);
    glLineWidth(2.0f);

    glBegin(GL_LINES);
    glColor3f(1.0f, 0.0f, 0.0f);
    glVertex3f(-50.0f, 0.0f, 0.0f);
    glVertex3f(50.0f, 0.0f, 0.0f);

    glColor3f(0.0f, 1.0f, 0.0f);
    glVertex3f(0.0f, -50.0f, 0.0f);
    glVertex3f(0.0f, 50.0f, 0.0f);

    glColor3f(0.0f, 0.0f, 1.0f);
    glVertex3f(0.0f, 0.0f, -50.0f);
    glVertex3f(0.0f, 0.0f, 50.0f);
    glEnd();

    glLineWidth(1.0f);
    glEnable(GL_LIGHTING);
}

void OpenGLViewer::renderMesh() {
    if (m_vertices.empty()) return;

    if (m_displayListValid) {
        glCallList(m_displayList);
        return;
    }

    glNewList(m_displayList, GL_COMPILE_AND_EXECUTE);
    
    glEnableClientState(GL_VERTEX_ARRAY);
    glEnableClientState(GL_NORMAL_ARRAY);
    
    glVertexPointer(3, GL_FLOAT, sizeof(VertexData), &m_vertices[0].x);
    glNormalPointer(GL_FLOAT, sizeof(VertexData), &m_vertices[0].nx);
    
    glDrawArrays(GL_TRIANGLES, 0, static_cast<GLsizei>(m_vertices.size()));
    
    glDisableClientState(GL_VERTEX_ARRAY);
    glDisableClientState(GL_NORMAL_ARRAY);
    
    glEndList();
    
    m_displayListValid = true;
}

void OpenGLViewer::resizeGL(int w, int h) {
    glViewport(0, 0, w, h);

    glMatrixMode(GL_PROJECTION);
    glLoadIdentity();

    GLdouble aspect = static_cast<GLdouble>(w) / static_cast<GLdouble>(h > 0 ? h : 1);
    gluPerspective(45.0, aspect, 0.01, 10000.0);

    glMatrixMode(GL_MODELVIEW);
}

void OpenGLViewer::mousePressEvent(QMouseEvent *event) {
    m_lastPos = event->pos();
    m_button = event->button();
    m_isDragging = true;
    event->accept();
}

void OpenGLViewer::mouseMoveEvent(QMouseEvent *event) {
    if (!m_isDragging) {
        event->ignore();
        return;
    }

    QPoint delta = event->pos() - m_lastPos;

    if (m_button == Qt::LeftButton) {
        m_rotX += delta.y() * 0.5;
        m_rotY += delta.x() * 0.5;
    } else if (m_button == Qt::RightButton || m_button == Qt::MiddleButton) {
        m_panX += delta.x() * 0.01 / m_zoom;
        m_panY -= delta.y() * 0.01 / m_zoom;
    }

    m_lastPos = event->pos();
    scheduleUpdate();
    event->accept();
}

void OpenGLViewer::mouseReleaseEvent(QMouseEvent *event) {
    m_isDragging = false;
    update();
    event->accept();
}

void OpenGLViewer::wheelEvent(QWheelEvent *event) {
    double scaleFactor = 1.15;
    if (event->angleDelta().y() > 0) {
        m_zoom *= scaleFactor;
    } else {
        m_zoom /= scaleFactor;
    }

    if (m_zoom < 0.001) m_zoom = 0.001;
    if (m_zoom > 1000.0) m_zoom = 1000.0;

    update();
    event->accept();
}

bool OpenGLViewer::buildMeshData(const TopoDS_Shape& shape) {
    if (shape.IsNull()) return false;

    clearMeshData();

    BRepMesh_IncrementalMesh mesher(shape, 0.5, Standard_False, 0.8, Standard_True);

    TopExp_Explorer faceExplorer(shape, TopAbs_FACE);
    Standard_Integer totalTriangles = 0;
    
    while (faceExplorer.More()) {
        const TopoDS_Face& face = TopoDS::Face(faceExplorer.Current());
        TopLoc_Location location;
        Handle(Poly_Triangulation) triangulation = BRep_Tool::Triangulation(face, location);
        
        if (!triangulation.IsNull()) {
            totalTriangles += triangulation->NbTriangles();
        }
        faceExplorer.Next();
    }

    if (totalTriangles == 0) {
        return false;
    }

    m_vertices.reserve(totalTriangles * 3);
    
    faceExplorer.Init(shape, TopAbs_FACE);
    while (faceExplorer.More()) {
        const TopoDS_Face& face = TopoDS::Face(faceExplorer.Current());
        TopLoc_Location location;
        Handle(Poly_Triangulation) triangulation = BRep_Tool::Triangulation(face, location);
        
        if (!triangulation.IsNull()) {
            const TColgp_Array1OfPnt& nodes = triangulation->Nodes();
            const Poly_Array1OfTriangle& triangles = triangulation->Triangles();
            
            gp_Trsf transform = location.Transformation();
            Standard_Boolean isReversed = (face.Orientation() == TopAbs_REVERSED);
            
            for (Standard_Integer i = 1; i <= triangulation->NbTriangles(); ++i) {
                const Poly_Triangle& triangle = triangles.Value(i);
                Standard_Integer n1, n2, n3;
                triangle.Get(n1, n2, n3);
                
                gp_Pnt p1 = nodes.Value(n1).Transformed(transform);
                gp_Pnt p2 = nodes.Value(n2).Transformed(transform);
                gp_Pnt p3 = nodes.Value(n3).Transformed(transform);
                
                gp_Vec v1(p1, p2);
                gp_Vec v2(p1, p3);
                gp_Dir normal = v1.Crossed(v2);
                
                if (normal.SquareMagnitude() > 1e-10) {
                    normal.Normalize();
                    if (isReversed) {
                        normal.Reverse();
                    }
                    
                    VertexData vd1 = {
                        static_cast<float>(p1.X()), static_cast<float>(p1.Y()), static_cast<float>(p1.Z()),
                        static_cast<float>(normal.X()), static_cast<float>(normal.Y()), static_cast<float>(normal.Z())
                    };
                    VertexData vd2 = {
                        static_cast<float>(p2.X()), static_cast<float>(p2.Y()), static_cast<float>(p2.Z()),
                        static_cast<float>(normal.X()), static_cast<float>(normal.Y()), static_cast<float>(normal.Z())
                    };
                    VertexData vd3 = {
                        static_cast<float>(p3.X()), static_cast<float>(p3.Y()), static_cast<float>(p3.Z()),
                        static_cast<float>(normal.X()), static_cast<float>(normal.Y()), static_cast<float>(normal.Z())
                    };
                    
                    m_vertices.push_back(vd1);
                    m_vertices.push_back(vd2);
                    m_vertices.push_back(vd3);
                }
            }
        }
        
        faceExplorer.Next();
    }

    m_shape = shape;
    m_displayListValid = false;

    return !m_vertices.empty();
}

void OpenGLViewer::clearMeshData() {
    m_vertices.clear();
    m_vertices.shrink_to_fit();
    m_displayShape.Nullify();
    m_displayListValid = false;
}

void OpenGLViewer::setShape(const TopoDS_Shape& shape) {
    if (shape.IsNull()) {
        clearShape();
        return;
    }

    m_originalShape = shape;
    updateClippedShape();
    update();
}

void OpenGLViewer::clearShape() {
    makeCurrent();
    clearMeshData();
    m_originalShape.Nullify();
    if (m_displayList != 0) {
        glDeleteLists(m_displayList, 1);
        m_displayList = glGenLists(1);
    }
    doneCurrent();
    update();
}

void OpenGLViewer::fitAll() {
    m_zoom = 1.0;
    m_panX = 0.0;
    m_panY = 0.0;
    m_rotX = -30.0;
    m_rotY = 45.0;
    update();
}

void OpenGLViewer::resetView() {
    m_zoom = 1.0;
    m_rotX = 0.0;
    m_rotY = 0.0;
    m_panX = 0.0;
    m_panY = 0.0;
    update();
}

void OpenGLViewer::setDisplayMode(int mode) {
    update();
}

void OpenGLViewer::setClippingEnabled(bool enabled) {
    if (m_clippingEnabled == enabled) {
        return;
    }
    m_clippingEnabled = enabled;
    updateClippedShape();
    emit clippingChanged();
    update();
}

void OpenGLViewer::setClippingPlane(ClippingPlaneAxis axis, double position, double size) {
    m_clippingAxis = axis;
    m_clippingPosition = position;
    m_clippingPlaneSize = size;
    updateClippedShape();
    emit clippingChanged();
    update();
}

void OpenGLViewer::setClippingAxis(ClippingPlaneAxis axis) {
    if (m_clippingAxis == axis) {
        return;
    }
    m_clippingAxis = axis;
    updateClippedShape();
    emit clippingChanged();
    update();
}

void OpenGLViewer::setClippingPosition(double position) {
    if (std::abs(m_clippingPosition - position) < 1e-6) {
        return;
    }
    m_clippingPosition = position;
    updateClippedShape();
    emit clippingChanged();
    update();
}

void OpenGLViewer::setClippingPlaneSize(double size) {
    if (std::abs(m_clippingPlaneSize - size) < 1e-6) {
        return;
    }
    m_clippingPlaneSize = size;
    emit clippingChanged();
    update();
}

void OpenGLViewer::updateClippedShape() {
    if (m_originalShape.IsNull()) {
        clearMeshData();
        return;
    }

    if (!m_clippingEnabled) {
        buildMeshData(m_originalShape);
        return;
    }

    gp_Pnt planePoint;
    gp_Dir planeNormal;

    switch (m_clippingAxis) {
        case ClippingPlaneAxis::X:
            planePoint = gp_Pnt(m_clippingPosition, 0, 0);
            planeNormal = gp_Dir(1, 0, 0);
            break;
        case ClippingPlaneAxis::Y:
            planePoint = gp_Pnt(0, m_clippingPosition, 0);
            planeNormal = gp_Dir(0, 1, 0);
            break;
        case ClippingPlaneAxis::Z:
        default:
            planePoint = gp_Pnt(0, 0, m_clippingPosition);
            planeNormal = gp_Dir(0, 0, 1);
            break;
    }

    gp_Pln clippingPlane(planePoint, planeNormal);

    double halfSize = m_clippingPlaneSize * 10.0;
    gp_Pnt p1, p2, p3, p4;

    switch (m_clippingAxis) {
        case ClippingPlaneAxis::X:
            p1 = gp_Pnt(m_clippingPosition, -halfSize, -halfSize);
            p2 = gp_Pnt(m_clippingPosition,  halfSize, -halfSize);
            p3 = gp_Pnt(m_clippingPosition,  halfSize,  halfSize);
            p4 = gp_Pnt(m_clippingPosition, -halfSize,  halfSize);
            break;
        case ClippingPlaneAxis::Y:
            p1 = gp_Pnt(-halfSize, m_clippingPosition, -halfSize);
            p2 = gp_Pnt( halfSize, m_clippingPosition, -halfSize);
            p3 = gp_Pnt( halfSize, m_clippingPosition,  halfSize);
            p4 = gp_Pnt(-halfSize, m_clippingPosition,  halfSize);
            break;
        case ClippingPlaneAxis::Z:
        default:
            p1 = gp_Pnt(-halfSize, -halfSize, m_clippingPosition);
            p2 = gp_Pnt( halfSize, -halfSize, m_clippingPosition);
            p3 = gp_Pnt( halfSize,  halfSize, m_clippingPosition);
            p4 = gp_Pnt(-halfSize,  halfSize, m_clippingPosition);
            break;
    }

    try {
        BRepBuilderAPI_MakeFace faceMaker(p1, p2, p3, p4);
        if (!faceMaker.IsDone()) {
            buildMeshData(m_originalShape);
            return;
        }

        TopoDS_Face planeFace = faceMaker.Face();
        BRepPrimAPI_MakeHalfSpace halfSpaceMaker(planeFace, planePoint.Translated(planeNormal.Reversed()));
        
        if (!halfSpaceMaker.IsDone()) {
            buildMeshData(m_originalShape);
            return;
        }

        TopoDS_Shape halfSpace = halfSpaceMaker.Shape();
        BRepAlgoAPI_Cut cutter(m_originalShape, halfSpace);
        
        if (cutter.IsDone()) {
            TopoDS_Shape result = cutter.Shape();
            if (!result.IsNull()) {
                buildMeshData(result);
                return;
            }
        }
    } catch (...) {
    }

    buildMeshData(m_originalShape);
}

void OpenGLViewer::renderClippingPlane() {
    glDisable(GL_LIGHTING);
    glDisable(GL_CULL_FACE);
    glEnable(GL_BLEND);
    glBlendFunc(GL_SRC_ALPHA, GL_ONE_MINUS_SRC_ALPHA);

    double halfSize = m_clippingPlaneSize;
    glColor4f(1.0f, 0.5f, 0.0f, 0.4f);

    glBegin(GL_QUADS);

    switch (m_clippingAxis) {
        case ClippingPlaneAxis::X:
            glVertex3d(m_clippingPosition, -halfSize, -halfSize);
            glVertex3d(m_clippingPosition,  halfSize, -halfSize);
            glVertex3d(m_clippingPosition,  halfSize,  halfSize);
            glVertex3d(m_clippingPosition, -halfSize,  halfSize);
            break;
        case ClippingPlaneAxis::Y:
            glVertex3d(-halfSize, m_clippingPosition, -halfSize);
            glVertex3d( halfSize, m_clippingPosition, -halfSize);
            glVertex3d( halfSize, m_clippingPosition,  halfSize);
            glVertex3d(-halfSize, m_clippingPosition,  halfSize);
            break;
        case ClippingPlaneAxis::Z:
        default:
            glVertex3d(-halfSize, -halfSize, m_clippingPosition);
            glVertex3d( halfSize, -halfSize, m_clippingPosition);
            glVertex3d( halfSize,  halfSize, m_clippingPosition);
            glVertex3d(-halfSize,  halfSize, m_clippingPosition);
            break;
    }

    glEnd();

    glColor4f(1.0f, 0.3f, 0.0f, 0.8f);
    glLineWidth(2.0f);
    glBegin(GL_LINE_LOOP);

    switch (m_clippingAxis) {
        case ClippingPlaneAxis::X:
            glVertex3d(m_clippingPosition, -halfSize, -halfSize);
            glVertex3d(m_clippingPosition,  halfSize, -halfSize);
            glVertex3d(m_clippingPosition,  halfSize,  halfSize);
            glVertex3d(m_clippingPosition, -halfSize,  halfSize);
            break;
        case ClippingPlaneAxis::Y:
            glVertex3d(-halfSize, m_clippingPosition, -halfSize);
            glVertex3d( halfSize, m_clippingPosition, -halfSize);
            glVertex3d( halfSize, m_clippingPosition,  halfSize);
            glVertex3d(-halfSize, m_clippingPosition,  halfSize);
            break;
        case ClippingPlaneAxis::Z:
        default:
            glVertex3d(-halfSize, -halfSize, m_clippingPosition);
            glVertex3d( halfSize, -halfSize, m_clippingPosition);
            glVertex3d( halfSize,  halfSize, m_clippingPosition);
            glVertex3d(-halfSize,  halfSize, m_clippingPosition);
            break;
    }

    glEnd();
    glLineWidth(1.0f);

    glDisable(GL_BLEND);
    glEnable(GL_CULL_FACE);
    glEnable(GL_LIGHTING);
}
