const arrayBufferToHex = require('array-buffer-to-hex')
//const noble = require('noble')
const noble = require('@s524797336/noble-mac');//仅在Mac Mojave版本上有问题，需要安装该branch https://github.com/Timeular/noble-mac/issues/7
const inquirer = require('inquirer');
const log4js = require('log4js');
log4js.configure({
  appenders: { bluetooth: { type: 'file', filename: 'bluetooth_test.log' }, console: { type: 'console' }  },
  categories: { default: { appenders: ['bluetooth', 'console'], level: 'info' } }
});

const logger = log4js.getLogger('bluetooth');
logger.level = 'debug';
/*本地测试xiaomi手机+ Google Peripheral bluetooth simulator
  service（服务）: Heart Rate UUID: 180d type: org.bluetooth.service.heart_rate
  characteristic（特征）:
    name: Heart Rate Measurement, uuid: 2a37, type: org.bluetooth.characteristic.heart_rate_measurement, properties: notify
    name: Body Sensor Location, uuid: 2a38, type: org.bluetooth.characteristic.body_sensor_location, properties: read
    name: Heart Rate Control Point, uuid: 2a39, type: org.bluetooth.characteristic.heart_rate_control_point, properties: write
*/
const DEVICE_INFORMATION_SERVICE_UUID = '180d';
const DEVICE_INFORMATION_CHARACTERISTIC_HEART_RATE_MEASURE_UUID='2a37';
const DEVICE_INFORMATION_CHARACTERISTIC_BODY_SENSOR_UUID='2a38';
const DEVICE_INFORMATION_CHARACTERISTIC_HEART_RATE_CONTROL_UUID='2a39';
//设置RSSI的范围值 -26 (a few inches) to -100 (40-50 m distance).
const RSSI_THRESHOLD=-90;
const BATTERY_DEVICE_INFORMATION_SERVICE_UUID='180f';
const HEART_RATE_DEVICE_INFORMATION_SERVICE_UUID='FFF0';
/*
监听蓝牙状态
*/
noble.on('stateChange', state => {
  logger.info(`蓝牙设备状态发生改变: ${state}`);

  if (state === 'poweredOn') {
    logger.info('------------开始搜索附近蓝牙设备------------');
    noble.startScanning();
  }
});

noble.on('warning', message => {
  logger.warn(message);
});



