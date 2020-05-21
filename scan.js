//const noble = require('noble');
const noble=require('@abandonware/noble');
//const noble = require('@s524797336/noble-mac');//仅在Mac Mojave版本上有问题，需要安装该branch https://github.com/Timeular/noble-mac/issues/7
const inquirer = require('inquirer');
const log4js = require('log4js');
log4js.configure({
  appenders: { bluetooth: { type: 'file', filename: 'bluetooth_scan.log' }, console: { type: 'console' }  },
  categories: { default: { appenders: ['bluetooth', 'console'], level: 'info' } }
});

const logger = log4js.getLogger('bluetooth');
logger.level = 'debug';
//设置RSSI的范围值 -26 (a few inches) to -100 (40-50 m distance).
const RSSI_THRESHOLD=-90;


const HEART_RATE_DEVICE_INFORMATION_SERVICE_UUID='FFF0';//

const HEART_RATE_DEVICE_INFORMATION_UUID='e07dead8e8a9';


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

  if(peripheral.uuid==HEART_RATE_DEVICE_INFORMATION_UUID){
    logger.info('-------------通过UUID找到目标蓝牙设备，并尝试连接目标设备-------------');
    //logger.info(peripheral);
    heartRatePeripheral(peripheral);
  }
  if(peripheral.advertisement.serviceUuids&&peripheral.advertisement.serviceUuids[0]===HEART_RATE_DEVICE_INFORMATION_SERVICE_UUID){
    noble.stopScanning();
    logger.info('-------------通过Service_UUID找到目标蓝牙设备，并尝试连接目标设备-------------');
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
    logger.info(peripheral);
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


    logger.info('-------------尝试获取设备服务-------------');
    //发现设备的服务
    peripheral.discoverServices(null, (error, services) => {
      if(error){
        logger.error('-------------获取设备服务失败-------------');
        logger.error(error);
      }

      logger.info(services);
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

            //发送指令查询设备状态 [0xE8, 0x10]
            heartRateCMDCharacteristic.write(new Buffer([0xE8, 0x10]), true, (error)=>{
              if(error){
                 logger.error("发送指令查询设备状态错误: " + error);
              }
              logger.info('---------通过 CMD Characteristic 查询设备状态---------');
            });

            //发送指令查询设备型号 0xE8, 0x13
            heartRateCMDCharacteristic.write(new Buffer([0xE8, 0x13]), true, (error)=> {
              if(error){
                 logger.error("发送指令查询设备型号错误: " + error);
              }
              logger.info('通过 characteristic 查询设备型号');
            });

            //查询设备MAC地址
            heartRateCMDCharacteristic.write(new Buffer([0xE8, 0x1B]), true, (error)=>{
              if(error){
                 logger.error("发送指令查询设备MAC地址错误: " + error);
              }

              logger.info('通过 characteristic 查询设备MAC地址');//Not work on andriod simulator
            });

            //查询当前绑定用户ID
            heartRateCMDCharacteristic.write(new Buffer([0xE8, 0x1D]), true, (error)=> {
              if(error){
                 logger.error("发送指令查询当前绑定用户ID错误: " + error);
              }
              logger.info('通过 characteristic 查询当前绑定用户ID');//Not work on andriod simulator
            });


            //查询设备时间
            heartRateCMDCharacteristic.write(new Buffer([0xE8, 0x1F]), true, (error)=> {
              if(error){
                 logger.error("查询设备时间错误: " + error);
              }
              logger.info('通过 characteristic 查询设备时间');//Not work on andriod simulator
            });

            //notify 获取通知
            heartRateDATACharacteristic.on('data', (data, isNotification)=> {
              //console.log('设备返回指令：', data.toString('hex'));
              logger.info('设备返回指令：', data.toString('hex'));
            });

          }else{

              logger.info('---------获取的 CMD 或DATA characteristic 为空，现在尝试直接使用handle来发送数据，入无任何数据读取请退出-----------');
              //DATA通道通知使能，写入0x0001打开通知
              peripheral.writeHandle(HEART_RATE_DEVICE_INFORMATION_HANDLE_DATA_WRITE, new Buffer([0x0001]), true, (error)=>{
                if(error) {
                    logger.error('BLE: Write handle '+HEART_RATE_DEVICE_INFORMATION_HANDLE_DATA_WRITE+' Error: ' + error);
                }
              });

              //发送指令查询设备状态 [0xE8, 0x10]
              peripheral.writeHandle(HEART_RATE_DEVICE_INFORMATION_HANDLE_CMD_WRITE, new Buffer([0xE8, 0x10]), true, (error)=>{
                if(error) {
                    logger.error('发送指令查询设备状态错误 '+HEART_RATE_DEVICE_INFORMATION_HANDLE_CMD_WRITE+' Error: ' + error);
                }
                logger.info('---------通过 CMD Characteristic 查询设备状态---------');
              });


              //发送指令查询设备型号 0xE8, 0x13
              peripheral.writeHandle(HEART_RATE_DEVICE_INFORMATION_HANDLE_CMD_WRITE, new Buffer([0xE8, 0x13]), true, (error)=>{
                if(error) {
                    logger.error('发送指令查询设备型号错误 '+HEART_RATE_DEVICE_INFORMATION_HANDLE_CMD_WRITE+' Error: ' + error);
                }
                logger.info('通过 characteristic 查询设备型号');
              });

              //查询设备MAC地址
              peripheral.writeHandle(HEART_RATE_DEVICE_INFORMATION_HANDLE_CMD_WRITE, new Buffer([0xE8, 0x1B]), true, (error)=>{
                if(error) {
                    logger.error('发送指令查询设备MAC地址错误 '+HEART_RATE_DEVICE_INFORMATION_HANDLE_CMD_WRITE+' Error: ' + error);
                }
                logger.info('通过 characteristic 查询设备MAC地址');
              });

              //查询当前绑定用户ID
              peripheral.writeHandle(HEART_RATE_DEVICE_INFORMATION_HANDLE_CMD_WRITE, new Buffer([0xE8, 0x1D]), true, (error)=>{
                if(error) {
                    logger.error('发送指令查询当前绑定用户ID错误 '+HEART_RATE_DEVICE_INFORMATION_HANDLE_CMD_WRITE+' Error: ' + error);
                }
                  logger.info('通过 characteristic 查询当前绑定用户ID');
              });

              //查询设备时间
              peripheral.writeHandle(HEART_RATE_DEVICE_INFORMATION_HANDLE_CMD_WRITE, new Buffer([0xE8, 0x1F]), true, (error)=>{
                if(error) {
                    logger.error('查询设备时间错误 '+HEART_RATE_DEVICE_INFORMATION_HANDLE_CMD_WRITE+' Error: ' + error);
                }
                  logger.info('通过 characteristic 查询设备时间');
              });

              /*peripheral.readHandle(HEART_RATE_DEVICE_INFORMATION_HANDLE_DATA_NOTIFY, (error, data)=>{
                if(error) {
                    logger.error('BLE: Read handle '+HEART_RATE_DEVICE_INFORMATION_HANDLE_DATA_NOTIFY+' Error: ' + error);
                }
                logger.info('设备返回指令：', data.toString('hex'));
              });*/

              peripheral.on('handleNotify', (handle, value)=>{
                logger.info('------------------Handle 通知--------------------');
                if(handle==HEART_RATE_DEVICE_INFORMATION_HANDLE_DATA_NOTIFY){
                  logger.info('DATA Notify', handle ,value);
                }else{
                  logger.info('Non DATA Notify', handle ,value);
                }
              });
          }
      });
    });


  });
}


function sleep(millis) {
    return new Promise(function (resolve, reject) {
        setTimeout(function () { resolve(); }, millis);
    });
}
