const config = require('./config');

const Cul = require('cul');
const mqtt_handler = require('./mqtt_handler.js');

const mqtt = mqtt_handler.setup(config, mqttMessageHandler, init);

const cul = new Cul({
	serialport: config.cul.serialport,
	mode: 'SlowRF',
	connectionMode: config.cul.connectionMode,
	host: config.cul.host
	// debug: true
});

let culReady = false;
cul.on('ready', () => {
	culReady = true;
	init();
});

let lookupTable = [];

function init() {
	if (culReady && mqtt_handler.isConnected()) {
		console.log("Started Successfully !");

		config.devices.forEach((dev, i) => {
			mqtt.subscribe(dev.mqtt + '/set');

			var newEntry = {};
			newEntry.mqtt = dev.mqtt;
			newEntry.retain = dev.retain || false;
			newEntry.lastRecv = {
				date: Date.now(),
				msg: ""
			};

			if (dev.fs20) {
				newEntry.protocol = "FS20";
				newEntry.id = dev.fs20;
			} else if (dev.ws) {
				newEntry.protocol = "WS";
				newEntry.id = dev.ws;
			} else if (dev.fht) {
				newEntry.protocol = "FHT";
				newEntry.id = dev.fht;
			} else throw "No type found !";

			lookupTable.push(newEntry);
		});

		// console.log(lookupTable);

	}
}

cul.on('data', function(raw, obj) {

	// skip MORITZ protocol
	if (obj.protocol == 'MORITZ') return;

	// debug
	if (config.debug)
		console.log(obj);

	lookupTable.forEach((dev, i) => {

		// check if its the correct protocol
		if (obj.protocol == dev.protocol) {

			// its "FS20"
			if (obj.protocol == "FS20") {

				// compare address code and device code
				if (obj.data.addressCodeElv == dev.id.address &&
					obj.data.addressDeviceElv == dev.id.device) {

					let send = {
						cmd: obj.data.cmd
					}

					// send data in JSON format
					sendMqttMsg(dev, dev.mqtt, JSON.stringify(send));
				} else {
					return;
				}
			}

			// its "WS"
			else if (obj.protocol == "WS") {
				// send data in JSON format
				sendMqttMsg(dev, dev.mqtt, JSON.stringify(obj.data));
			}

			// its "FHT"
			else if (obj.protocol == "FHT") {

				// compare address
				if (obj.data.addressCode == parseInt(dev.id.address)) {
					let send = {
						cmd: obj.data.cmd,
						valueRaw: obj.data.valueRaw
					}

					// encoded value is available
					// so add it to send
					if (obj.data.value)
						send.value = obj.data.value

					// ignore actuator commands
					if (parseInt(obj.data.cmdRaw, 16) > 8)
						// send data in JSON format
						sendMqttMsg(dev, dev.mqtt, JSON.stringify(send));
				} else {
					return;
				}
			} else {
				return;
			}
		}
	});
});

function sendMqttMsg(device, topic, msg) {

	// there is already data from the last few seconds
	if (Date.now() - device.lastRecv.date < 1000) {

		// if it's the same data -> ignore it
		if (device.lastRecv.msg == msg) {
			if (config.debug) console.log("Ignore douplicate of msg '" + msg + "' in '" + topic + "'!");
			return;
		}
	}

	// it's new data or it's long ago since the last cmd
	mqtt.publish(topic, msg, {
		retain: device.retain
	});

	// save new lastRecv
	device.lastRecv.date = Date.now();
	device.lastRecv.msg = msg;
}

function mqttMessageHandler(topic, msg) {
	// console.log(topic, msg);

	try {
		msg = JSON.parse(msg);
	} catch (err) {
		console.log("Error parsing message");
		return;
	}

	if (msg.cmd == null) return;

	lookupTable.forEach((dev, i) => {
		if (topic == dev.mqtt + '/set') {

			if (dev.protocol == "FS20")
				cul.cmd(dev.protocol, dev.id.address, dev.id.device, msg.cmd);
			else if (dev.protocol == "FHT" && msg.value != null)
				cul.cmd(dev.protocol, dev.id.centralCode, dev.id.address, msg.cmd, msg.value);

			return;
		}
	});
}