//发现附近蓝牙设备
noble.on('discover', peripheral => {
  //目前iOS中MAC地址不能识别，只能通过UUID来标注，同时蓝牙的UUID在iOS中并不是每次都相同。
  //peripheral的结构
  /*
    peripheral = {
      id: "<id>",
      address: "<BT address">, // Bluetooth Address of device, or 'unknown' if not known
      addressType: "<BT address type>", // Bluetooth Address type (public, random), or 'unknown' if not known
      connectable: <connectable>, // true or false, or undefined if not known
      advertisement: {
        localName: "<name>",
        txPowerLevel: <int>,
        serviceUuids: ["<service UUID>", ...],
        serviceSolicitationUuid: ["<service solicitation UUID>", ...],
        manufacturerData: <Buffer>,
        serviceData: [
            {
                uuid: "<service UUID>"
                data: <Buffer>
            },
            ...
        ]
      },
      rssi: <rssi>
    };
  */

  logger.info(`发现附近蓝牙设备, 名称: ${peripheral.advertisement.localName}, uuid: ${peripheral.uuid}, MAC地址: ${peripheral.address}, 信号强度: ${peripheral.rssi}, state:${peripheral.state}`)
  //测试设备的 Mac address: 5f-96-cb-83-9a-aa
  //Battery: advertisement: { txPowerLevel: -7, serviceUuids: [ '180f' ] },

  if(peripheral.advertisement.serviceUuids&&peripheral.advertisement.serviceUuids[0]===BATTERY_DEVICE_INFORMATION_SERVICE_UUID){
    //console.log(peripheral);
    //取消搜索
    noble.stopScanning();
    batteryPeripheral(peripheral);
  }

  //Heart Rate Service
  if(peripheral.advertisement.serviceUuids&&peripheral.advertisement.serviceUuids[0]===DEVICE_INFORMATION_SERVICE_UUID){

      //console.log(peripheral);
      //取消搜索
      noble.stopScanning();
      peripheral.on('connect', () => console.log('-------------设备已经连接-------------'));
      peripheral.on('disconnect', () => {
        console.log('-------------设备已经断开-------------');
        console.log('                                    ');
        console.log('-------------重新搜索-------------');
        noble.startScanning();
      });

      //连接设备
      peripheral.connect(error => {

        //发现设备的服务
        peripheral.discoverServices([DEVICE_INFORMATION_SERVICE_UUID], (error, services) => {
          console.log(`Found service, name: ${services[0].name}, uuid: ${services[0].uuid}, type: ${services[0].type}`)
          //获取service 实体
          const service = services[0]


          //特征 参考 https://github.com/noble/noble/issues/336
          service.discoverCharacteristics([DEVICE_INFORMATION_CHARACTERISTIC_HEART_RATE_MEASURE_UUID, DEVICE_INFORMATION_CHARACTERISTIC_BODY_SENSOR_UUID, DEVICE_INFORMATION_CHARACTERISTIC_HEART_RATE_CONTROL_UUID], (error, characteristics) => {
            let notifyCharacteristic=null;
            let readCharacteristic=null;
            let writeCharacteristic=null;

            characteristics.forEach(characteristic => {
              switch (characteristic.uuid) {
                  case DEVICE_INFORMATION_CHARACTERISTIC_HEART_RATE_MEASURE_UUID :
                      notifyCharacteristic = characteristic;
                      break;
                  case DEVICE_INFORMATION_CHARACTERISTIC_BODY_SENSOR_UUID:
                      readCharacteristic = characteristic;
                      break;
                  case DEVICE_INFORMATION_CHARACTERISTIC_HEART_RATE_CONTROL_UUID:
                      writeCharacteristic = characteristic;
                      break;
                  default :
              }
              console.log(`Found characteristic, name: ${characteristic.name}, uuid: ${characteristic.uuid}, type: ${characteristic.type}, properties: ${characteristic.properties.join(',')}`)
            });

            if (notifyCharacteristic && readCharacteristic && writeCharacteristic) {
              //notify status
              notifyCharacteristic.on('notify', function (state) {
                  console.log("notifyCharacteristic notify is :" + state?'on':'off');
              });
              //enable notify
              notifyCharacteristic.notify(true, function (error) {
                 if (error) {
                     console.log("notify error: " + error)
                 }
                 console.log('data channel notification is on!');
               });

              notifyCharacteristic.on('read', function (data, isNotification) {
                console.log("data:" + data.toString('hex'));//
                //console.log("data:"+ data.readUInt8(0));
              });

              //read data
              readCharacteristic.on('read', function (data, isNotification) {
                console.log("data(hex):" + data.toString('hex'));
              });


              //write data to reset energy expended
               writeCharacteristic.write(new Buffer([0x01], 'hex'), true, function(error){
                 if (error) {
                     console.log("write error: " + error);
                 }
                 console.log('writing to the heart rate')
                 //console.log(writeCharacteristic);
               });
            }
            /*
            characteristics.forEach(characteristic => {
              if (characteristic.name === 'System ID' || characteristic.name === 'PnP ID') {
                characteristic.read((error, data) => console.log(`${characteristic.name}: 0x${arrayBufferToHex(data)}`))
              } else {
                characteristic.read((error, data) => console.log(`${characteristic.name}: ${data.toString('ascii')}`))
              }
            });*/
          });
        });
    });
  }

  //测试设备的服务UUID:
  //CMD_UUID: 0xFFF1  HANDLE:0x20 (write)
  //DATA_UUID: 0xFFF2 HANDLE:0x23 (notify) 0x24 (write)
  //实际测试蓝牙硬件
  if(peripheral.advertisement.serviceUuids&&peripheral.advertisement.serviceUuids[0]===HEART_RATE_DEVICE_INFORMATION_SERVICE_UUID){
    noble.stopScanning();
    heartRatePeripheral(peripheral);
  }
});


