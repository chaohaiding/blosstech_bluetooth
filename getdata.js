//const noble = require('noble')
const noble=require('@abandonware/noble');
//const noble = require('@s524797336/noble-mac');//仅在Mac Mojave版本上有问题，需要安装该branch https://github.com/Timeular/noble-mac/issues/7
const inquirer = require('inquirer');
const log4js = require('log4js');
log4js.configure({
  appenders: { bluetooth: { type: 'file', filename: 'bluetooth_getdata.log' }, console: { type: 'console' }  },
  categories: { default: { appenders: ['bluetooth', 'console'], level: 'info' } }
});

const logger = log4js.getLogger('bluetooth');
logger.level = 'debug';
//设置RSSI的范围值 -26 (a few inches) to -100 (40-50 m distance).
const RSSI_THRESHOLD=-90;

const HEART_RATE_DEVICE_INFORMATION_SERVICE_UUID='FFF0';//
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
  logger.info(`发现附近蓝牙设备, 名称: ${peripheral.advertisement.localName}, uuid: ${peripheral.uuid}, MAC地址: ${peripheral.address}, 信号强度: ${peripheral.rssi}, state:${peripheral.state}`)
  //实际测试蓝牙硬件的服务UUID:HEART_RATE_DEVICE_INFORMATION_SERVICE_UUID
  //CMD_UUID: 0xFFF1  HANDLE:0x20 (write)
  //DATA_UUID: 0xFFF2 HANDLE:0x23 (notify) 0x24 (write)
  if(peripheral.advertisement.serviceUuids&&peripheral.advertisement.serviceUuids[0]===HEART_RATE_DEVICE_INFORMATION_SERVICE_UUID){
    noble.stopScanning();
    logger.info('-------------找到目标蓝牙设备，并尝试连接目标设备-------------');
    heartRatePeripheral(peripheral);
  }else{
    //logger.warn('找不到相对应的设备，请将bluetooth_scan_result.log 文件一并发给联系开发者');
  }
});

async function heartRatePeripheral(peripheral){
  HEART_RATE_DEVICE_INFORMATION_CHARACTERISTIC_CMD_UUID='FFF1';
  HEART_RATE_DEVICE_INFORMATION_CHARACTERISTIC_DATA_UUID='FFF2';
  HEART_RATE_DEVICE_INFORMATION_HANDLE_CMD_WRITE=0x20;
  HEART_RATE_DEVICE_INFORMATION_HANDLE_DATA_NOTIFY=0x23;
  HEART_RATE_DEVICE_INFORMATION_HANDLE_DATA_WRITE=0X24;
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
    peripheral.discoverServices([HEART_RATE_DEVICE_INFORMATION_SERVICE_UUID], (error, services) => {
      if(error){
        logger.error('-------------获取设备服务失败-------------');
        logger.error(error);
      }
      //console.log(services);
      logger.info(`----成功获取服务----, name: ${services[0].name}, uuid: ${services[0].uuid}, type: ${services[0].type}`);
      //获取 service 实体
      const heartRateService = services[0];


      //获取 characteristics 特征
      heartRateService.discoverCharacteristics([HEART_RATE_DEVICE_INFORMATION_CHARACTERISTIC_CMD_UUID, HEART_RATE_DEVICE_INFORMATION_CHARACTERISTIC_DATA_UUID], function(error, characteristics) {

          if(error){
            logger.error('-------------获取特征失败-------------');
            logger.error(error);
          }

          let heartRateCMDCharacteristic = characteristics[0];
          let heartRateDATACharacteristic= characteristics[1];
          logger.info('---------获取 heart rate cmd characteristic 特征------------');
          logger.debug(heartRateCMDCharacteristic);
          logger.info('---------获取 heart rate data characteristic 特征------------');
          logger.debug(heartRateDATACharacteristic);

          if(heartRateCMDCharacteristic&&heartRateDATACharacteristic){
            // true if for write without response
            // to enable notify 订阅通知
            /*heartRateDATACharacteristic.subscribe(function(error) {
              if(error){
                 logger.error("通过特征直接订阅DATA通道通知失败: " + error);
              }
              logger.info('------------订阅DATA特征通知成功-----------');
            });*/

            heartRateDATACharacteristic.notify(true, (error)=> {
               if (error) {
                   logger.error("notify error: " + error)
               }
               logger.info('data channel notification is on!');
             });

            //DATA通道通知使能，写入0x0001打开通知
            heartRateDATACharacteristic.write(new Buffer([0x0001]), true, (error)=>{
              if(error){
                 logger.error("发送指令打开DATA通道通知失败: " + error);
              }
              logger.info('---------通过 DATA Characteristic 打开DATA通道通知---------');
            });

            //获得设备时间
            var dateObj = new Date();
            var month = dateObj.getUTCMonth() + 1;
            var day = dateObj.getUTCDate();
            var year = dateObj.getUTCFullYear();
            var seconds = date.getSeconds();
            var minutes = date.getMinutes();
            var hour = date.getHours();
            //开始单机采集: 0xE8 0x23 Y,M,D,H,F,S, T1:T0 [T1:T0]: 采集时间（单位：min）
            //这里设置T1:0x01, T0:0x00
            heartRateCMDCharacteristic.write(new Buffer([0xE8, 0x23, year.toString('16'), month.toString('16'),day.toString('16'),hour.toString('16'), minutes.toString('16'), seconds.toString('16'),0x01,0x00]), true, (error)=> {
              if(error){
                 logger.error("开始单机采集错误: " + error);
              }

              logger.info('通过 characteristic 开始单机采集');//Not work on andriod simulator
            });

            let tranistFlag=false;
            heartRateDATACharacteristic.on('data', (data, isNotification)=> {
              //console.log('设备返回指令：', data.toString('hex'));
              logger.info('设备返回指令：', data.toString('hex'));
              //获得返回结果的字节长度
              let buff_len=Buffer.byteLength(data);
              if(buff_len==6){
                //结束单机采集:0xE8 0x22
                heartRateCMDCharacteristic.write(new Buffer([0xE8, 0x22]), true, (error)=> {
                  if(error){
                     logger.error("结束单机采集错误: " + error);
                  }
                  logger.info('通过 characteristic 结束单机采集');//Not work on andriod simulator
                });
              }else if(buff_len==4){
                //结束单机采集
                if(!tranistFlag){
                  tranistFlag=true;
                  //开始实时传输 0xE8, 0X20, A,H,M,L
                  //A：通道号传输时间（单位：ms）：
                  //H:高字节
                  //M:中字节
                  //L:低字节
                  //传输时间=0时发默认30s
                  heartRateCMDCharacteristic.write(new Buffer([0xE8, 0x20]), true, (error)=> {
                    if(error){
                       logger.error("开始实时传输错误: " + error);
                    }
                    logger.info('通过 characteristic 开始实时传输');//Not work on andriod simulator
                  });
                }else{
                  //实时传输结束
                  heartRateCMDCharacteristic.write(new Buffer([0xE8, 0x26]), true, (error)=> {
                    if(error){
                       logger.error("结束实时传输错误: " + error);
                    }
                    logger.info('通过 characteristic 结束实时传输');//Not work on andriod simulator
                  });
                }
              }
            });
        }
      });
    });
  });
}
