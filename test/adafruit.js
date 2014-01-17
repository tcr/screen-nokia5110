var fs = require('fs');

require('../').connect(function (err, screen) {
	console.log('Connected.');

	// Overwrite buffer with Adafruit logo and display
	screen.setBuffer(new Buffer(fs.readFileSync('/app/test/adafruit.bin')));
	screen.refreshSync();
	console.log('Displayed.');
})