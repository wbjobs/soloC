cmake_minimum_required(VERSION 3.14)
project(GalaxyVisualizationBackend)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

find_package(Drogon CONFIG REQUIRED)
find_package(HDF5 REQUIRED COMPONENTS CXX)

include_directories(${HDF5_INCLUDE_DIRS})

add_executable(galaxy_backend
    src/main.cpp
    src/DataReader.cpp
    src/DataSliceController.cpp
)

target_link_libraries(galaxy_backend
    Drogon::Drogon
    ${HDF5_CXX_LIBRARIES}
)
