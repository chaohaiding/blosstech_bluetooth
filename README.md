# blosstech_bluetooth

A node js test case for connecting the blosstech bluetooth devices


## Prerequisties for test
 - install node js [v8.17.0](https://nodejs.org/es/blog/release/v8.17.0/)
 - install npm
 
## Prerequisties for [Noble](https://github.com/noble/noble).

### OS X
- install Xcode

### Linux
- Kenral version 3.6 or above
- `libbluetooth-dev`

#### Unbuntu/Debian/Raspbian
`sudo apt-get install bluetooth bluez libbluetooth-dev libudev-dev`
Make sure `node` is on your path

### Windows
[node-gyp requirements for Windows](https://github.com/nodejs/node-gyp#installation)

Install the required tools and configurations using Microsoft's [windows-build-tools](https://github.com/felixrieseberg/windows-build-tools) from an elevated PowerShell or cmd.exe (run as Administrator).
`npm install --global --production windows-build-tools`

[node-bluetooth-hci-socket prerequisites](https://github.com/noble/node-bluetooth-hci-socket#windows)
- Compatible Bluetooth 4.0 USB adapter
- WinUSB driver setup for Bluetooth 4.0 USB adapter, using [Zadig tool](https://zadig.akeo.ie/)

## Run the test
- downloand the code into your local machine
`git clone https://github.com/chaohaiding/blosstech_bluetooth.git`
- `cd blosstech_bluetooth`
- run `npm install` to install all the dependencies
- turn on your bluetooh devices and the bluetooth adaptar in your local machine.
- run `node scan.js` to get the test log `bluetooth_scan.log`.
- run `node getdata.js` to get the test log `bluetooth_getdata.log`.



