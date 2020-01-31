var mqtt = require('mqtt');

var connected = false;
var isConnected = function() {
  return connected;
}

var setup = function(config, onMessage, finished) {

	// connect to mqtt
	var client = mqtt.connect(config.mqtt.host, {
		username: config.mqtt.user,
		password: config.mqtt.password,
		rejectUnauthorized: config.mqtt.rejectUnauthorized
	});

	// successful connected :)
	client.on('connect', function() {
		console.log('MQTT Connected');
    connected = true;
    finished();
	});

	// handle incomming messages
	client.on('message', function(topic, msg) {
		onMessage(topic, msg.toString());
	});

  return client;
}

module.exports = {
	setup: setup,
  isConnected: isConnected
}