async function batteryPeripheral(peripheral){
  peripheral.on('connect', () => logger.info('-------------找到目标蓝牙设备，并已经连接-------------'));
  peripheral.on('disconnect', () => {
    logger.info('-------------设备已经断开-------------');
    logger.info('-------------重新搜索-------------');
    noble.startScanning();
  });

  peripheral.once('disconnect', function(error){
   if(error){
     logger.error(error);
   }
   logger.info('设备已经断开连接');
  });

  //连接设备
  peripheral.connect(error => {
    //https://github.com/noble/noble/wiki/Getting-started
    //发现设备的服务
    peripheral.discoverServices([BATTERY_DEVICE_INFORMATION_SERVICE_UUID], (error, services) => {
      //console.log(services);
      //console.log(`Found service, name: ${services[0].name}, uuid: ${services[0].uuid}, type: ${services[0].type}`);
      //获取service 实体
      const batteryService = services[0];
      batteryService.discoverCharacteristics(['2a19'], function(error, characteristics) {
          var batteryLevelCharacteristic = characteristics[0];
          logger.info('---------Discovered Battery Level characteristic------------');
          //console.log(batteryLevelCharacteristic);
          // true if for write without response
          // to enable notify
          batteryLevelCharacteristic.subscribe(function(error) {
              logger.info('battery level notification on');
          });

          /*batteryLevelCharacteristic.write(new Buffer([0x1a]), true, function(error) {
            logger.info('set bettery level 26');//Not work on andriod simulator because betteryservice is not writable;
          });*/

          batteryLevelCharacteristic.on('data', function(data, isNotification) {
              logger.info('battery level is now: ', data.readUInt8(0) + '%');
          });


      });
    });
  });
}


