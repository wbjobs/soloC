package com.iot.ota.firmware.service;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.iot.ota.common.entity.Firmware;
import com.iot.ota.firmware.mapper.FirmwareMapper;
import org.springframework.stereotype.Service;

@Service
public class FirmwareService extends ServiceImpl<FirmwareMapper, Firmware> {

    public Firmware getLatestFirmware(String productKey, String currentVersion) {
        QueryWrapper<Firmware> wrapper = new QueryWrapper<>();
        wrapper.eq("product_key", productKey)
               .eq("status", 1)
               .orderByDesc("create_time")
               .last("LIMIT 1");
        return getOne(wrapper);
    }

    public Firmware getByVersion(String productKey, String version) {
        QueryWrapper<Firmware> wrapper = new QueryWrapper<>();
        wrapper.eq("product_key", productKey)
               .eq("firmware_version", version);
        return getOne(wrapper);
    }
}
