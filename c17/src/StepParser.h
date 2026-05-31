#ifndef STEPPARSER_H
#define STEPPARSER_H

#include <QString>
#include <TopoDS_Shape.hxx>

class StepParser {
public:
    StepParser();
    ~StepParser();

    bool loadStepFile(const QString& filePath);
    const TopoDS_Shape& getShape() const { return m_shape; }
    bool hasShape() const { return !m_shape.IsNull(); }
    void clear();

private:
    TopoDS_Shape m_shape;
};

#endif // STEPPARSER_H
