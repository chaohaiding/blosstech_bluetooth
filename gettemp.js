const noble = require('noble')
//const noble = require('@s524797336/noble-mac');//仅在Mac Mojave版本上有问题，需要安装该branch https://github.com/Timeular/noble-mac/issues/7
const inquirer = require('inquirer');
const log4js = require('log4js');
log4js.configure({
  appenders: { bluetooth: { type: 'file', filename: 'bluetooth_gettemp.log' }, console: { type: 'console' }  },
  categories: { default: { appenders: ['bluetooth', 'console'], level: 'info' } }
});

const logger = log4js.getLogger('bluetooth');
logger.level = 'debug';
//设置RSSI的范围值 -26 (a few inches) to -100 (40-50 m distance).
const RSSI_THRESHOLD=-90;
const TEMP_DEVICE_INFORMATION_SERVICE_UUID='0x9AC71523-E48C-4ED1-A9FD-35EADC77231A';//

/*
监听蓝牙状态
*/
noble.on('stateChange', state => {
  //logger.info(`蓝牙设备状态发生改变: ${state}`);
  if (state === 'poweredOn') {
    logger.info('------------开始搜索附近蓝牙设备------------');
    noble.startScanning();
  }else{
    logger.warn('------------本机蓝牙并未打开，请检查本机蓝牙设备------------');
  }
});

noble.on('warning', message => {
  logger.warn(message);
});



//发现附近蓝牙设备
noble.on('discover', peripheral => {
  //实际测试蓝牙硬件的服务UUID:HEART_RATE_DEVICE_INFORMATION_SERVICE_UUID
  //CMD_UUID: 0xFFF1  HANDLE:0x20 (write)
  //DATA_UUID: 0xFFF2 HANDLE:0x23 (notify) 0x24 (write)
  if(peripheral.advertisement.serviceUuids&&peripheral.advertisement.serviceUuids[0]===TEMP_DEVICE_INFORMATION_SERVICE_UUID){
    noble.stopScanning();
    logger.info('-------------找到目标蓝牙设备，并尝试连接目标设备-------------');
    heartRatePeripheral(peripheral);
  }else{
    logger.warn(`发现附近其他蓝牙设备, 名称: ${peripheral.advertisement.localName}, uuid: ${peripheral.uuid}, MAC地址: ${peripheral.address}, 信号强度: ${peripheral.rssi}, state:${peripheral.state}`)
    //logger.warn('找不到相对应的设备，请将bluetooth_scan_result.log 文件一并发给联系开发者');
  }
});

async function heartRatePeripheral(peripheral){
  //特征UUID：0x9AC71526-E48C-4ED1-A9FD-35EADC77231A   权限Notify/Read值
  const TEMP_DEVICE_INFORMATION_CHARACTER='0x9AC71526-E48C-4ED1-A9FD-35EADC77231A';
  peripheral.on('connect', () => {
    logger.info('-------------已经成功连接-------------');
    logger.info(`连接设备, 名称: ${peripheral.advertisement.localName}, uuid: ${peripheral.uuid}, MAC地址: ${peripheral.address}, 信号强度: ${peripheral.rssi}, state:${peripheral.state}`)
  });

  peripheral.on('disconnect', (error) => {
    if(error){
      logger.info('-------------设备断开连接失败-------------');
      logger.error(error);
    }
    else{
      logger.info('-------------设备已经断开-------------');
      logger.info('-------------开始重新搜索-------------');
      noble.startScanning();
    }

  });

  //连接蓝牙设备
  peripheral.connect(error => {
    if(error){
      logger.error('-------------连接设备失败-------------');
      logger.error(error);
    }

    //发现设备的服务
    peripheral.discoverServices([TEMP_DEVICE_INFORMATION_SERVICE_UUID], (error, services) => {
      if(error){
        logger.error('-------------获取设备服务失败-------------');
        logger.error(error);
      }
      //console.log(services);
      logger.info(`----成功获取服务----, name: ${services[0].name}, uuid: ${services[0].uuid}, type: ${services[0].type}`);
      //获取 service 实体
      const tempService = services[0];


      //获取 characteristics 特征
      tempService.discoverCharacteristics([TEMP_DEVICE_INFORMATION_CHARACTER], function(error, characteristics) {

          if(error){
            logger.error('-------------获取特征失败-------------');
            logger.error(error);
          }

          let tempCharacteristic = characteristics[0];
          logger.info('---------获取 temp characteristic 特征------------');
          logger.debug(tempCharacteristic);

          if(tempCharacteristic){
            // true if for write without response
            // to enable notify 订阅通知

            //订阅
            /*tempCharacteristic.subscribe(function(error) {
              if(error){
                 logger.error("通过特征直接订阅通知失败: " + error);
              }
              logger.info('------------订阅特征通知成功-----------');
            });*/

            //打开通知
            tempCharacteristic.notify(true, (error)=> {
               if (error) {
                   logger.error("notify error: " + error)
               }
               logger.info('data channel notification is on!');
             });


             //读取UID 0xA5 0x04 0x04 0x5A 设备唯一编码
             tempCharacteristic.write(new Buffer([0xA5,0x04,0x04,0x5A ]), true, (error)=>{
               if(error){
                  logger.error("发送指令读取UID失败: " + error);
               }
               logger.info('---------通过 Characteristic 读取UID---------');
             });

             //读取标定系数 0xA5 04 10 5A
             tempCharacteristic.write(new Buffer([0xA5,0x04,0x10,0x5A]), true, (error)=>{
               if(error){
                  logger.error("发送指令读取标定系数失败: " + error);
               }
               logger.info('---------通过 Characteristic 读取标定系数---------');
             });

             /*
             读取标定系数: 读取标定系数应答0X11
              发送：0xA5 04 10 5A
              返回：0xA5 0C 11 9A 99 99 3F 9A 99 99 3F 5A
              */
             tempCharacteristic.write(new Buffer([0xA5,0x04,0x10,0x5A]), true, (error)=>{
               if(error){
                  logger.error("发送指令读取标定系数失败: " + error);
               }
               logger.info('---------通过 Characteristic 读取标定系数---------');
             });


             /*
             读取采集周期
              发送：0xA5 04 14 5A
              返回：0xA5 0A 15 3C 00 00 00 5A
              3C:60*0.1s=0.6s
              */
             tempCharacteristic.write(new Buffer([0xA5,0x04,0x14,0x5A]), true, (error)=>{
               if(error){
                  logger.error("发送指令读取采集周期 失败: " + error);
               }
               logger.info('---------通过 Characteristic 读取采集周期---------');
             });


            tempCharacteristic.on('data', (data, isNotification)=> {
              logger.info('温度设备返回指令：', data.toString('hex'));
            });
        }
      });
    });
  });
}
