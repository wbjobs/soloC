#include <drogon/drogon.h>
#include <iostream>
#include "DataSliceController.h"

using namespace drogon;

int main(int argc, char* argv[]) {
    app().addListener("0.0.0.0", 8080);
    
    app().setThreadNum(4);
    
    std::cout << "Galaxy Visualization Backend starting..." << std::endl;
    std::cout << "Listening on http://localhost:8080" << std::endl;
    
    app().enableCORSCorsPreflight({
        "http://localhost:5173",
        "http://localhost:3000"
    });
    
    app().registerController(std::make_shared<DataSliceController>());
    
    app().run();
    
    return 0;
}
