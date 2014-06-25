var fs = require('fs'),
    PNG = require('node-png').PNG;

var facespng = fs.readFileSync(__dirname + '/faces.png');
faces = new PNG({
  checkCRC: false
}).parse(facespng);

var screenlib = require('../');
var tessel = require('tessel');

screenlib.use(tessel.port['A'], function (err, screen) {
  console.log('Connected to screen.');

  for (var y = 0; y < faces.height; y++) {
    for (var x = 0; x < faces.width; x++) {
      var idx = (faces.width * y + x) * 4;
      screen.setPixel(x, y, faces.data[idx] == 70);
    }
  }

  // Overwrite buffer with image.
  screen.refresh(function () {
    console.log('Displayed.');
  });
})
