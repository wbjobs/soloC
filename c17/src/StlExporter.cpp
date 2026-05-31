#include "StlExporter.h"
#include <StlAPI_Writer.hxx>
#include <BRepMesh_IncrementalMesh.hxx>
#include <StlAPI.hxx>

StlExporter::StlExporter() {
}

StlExporter::~StlExporter() {
}

bool StlExporter::triangulateShape(const TopoDS_Shape& shape, double deflection) {
    if (shape.IsNull()) {
        return false;
    }

    try {
        BRepMesh_IncrementalMesh mesher(shape, deflection, Standard_False, 0.5, Standard_True);
        return Standard_True;
    } catch (...) {
        return false;
    }
}

bool StlExporter::exportToStl(const TopoDS_Shape& shape, 
                              const QString& filePath, 
                              StlExportMode mode,
                              double deflection) {
    return exportShape(shape, filePath, mode, deflection);
}

bool StlExporter::exportShape(const TopoDS_Shape& shape,
                             const QString& filePath,
                             StlExportMode mode,
                             double deflection) {
    if (shape.IsNull()) {
        return false;
    }

    if (!triangulateShape(shape, deflection)) {
        return false;
    }

    try {
        StlAPI_Writer writer;
        writer.SetASCIIMode(mode == StlExportMode::ASCII);
        return writer.Write(shape, filePath.toLocal8Bit().constData());
    } catch (...) {
        return false;
    }
}
