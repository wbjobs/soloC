#include "DataReader.h"
#include <stdexcept>
#include <iostream>

DataReader::DataReader(const std::string& filename) 
    : filename_(filename), file_(filename, H5F_ACC_RDONLY) {
    loadInfo();
}

DataReader::~DataReader() {
    file_.close();
}

void DataReader::loadInfo() {
    try {
        H5::DataSet dataset = file_.openDataSet("density");
        H5::DataSpace dataspace = dataset.getSpace();
        
        int ndims = dataspace.getSimpleExtentNdims();
        if (ndims != 4) {
            throw std::runtime_error("Expected 4D data (timestep, x, y, z)");
        }
        
        hsize_t dims[4];
        dataspace.getSimpleExtentDims(dims, NULL);
        
        info_.timesteps = dims[0];
        info_.dimX = dims[1];
        info_.dimY = dims[2];
        info_.dimZ = dims[3];
        
        std::cout << "Loaded data: " << info_.timesteps << " timesteps, "
                  << info_.dimX << "x" << info_.dimY << "x" << info_.dimZ << std::endl;
    } catch (H5::Exception& e) {
        throw std::runtime_error("Failed to load data info: " + std::string(e.getCDetailMsg()));
    }
}

DataInfo DataReader::getInfo() const {
    return info_;
}

std::vector<float> DataReader::getSliceX(int timestep, int position) {
    return readSlice(timestep, "X", position);
}

std::vector<float> DataReader::getSliceY(int timestep, int position) {
    return readSlice(timestep, "Y", position);
}

std::vector<float> DataReader::getSliceZ(int timestep, int position) {
    return readSlice(timestep, "Z", position);
}

std::vector<float> DataReader::readSlice(int timestep, const std::string& axis, int position) {
    try {
        H5::DataSet dataset = file_.openDataSet("density");
        H5::DataSpace dataspace = dataset.getSpace();
        
        hsize_t dims[4];
        dataspace.getSimpleExtentDims(dims, NULL);
        
        if (timestep < 0 || timestep >= info_.timesteps) {
            throw std::runtime_error("Invalid timestep");
        }
        
        hsize_t start[4] = {0, 0, 0, 0};
        hsize_t count[4] = {1, 1, 1, 1};
        hsize_t stride[4] = {1, 1, 1, 1};
        hsize_t block[4] = {1, 1, 1, 1};
        
        start[0] = timestep;
        
        int sliceWidth, sliceHeight;
        
        if (axis == "X") {
            if (position < 0 || position >= info_.dimX) {
                throw std::runtime_error("Invalid X position");
            }
            start[1] = position;
            count[2] = info_.dimY;
            count[3] = info_.dimZ;
            sliceWidth = info_.dimY;
            sliceHeight = info_.dimZ;
        } else if (axis == "Y") {
            if (position < 0 || position >= info_.dimY) {
                throw std::runtime_error("Invalid Y position");
            }
            start[2] = position;
            count[1] = info_.dimX;
            count[3] = info_.dimZ;
            sliceWidth = info_.dimX;
            sliceHeight = info_.dimZ;
        } else if (axis == "Z") {
            if (position < 0 || position >= info_.dimZ) {
                throw std::runtime_error("Invalid Z position");
            }
            start[3] = position;
            count[1] = info_.dimX;
            count[2] = info_.dimY;
            sliceWidth = info_.dimX;
            sliceHeight = info_.dimY;
        } else {
            throw std::runtime_error("Invalid axis");
        }
        
        dataspace.selectHyperslab(H5S_SELECT_SET, count, start, stride, block);
        
        hsize_t memDims[2] = {static_cast<hsize_t>(sliceHeight), static_cast<hsize_t>(sliceWidth)};
        H5::DataSpace memspace(2, memDims);
        
        std::vector<float> data(sliceWidth * sliceHeight);
        dataset.read(data.data(), H5::PredType::NATIVE_FLOAT, memspace, dataspace);
        
        return data;
    } catch (H5::Exception& e) {
        throw std::runtime_error("Failed to read slice: " + std::string(e.getCDetailMsg()));
    }
}
