#include "DataSliceController.h"
#include <json/json.h>

DataSliceController::DataSliceController() {
    try {
        dataReader_ = std::make_unique<DataReader>("../../data/galaxy.h5");
        mipGenerator_ = std::make_unique<MIPGenerator>("../../data/galaxy.h5");
        std::cout << "DataReader and MIPGenerator initialized successfully" << std::endl;
    } catch (const std::exception& e) {
        std::cerr << "Failed to initialize DataReader/MIPGenerator: " << e.what() << std::endl;
        std::cerr << "Using mock data mode" << std::endl;
    }
}

void DataSliceController::getInfo(const HttpRequestPtr& req, 
                                   std::function<void(const HttpResponsePtr&)>&& callback) {
    Json::Value json;
    json["timesteps"] = 100;
    json["dimX"] = 512;
    json["dimY"] = 512;
    json["dimZ"] = 512;
    
    auto resp = HttpResponse::newHttpJsonResponse(json);
    resp->addHeader("Access-Control-Allow-Origin", "*");
    callback(resp);
}

void DataSliceController::getSlice(const HttpRequestPtr& req, 
                                    std::function<void(const HttpResponsePtr&)>&& callback) {
    auto axis = req->getParameter("axis");
    auto positionStr = req->getParameter("position");
    auto timestepStr = req->getParameter("timestep");
    
    int position = positionStr.empty() ? 256 : std::stoi(positionStr);
    int timestep = timestepStr.empty() ? 0 : std::stoi(timestep);
    
    if (axis.empty()) {
        axis = "Z";
    }
    
    Json::Value json;
    
    if (dataReader_) {
        try {
            std::vector<float> data;
            
            if (axis == "X") {
                data = dataReader_->getSliceX(timestep, position);
            } else if (axis == "Y") {
                data = dataReader_->getSliceY(timestep, position);
            } else {
                data = dataReader_->getSliceZ(timestep, position);
            }
            
            auto info = dataReader_->getInfo();
            
            if (axis == "X") {
                json["width"] = info.dimY;
                json["height"] = info.dimZ;
            } else if (axis == "Y") {
                json["width"] = info.dimX;
                json["height"] = info.dimZ;
            } else {
                json["width"] = info.dimX;
                json["height"] = info.dimZ;
            }
            
            Json::Value dataArray;
            for (float val : data) {
                dataArray.append(val);
            }
            json["data"] = dataArray;
            
        } catch (const std::exception& e) {
            json["error"] = e.what();
            auto resp = HttpResponse::newHttpJsonResponse(json);
            resp->setStatusCode(k500InternalServerError);
            resp->addHeader("Access-Control-Allow-Origin", "*");
            callback(resp);
            return;
        }
    } else {
        int width = 512;
        int height = 512;
        
        json["width"] = width;
        json["height"] = height;
        
        Json::Value dataArray;
        for (int y = 0; y < height; y++) {
            for (int x = 0; x < width; x++) {
                float dx = x - width / 2.0f;
                float dy = y - height / 2.0f;
                float dist = sqrt(dx * dx + dy * dy);
                float maxDist = std::min(width, height) / 2.0f;
                
                float density = exp(-dist * dist / (maxDist * maxDist * 0.3f));
                
                float spiralAngle = atan2(dy, dx) + dist * 0.1f + timestep * 0.1f;
                float spiralMod = (sin(spiralAngle * 2) + 1) / 2;
                density *= 0.5f + spiralMod * 0.5f;
                
                dataArray.append(std::max(0.0f, std::min(1.0f, density)));
            }
        }
        json["data"] = dataArray;
    }
    }
    
    auto resp = HttpResponse::newHttpJsonResponse(json);
    resp->addHeader("Access-Control-Allow-Origin", "*");
    callback(resp);
}

void DataSliceController::getMIP(const HttpRequestPtr& req, 
                                   std::function<void(const HttpResponsePtr&)>&& callback) {
    auto axis = req->getParameter("axis");
    auto timestepStr = req->getParameter("timestep");
    
    int timestep = timestepStr.empty() ? 0 : std::stoi(timestepStr);
    char axisChar = axis.empty() ? 'Z' : axis[0];
    
    Json::Value json;
    
    if (mipGenerator_) {
        try {
            auto data = mipGenerator_->generateMIP(timestep, axisChar);
            
            int width, height;
            if (axisChar == 'X') {
                width = 512;
                height = 512;
            } else if (axisChar == 'Y') {
                width = 512;
                height = 512;
            } else {
                width = 512;
                height = 512;
            }
            
            json["width"] = width;
            json["height"] = height;
            json["axis"] = std::string(1, axisChar);
            
            Json::Value dataArray;
            for (float val : data) {
                dataArray.append(val);
            }
            json["data"] = dataArray;
            
        } catch (const std::exception& e) {
            json["error"] = e.what();
            auto resp = HttpResponse::newHttpJsonResponse(json);
            resp->setStatusCode(k500InternalServerError);
            resp->addHeader("Access-Control-Allow-Origin", "*");
            callback(resp);
            return;
        }
    } else {
        int width = 512;
        int height = 512;
        
        json["width"] = width;
        json["height"] = height;
        json["axis"] = std::string(1, axisChar);
        
        Json::Value dataArray;
        for (int y = 0; y < height; y++) {
            for (int x = 0; x < width; x++) {
                float dx = x - width / 2.0f;
                float dy = y - height / 2.0f;
                float dist = sqrt(dx * dx + dy * dy);
                float maxDist = std::min(width, height) / 2.0f;
                
                float density = exp(-dist * dist / (maxDist * maxDist * 0.3f));
                
                float spiralAngle = atan2(dy, dx) + dist * 0.1f + timestep * 0.1f;
                float spiralMod = (sin(spiralAngle * 2) + 1) / 2;
                density *= 0.5f + spiralMod * 0.5f;
                
                dataArray.append(std::max(0.0f, std::min(1.0f, density)));
            }
        }
        json["data"] = dataArray;
    }
    
    auto resp = HttpResponse::newHttpJsonResponse(json);
    resp->addHeader("Access-Control-Allow-Origin", "*");
    callback(resp);
}
