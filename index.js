var tessel = require('tessel');
var fs = require('fs');
var Queue = require('sync-queue')


var BLACK = 1
var WHITE = 0

// Screen is six rows (pages) with each byte being eight vertical pixels.
var LCDWIDTH = 84
var LCDHEIGHT = 48

var PCD8544_POWERDOWN = 0x04
var PCD8544_ENTRYMODE = 0x02
var PCD8544_EXTENDEDINSTRUCTION = 0x01

var PCD8544_DISPLAYBLANK = 0x0
var PCD8544_DISPLAYNORMAL = 0x4
var PCD8544_DISPLAYALLON = 0x1
var PCD8544_DISPLAYINVERTED = 0x5

// H = 0
var PCD8544_FUNCTIONSET = 0x20
var PCD8544_DISPLAYCONTROL = 0x08
var PCD8544_SETYADDR = 0x40
var PCD8544_SETXADDR = 0x80

// H = 1
var PCD8544_SETTEMP = 0x04
var PCD8544_SETBIAS = 0x10
var PCD8544_SETVOP = 0x80

// the most basic function, set a single pixel
function setScreenPixel (buffer, x, y, color) {
  x = x | 0;
  y = y | 0;
  if ((x < 0) || (x >= LCDWIDTH) || (y < 0) || (y >= LCDHEIGHT))
    return false;

  // Get the byte we're writing to.
  // Screen is structured as six rows (pages).
  var pixel = (Math.floor(y / 8)*8 * LCDWIDTH) + (x * 8) + (y % 8);
  var byte = Math.floor(pixel / 8);
  var mask = 1 << (pixel % 8);
  if (color) {
    buffer[byte] = buffer[byte] | mask;
  } else {
    // buffer[col] = buffer[col] & ~(1 << (y%8));
  }
  return true;
}

exports.use = function (port, next)
{
  var cs = port.digital[0].output().low();
  var dc = port.digital[1].output().low();
  var blacklight = port.digital[2].output().high();

  var pcd8544_buffer = new Buffer(LCDWIDTH * LCDHEIGHT / 8);
  pcd8544_buffer.fill(0);

  var yUpdateMin = 0;
    yUpdateMax = 0;
    xUpdateMin = 0;
    xUpdateMax = 0;

  var spi = new port.SPI({
    clockSpeed: 8 * 1000000,
    dataMode: 0
  });

  function command (b, next) {
    dc.low();
    cs.low();
    spi.send(new Buffer([b]), function () {
      cs.high();
      next();
    });
  }

  function main () {
    // rst.high();

    // get into the EXTENDED mode!
    command(PCD8544_FUNCTIONSET | PCD8544_EXTENDEDINSTRUCTION, function () {

      // LCD bias select (4 is optimal?)
      command(PCD8544_SETBIAS | 0x4, function () {
        // set VOP
        // if (contrast > 0x7f)
        //   contrast = 0x7f;

        var contrast = 0x3a;
        // Experimentally determined
        command( PCD8544_SETVOP | contrast, function () {
          // normal mode
          command(PCD8544_FUNCTIONSET, function () {

            // Set display to Normal
            command(PCD8544_DISPLAYCONTROL | PCD8544_DISPLAYNORMAL, function () {
              // initial display line
              // set page address
              // set column address
              // write display data

              // set up a bounding box for screen updates

              updateBoundingBox(0, 0, LCDWIDTH-1, LCDHEIGHT-1);

              // Push out pcd8544_buffer to the Display (will show the AFI logo)
              next && next(null, ret);
            });
          });
        });
      });
    });
  }

  // the most basic function, set a single pixel
  function setPixel (x, y, color) {
    if (setScreenPixel(pcd8544_buffer, x, y, color)) {
      updateBoundingBox(x, y, x, y);
    }
  }

  // the most basic function, get a single pixel
  function getPixel (x, y) {
    if ((x < 0) || (x >= LCDWIDTH) || (y < 0) || (y >= LCDHEIGHT))
      return 0;

    return (pcd8544_buffer[x+ (y/8)*LCDWIDTH] >> (y%8)) & 0x1;
  }

  function updateBoundingBox (xmin, ymin, xmax, ymax) {
    if (xmin < xUpdateMin) xUpdateMin = xmin;
    if (xmax > xUpdateMax) xUpdateMax = xmax;
    if (ymin < yUpdateMin) yUpdateMin = ymin;
    if (ymax > yUpdateMax) yUpdateMax = ymax;
  }

  function refresh (buffer, next) {
    if (typeof buffer == 'function') {
      next = buffer;
      buffer = null;
    }
    buffer = buffer || pcd8544_buffer;

    cs.low();
    dc.low();
    spi.send(new Buffer([PCD8544_SETYADDR | 0, PCD8544_SETXADDR | 0]), function () {
      dc.high();
      spi.send(buffer, function () {
        cs.high();

        command(PCD8544_SETYADDR, next);  // no idea why this is necessary but it is to finish the last byte?
      });
    });
  }

  function refreshDirtySync (buffer, next) {
    buffer = buffer || pcd8544_buffer;

    var queue = new Queue();
    for (var p = 0; p < 6; p++) {
      // check if this page is part of update
      if (yUpdateMin >= ((p+1)*8)) {
        continue;   // nope, skip it!
      }
      if (yUpdateMax < p*8) {
        break;
      }

      queue.place(function (next) {
        console.log('bump');
        dc.low();
        spi.send(new Buffer([PCD8544_SETYADDR | p, PCD8544_SETXADDR | xUpdateMin]), function () {
          console.log([PCD8544_SETYADDR | p, PCD8544_SETXADDR | xUpdateMin]);
          dc.high();
          spi.send(pcd8544_buffer.slice((LCDWIDTH*p)+xUpdateMin, (LCDWIDTH*p)+xUpdateMax), next);
        });
      });
    }


    cs.low();
    queue.place(function () {
      console.log('finished');
      cs.high();

      command(PCD8544_SETYADDR, function () {  // no idea why this is necessary but it is to finish the last byte?
        xUpdateMin = LCDWIDTH - 1;
        xUpdateMax = 0;
        yUpdateMin = LCDHEIGHT-1;
        yUpdateMax = 0;
        next();
      });
    });

    queue.next();
  }

  var ret = {
    width: LCDWIDTH,
    height: LCDHEIGHT,
    buffer: pcd8544_buffer,
    setBuffer: function (buf) {
      pcd8544_buffer = buf;
      ret.buffer = buf;
    },
    getPixel: getPixel,
    setPixel: setPixel,
    refresh: refresh,
    refreshDirtySync: refreshDirtySync,
  };

  spi.initialize();
  main();

  return ret;
}

exports.setScreenPixel = setScreenPixel;
