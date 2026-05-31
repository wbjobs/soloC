#pragma once

#include <string>
#include <vector>
#include <H5Cpp.h>

struct DataInfo {
    int timesteps;
    int dimX;
    int dimY;
    int dimZ;
};

class DataReader {
public:
    DataReader(const std::string& filename);
    ~DataReader();
    
    DataInfo getInfo() const;
    
    std::vector<float> getSliceX(int timestep, int position);
    std::vector<float> getSliceY(int timestep, int position);
    std::vector<float> getSliceZ(int timestep, int position);
    
private:
    std::string filename_;
    H5::H5File file_;
    DataInfo info_;
    
    void loadInfo();
    std::vector<float> readSlice(int timestep, const std::string& axis, int position);
};
