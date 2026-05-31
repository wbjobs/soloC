package com.iot.ota.firmware.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.iot.ota.common.entity.Firmware;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface FirmwareMapper extends BaseMapper<Firmware> {
}
