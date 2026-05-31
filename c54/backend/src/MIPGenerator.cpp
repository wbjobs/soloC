#include "MIPGenerator.h"
#include <H5Cpp.h>
#include <stdexcept>
#include <algorithm>

MIPGenerator::MIPGenerator(const std::string& filename) 
    : filename_(filename), dimX_(512), dimY_(512), dimZ_(512) {
    loadDimensions();
}

MIPGenerator::~MIPGenerator() {}

void MIPGenerator::loadDimensions() {
    try {
        H5::H5File file(filename_, H5F_ACC_RDONLY);
        H5::DataSet dataset = file.openDataSet("density");
        H5::DataSpace dataspace = dataset.getSpace();
        
        int ndims = dataspace.getSimpleExtentNdims();
        if (ndims != 4) {
            return;
        }
        
        hsize_t dims[4];
        dataspace.getSimpleExtentDims(dims, NULL);
        
        dimX_ = dims[1];
        dimY_ = dims[2];
        dimZ_ = dims[3];
        
        file.close();
    } catch (H5::Exception& e) {
        throw std::runtime_error("Failed to load dimensions: " + std::string(e.getCDetailMsg()));
    }
}

std::vector<float> MIPGenerator::generateMIP(int timestep, char axis) {
    try {
        H5::H5File file(filename_, H5F_ACC_RDONLY);
        H5::DataSet dataset = file.openDataSet("density");
        H5::DataSpace dataspace = dataset.getSpace();
        
        hsize_t dims[4];
        dataspace.getSimpleExtentDims(dims, NULL);
        
        if (timestep < 0 || timestep >= dims[0]) {
            throw std::runtime_error("Invalid timestep");
        }
        
        std::vector<float> result;
        
        hsize_t start[4] = {static_cast<hsize_t>(timestep), 0, 0, 0};
        hsize_t count[4] = {1, static_cast<hsize_t>(dimX_), static_cast<hsize_t>(dimY_), static_cast<hsize_t>(dimZ_)};
        
        dataspace.selectHyperslab(H5S_SELECT_SET, count, start);
        
        hsize_t memDims[3] = {static_cast<hsize_t>(dimX_), static_cast<hsize_t>(dimY_), static_cast<hsize_t>(dimZ_)};
        H5::DataSpace memspace(3, memDims);
        
        std::vector<float> volumeData(dimX_ * dimY_ * dimZ_);
        dataset.read(volumeData.data(), H5::PredType::NATIVE_FLOAT, memspace, dataspace);
        
        if (axis == 'X') {
            result.resize(dimY_ * dimZ_);
            for (int z = 0; z < dimZ_; z++) {
                for (int y = 0; y < dimY_; y++) {
                    float maxVal = 0.0f;
                    for (int x = 0; x < dimX_; x++) {
                        int idx = x * dimY_ * dimZ_ + y * dimZ_ + z;
                        maxVal = std::max(maxVal, volumeData[idx]);
                    }
                    result[z * dimY_ + y] = maxVal;
                }
            }
        } else if (axis == 'Y') {
            result.resize(dimX_ * dimZ_);
            for (int z = 0; z < dimZ_; z++) {
                for (int x = 0; x < dimX_; x++) {
                    float maxVal = 0.0f;
                    for (int y = 0; y < dimY_; y++) {
                        int idx = x * dimY_ * dimZ_ + y * dimZ_ + z;
                        maxVal = std::max(maxVal, volumeData[idx]);
                    }
                    result[z * dimX_ + x] = maxVal;
                }
            }
        } else {
            result.resize(dimX_ * dimY_);
            for (int y = 0; y < dimY_; y++) {
                for (int x = 0; x < dimX_; x++) {
                    float maxVal = 0.0f;
                    for (int z = 0; z < dimZ_; z++) {
                        int idx = x * dimY_ * dimZ_ + y * dimZ_ + z;
                        maxVal = std::max(maxVal, volumeData[idx]);
                    }
                    result[y * dimX_ + x] = maxVal;
                }
            }
        }
        
        file.close();
        return result;
    } catch (H5::Exception& e) {
        throw std::runtime_error("Failed to generate MIP: " + std::string(e.getCDetailMsg()));
    }
}
