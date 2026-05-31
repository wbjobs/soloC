cmake_minimum_required(VERSION 3.16)
project(CADViewer)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_AUTOMOC ON)
set(CMAKE_AUTORCC ON)
set(CMAKE_AUTOUIC ON)

find_package(Qt5 REQUIRED COMPONENTS Core Widgets OpenGL)
find_package(OpenCASCADE REQUIRED)
find_package(OpenGL REQUIRED)

set(SOURCES
    src/main.cpp
    src/MainWindow.cpp
    src/OpenGLViewer.cpp
    src/StepParser.cpp
    src/ModelProperties.cpp
    src/StlExporter.cpp
)

set(HEADERS
    src/MainWindow.h
    src/OpenGLViewer.h
    src/StepParser.h
    src/ModelProperties.h
    src/StlExporter.h
)

add_executable(${PROJECT_NAME} ${SOURCES} ${HEADERS})

target_link_libraries(${PROJECT_NAME}
    Qt5::Core
    Qt5::Widgets
    Qt5::OpenGL
    ${OpenCASCADE_LIBRARIES}
    OpenGL::GL
    OpenGL::GLU
)

if(WIN32)
    target_include_directories(${PROJECT_NAME} PRIVATE
        ${OpenCASCADE_INCLUDE_DIR}
    )
endif()