async function heartRatePeripheral(peripheral){
  HEART_RATE_DEVICE_INFORMATION_CHARACTERISTIC_CMD_UUID='FFF1';
  HEART_RATE_DEVICE_INFORMATION_CHARACTERISTIC_DATA_UUID='FFF2';
  HEART_RATE_DEVICE_INFORMATION_HANDLE_CMD_WRITE=0x20;
  HEART_RATE_DEVICE_INFORMATION_HANDLE_DATA_NOTIFY=0x23;
  HEART_RATE_DEVICE_INFORMATION_HANDLE_DATA_WRITE=0X24;
  peripheral.on('connect', () => {
    logger.info('-------------找到目标蓝牙设备，并已经连接-------------');
    logger.info(`连接设备, 名称: ${peripheral.advertisement.localName}, uuid: ${peripheral.uuid}, MAC地址: ${peripheral.address}, 信号强度: ${peripheral.rssi}, state:${peripheral.state}`)

  });

  peripheral.on('disconnect', () => {
    logger.info('-------------设备已经断开-------------');
    logger.info('-------------重新搜索-------------');
    noble.startScanning();
  });

 peripheral.once('disconnect', function(error){
   if(error){
     logger.error('-------------设备断开连接失败-------------');
     logger.error(error);
   }
   else logger.info('-------------设备已经断开连接-------------');
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
        logger.error('-------------连接设备失败-------------');
        logger.error(error);
      }
      //console.log(services);
      logger.info(`----获取服务-----, name: ${services[0].name}, uuid: ${services[0].uuid}, type: ${services[0].type}`);
      //获取 service 实体
      const heartRateService = services[0];
      //获取 characteristics 特征
      heartRateService.discoverCharacteristics([HEART_RATE_DEVICE_INFORMATION_CHARACTERISTIC_CMD_UUID, HEART_RATE_DEVICE_INFORMATION_CHARACTERISTIC_DATA_UUID], function(error, characteristics) {
          let heartRateCMDCharacteristic = characteristics[0];
          let heartRateDATACharacteristic= characteristic[1];

          if(heartRateCMDCharacteristic&&heartRateDATACharacteristic){
            logger.info('---------Discovered heart rate cmd characteristic------------');
            logger.debug(heartRateCMDCharacteristic);
            logger.info('---------Discovered heart rate data characteristic------------');
            logger.debug(heartRateDATACharacteristic);

            // true if for write without response

            // to enable notify 订阅通知
            heartRateDATACharacteristic.subscribe(function(error) {
              if(error){
                 logger.error("通过特征直接订阅DATA通道通知失败: " + error);
              }
              logger.info('------------订阅DATA特征通知成功-----------');
            });

            //DATA通道通知使能，写入0x0001打开通知
            heartRateDATACharacteristic.write(new Buffer([0x0001]), true, function(error){
              if(error){
                 logger.error("发送指令打开DATA通道通知失败: " + error);
              }
              logger.info('---------通过 DATA Characteristic 打开DATA通道通知---------');
            });


            //发送指令查询设备状态 [0xE8, 0x10]
            heartRateCMDCharacteristic.write(new Buffer([0xE8, 0x10]), true, function(error) {
              if(error){
                 logger.error("发送指令查询设备状态错误: " + error);
              }
              logger.info('---------通过 CMD Characteristic 查询设备状态---------');
            });


            //发送指令查询设备型号 0xE8, 0x13
            heartRateCMDCharacteristic.write(new Buffer([0xE8, 0x13]), true, function(error) {
              if(error){
                 logger.error("发送指令查询设备型号错误: " + error);
              }
              logger.info('通过 characteristic 查询设备型号');
            });


            //查询设备MAC地址
            heartRateCMDCharacteristic.write(new Buffer([0xE8, 0x1B]), true, function(error) {
              if(error){
                 logger.error("发送指令查询设备MAC地址错误: " + error);
              }

              logger.info('通过 characteristic 查询设备MAC地址');//Not work on andriod simulator
            });


            //查询当前绑定用户ID
            heartRateCMDCharacteristic.write(new Buffer([0xE8, 0x1D]), true, function(error) {
              if(error){
                 logger.error("发送指令查询当前绑定用户ID错误: " + error);
              }
              logger.info('通过 characteristic 查询当前绑定用户ID');//Not work on andriod simulator
            });


            //查询设备时间
            heartRateCMDCharacteristic.write(new Buffer([0xE8, 0x1F]), true, function(error) {
              if(error){
                 logger.error("查询设备时间错误: " + error);
              }
              logger.info('通过 characteristic 查询设备时间');//Not work on andriod simulator
            });

            //开始单机采集[0xE8, 0x23, Y,M,D,H,F,S，T1:T0] Y,M,D,H,F,S，T1:T0 H=8
            //T1:T0 为采集时间单位(min)
            heartRateCMDCharacteristic.write(new Buffer([0xE8, 0x1F]), true, function(error) {
              if(error){
                 logger.error("查询设备时间错误: " + error);
              }
              logger.info('通过 characteristic 查询设备时间');//Not work on andriod simulator
            });





            //结束采集


            heartRateCMDCharacteristic.on('data', function(data, isNotification) {
              console.log('设备返回指令：', data.toString('hex'));
            });

          }
          else{
              logger.error('---------Discovered heart rate cmd characteristic failed 获取characteristic失败------------');
          }
      });
    });

    /*
    peripheral.writeHandle(handle, data, withoutResponse, callback(error));
    peripheral.readHandle(handle, callback(error, data));
    peripheral.on('handleNotify', function(handle, value) {}*/

    /*
    peripheral.writeHandle('0x20', new Buffer([0xE8, 0x00, 0x00]), true, function (error) {
        console.log('BLE: Write handle Error: ' + error);
        peripheral.disconnect();
    });
    peripheral.on('handleNotify', function(handle, value) {
    */
  });
}

function sleep(millis) {
    return new Promise(function (resolve, reject) {
        setTimeout(function () { resolve(); }, millis);
    });
}
