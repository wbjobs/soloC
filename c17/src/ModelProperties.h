#ifndef MODELPROPERTIES_H
#define MODELPROPERTIES_H

#include <QString>
#include <TopoDS_Shape.hxx>

struct ModelInfo {
    double volume;
    double surfaceArea;
    double mass;
    double density;
    QString shapeType;
    int vertexCount;
    int edgeCount;
    int faceCount;
    int solidCount;
    double boundingBoxMinX;
    double boundingBoxMinY;
    double boundingBoxMinZ;
    double boundingBoxMaxX;
    double boundingBoxMaxY;
    double boundingBoxMaxZ;
    double centerX;
    double centerY;
    double centerZ;
};

class ModelProperties {
public:
    ModelProperties();
    ~ModelProperties();

    bool calculateProperties(const TopoDS_Shape& shape);
    const ModelInfo& getInfo() const { return m_info; }
    bool isValid() const { return m_valid; }

private:
    ModelInfo m_info;
    bool m_valid;

    QString getShapeTypeString(const TopoDS_Shape& shape);
    int countTopology(const TopoDS_Shape& shape, TopAbs_ShapeEnum type);
};

#endif // MODELPROPERTIES_H
