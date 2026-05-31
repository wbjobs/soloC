#pragma once

#include <drogon/HttpController.h>
#include "DataReader.h"
#include "MIPGenerator.h"
#include <memory>

using namespace drogon;

class DataSliceController : public drogon::HttpController<DataSliceController> {
public:
    DataSliceController();
    
    METHOD_LIST_BEGIN
    ADD_METHOD_TO(DataSliceController::getInfo, "/api/info", Get);
    ADD_METHOD_TO(DataSliceController::getSlice, "/api/slice", Get);
    ADD_METHOD_TO(DataSliceController::getMIP, "/api/mip", Get);
    METHOD_LIST_END
    
    void getInfo(const HttpRequestPtr& req, std::function<void (const HttpResponsePtr &)> &&callback);
    void getSlice(const HttpRequestPtr& req, std::function<void (const HttpResponsePtr &)> &&callback);
    void getMIP(const HttpRequestPtr& req, std::function<void (const HttpResponsePtr &)> &&callback);
    
private:
    std::unique_ptr<DataReader> dataReader_;
    std::unique_ptr<MIPGenerator> mipGenerator_;
};
