#pragma once

#include <vector>
#include <string>

class MIPGenerator {
public:
    MIPGenerator(const std::string& filename);
    ~MIPGenerator();
    
    std::vector<float> generateMIP(int timestep, char axis);
    
private:
    std::string filename_;
    int dimX_;
    int dimY_;
    int dimZ_;
    
    void loadDimensions();
};
