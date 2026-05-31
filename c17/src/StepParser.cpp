#include "StepParser.h"
#include <STEPControl_Reader.hxx>
#include <IFSelect_ReturnStatus.hxx>
#include <TopoDS_Shape.hxx>

StepParser::StepParser() {
}

StepParser::~StepParser() {
    clear();
}

void StepParser::clear() {
    m_shape.Nullify();
}

bool StepParser::loadStepFile(const QString& filePath) {
    clear();

    STEPControl_Reader reader;
    IFSelect_ReturnStatus status = reader.ReadFile(filePath.toLocal8Bit().constData());
    
    if (status != IFSelect_RetDone) {
        return false;
    }

    Standard_Integer nbRoots = reader.NbRootsForTransfer();
    if (nbRoots == 0) {
        return false;
    }

    Standard_Boolean ok = reader.TransferRoots();
    if (!ok) {
        return false;
    }

    TopoDS_Shape shape = reader.OneShape();
    if (shape.IsNull()) {
        return false;
    }

    m_shape = shape;
    return true;
}
