cmake_minimum_required(VERSION 3.16)
project(VideoEditor VERSION 1.0.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_AUTOMOC ON)
set(CMAKE_AUTORCC ON)
set(CMAKE_AUTOUIC ON)

set(CMAKE_RUNTIME_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}/bin)
set(CMAKE_LIBRARY_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}/lib)
set(CMAKE_ARCHIVE_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}/lib)

find_package(Qt6 REQUIRED COMPONENTS Core Gui Qml Quick QuickControls2 Multimedia)

set(FFMPEG_ROOT "" CACHE PATH "Path to FFmpeg installation")
if(FFMPEG_ROOT)
    set(CMAKE_PREFIX_PATH ${CMAKE_PREFIX_PATH} ${FFMPEG_ROOT})
endif()

find_path(AVCODEC_INCLUDE_DIR libavcodec/avcodec.h)
find_path(AVFORMAT_INCLUDE_DIR libavformat/avformat.h)
find_path(AVUTIL_INCLUDE_DIR libavutil/avutil.h)
find_path(SWSCALE_INCLUDE_DIR libswscale/swscale.h)
find_path(SWRESAMPLE_INCLUDE_DIR libswresample/swresample.h)

find_library(AVCODEC_LIBRARY avcodec)
find_library(AVFORMAT_LIBRARY avformat)
find_library(AVUTIL_LIBRARY avutil)
find_library(SWSCALE_LIBRARY swscale)
find_library(SWRESAMPLE_LIBRARY swresample)

set(SOURCES
    src/main.cpp
    src/core/MediaDecoder.cpp
    src/core/MediaEncoder.cpp
    src/core/MediaLibrary.cpp
    src/core/TimelineModel.cpp
    src/core/RenderPipeline.cpp
    src/core/PlayerController.cpp
    src/core/ExportManager.cpp
    src/qml/VideoSurface.cpp
)

set(HEADERS
    src/core/MediaDecoder.h
    src/core/MediaEncoder.h
    src/core/MediaLibrary.h
    src/core/TimelineModel.h
    src/core/RenderPipeline.h
    src/core/PlayerController.h
    src/core/ExportManager.h
    src/qml/VideoSurface.h
)

set(QML_SOURCES
    qml/main.qml
    qml/MainWindow.qml
    qml/TimelineView.qml
    qml/PreviewWindow.qml
    qml/MediaLibraryPanel.qml
    qml/PlayerControls.qml
    qml/TrackItem.qml
    qml/ClipItem.qml
)

set(RESOURCES
    resources.qrc
)

qt_add_executable(VideoEditor
    ${SOURCES}
    ${HEADERS}
    ${QML_SOURCES}
    ${RESOURCES}
)

target_include_directories(VideoEditor PRIVATE
    ${CMAKE_SOURCE_DIR}/src
    ${AVCODEC_INCLUDE_DIR}
    ${AVFORMAT_INCLUDE_DIR}
    ${AVUTIL_INCLUDE_DIR}
    ${SWSCALE_INCLUDE_DIR}
    ${SWRESAMPLE_INCLUDE_DIR}
)

target_link_libraries(VideoEditor PRIVATE
    Qt6::Core
    Qt6::Gui
    Qt6::Qml
    Qt6::Quick
    Qt6::QuickControls2
    Qt6::Multimedia
    ${AVCODEC_LIBRARY}
    ${AVFORMAT_LIBRARY}
    ${AVUTIL_LIBRARY}
    ${SWSCALE_LIBRARY}
    ${SWRESAMPLE_LIBRARY}
)

if(WIN32)
    set_target_properties(VideoEditor PROPERTIES
        WIN32_EXECUTABLE TRUE
    )
endif()
