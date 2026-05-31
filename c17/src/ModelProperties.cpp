#include "ModelProperties.h"
#include <GProp_GProps.hxx>
#include <BRepGProp.hxx>
#include <BRepBndLib.hxx>
#include <Bnd_Box.hxx>
#include <TopoDS.hxx>
#include <TopExp.hxx>
#include <TopExp_Explorer.hxx>
#include <TopAbs_ShapeEnum.hxx>
#include <Standard_TypeMismatch.hxx>

ModelProperties::ModelProperties() : m_valid(false) {
    m_info = {0};
    m_info.density = 7850.0;
}

ModelProperties::~ModelProperties() {
}

bool ModelProperties::calculateProperties(const TopoDS_Shape& shape) {
    if (shape.IsNull()) {
        m_valid = false;
        return false;
    }

    m_valid = true;
    m_info.shapeType = getShapeTypeString(shape);
    m_info.vertexCount = countTopology(shape, TopAbs_VERTEX);
    m_info.edgeCount = countTopology(shape, TopAbs_EDGE);
    m_info.faceCount = countTopology(shape, TopAbs_FACE);
    m_info.solidCount = countTopology(shape, TopAbs_SOLID);

    try {
        GProp_GProps volumeProps;
        BRepGProp::VolumeProperties(shape, volumeProps);
        m_info.volume = volumeProps.Mass();
        m_info.mass = m_info.volume * m_info.density / 1000000000.0;
        
        gp_Pnt center = volumeProps.CentreOfMass();
        m_info.centerX = center.X();
        m_info.centerY = center.Y();
        m_info.centerZ = center.Z();
    } catch (Standard_TypeMismatch) {
        m_info.volume = 0.0;
        m_info.mass = 0.0;
    }

    try {
        GProp_GProps surfaceProps;
        BRepGProp::SurfaceProperties(shape, surfaceProps);
        m_info.surfaceArea = surfaceProps.Mass();
    } catch (Standard_TypeMismatch) {
        m_info.surfaceArea = 0.0;
    }

    Bnd_Box bbox;
    BRepBndLib::Add(shape, bbox);
    if (!bbox.IsVoid()) {
        m_info.boundingBoxMinX = bbox.CornerMin().X();
        m_info.boundingBoxMinY = bbox.CornerMin().Y();
        m_info.boundingBoxMinZ = bbox.CornerMin().Z();
        m_info.boundingBoxMaxX = bbox.CornerMax().X();
        m_info.boundingBoxMaxY = bbox.CornerMax().Y();
        m_info.boundingBoxMaxZ = bbox.CornerMax().Z();
    }

    return true;
}

QString ModelProperties::getShapeTypeString(const TopoDS_Shape& shape) {
    switch (shape.ShapeType()) {
        case TopAbs_COMPOUND: return "Compound";
        case TopAbs_COMPSOLID: return "Compsolid";
        case TopAbs_SOLID: return "Solid";
        case TopAbs_SHELL: return "Shell";
        case TopAbs_FACE: return "Face";
        case TopAbs_WIRE: return "Wire";
        case TopAbs_EDGE: return "Edge";
        case TopAbs_VERTEX: return "Vertex";
        case TopAbs_SHAPE: return "Shape";
        default: return "Unknown";
    }
}

int ModelProperties::countTopology(const TopoDS_Shape& shape, TopAbs_ShapeEnum type) {
    int count = 0;
    TopExp_Explorer explorer(shape, type);
    while (explorer.More()) {
        count++;
        explorer.Next();
    }
    return count;
}
