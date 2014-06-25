var fs = require('fs');
var tessel = require('tessel');
var screenlib = require('../');

var fruit = new Buffer(fs.readFileSync('/app/test/adafruit.bin'));

screenlib.use(tessel.port['A'], function (err, screen) {
	console.log('Connected.');

	// Overwrite buffer with Adafruit logo and display
	screen.setBuffer(fruit1);
	screen.refresh(function () {
		console.log('Displayed.');
	});
})
