#ifndef STLEXPORTER_H
#define STLEXPORTER_H

#include <QString>
#include <TopoDS_Shape.hxx>

enum class StlExportMode {
    Binary,
    ASCII
};

class StlExporter {
public:
    StlExporter();
    ~StlExporter();

    bool exportToStl(const TopoDS_Shape& shape, 
                     const QString& filePath, 
                     StlExportMode mode = StlExportMode::Binary,
                     double deflection = 0.1);

    static bool exportShape(const TopoDS_Shape& shape,
                           const QString& filePath,
                           StlExportMode mode = StlExportMode::Binary,
                           double deflection = 0.1);

private:
    static bool triangulateShape(const TopoDS_Shape& shape, double deflection);
};

#endif // STLEXPORTER_H
