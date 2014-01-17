var tessel = require('tessel');
var fs = require('fs');

var port = tessel.port('gpio');
var rst = port.gpio(1).output().low();
var cs = port.gpio(2).output().low();
var dc = port.gpio(3).output().low();
var blacklight = port.gpio(4).output().high();


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

exports.connect = function (next)
{
  var pcd8544_buffer = new Buffer(LCDWIDTH * LCDHEIGHT / 8);
  pcd8544_buffer.fill(0);

  var yUpdateMin = 0;
    yUpdateMax = 0;
    xUpdateMin = 0;
    xUpdateMax = 0;

  var spi = new port.SPI({
    clockSpeed: 4 * 1000000,
    dataMode: tessel.SPIDataMode.Mode0
  });

  function command (b) {
    dc.low();
    cs.low();
    spi.transferSync(([b]))
    cs.high();
  }

  function main () {
    rst.low();
    setTimeout(mainReset, 0);
  }

  function mainReset () {
    rst.high();

    // get into the EXTENDED mode!
    command(PCD8544_FUNCTIONSET | PCD8544_EXTENDEDINSTRUCTION );

    // LCD bias select (4 is optimal?)
    command(PCD8544_SETBIAS | 0x4);

    // set VOP
    // if (contrast > 0x7f)
    //   contrast = 0x7f;

    var contrast = 0x7f;
    command( PCD8544_SETVOP | contrast); // Experimentally determined


    // normal mode
    command(PCD8544_FUNCTIONSET);

    // Set display to Normal
    command(PCD8544_DISPLAYCONTROL | PCD8544_DISPLAYNORMAL);

    // initial display line
    // set page address
    // set column address
    // write display data

    // set up a bounding box for screen updates

    updateBoundingBox(0, 0, LCDWIDTH-1, LCDHEIGHT-1);

    // Push out pcd8544_buffer to the Display (will show the AFI logo)
    next && next(null, ret);
  }

  // the most basic function, set a single pixel
  function setPixel (x, y, color) {
    x = x | 0;
    y = y | 0;
    if ((x < 0) || (x >= LCDWIDTH) || (y < 0) || (y >= LCDHEIGHT))
      return;

    // Get the byte we're writing to.
    // Screen is structured as six rows (pages).
    var col = x + (((y/8)*LCDWIDTH) | 0);
    if (color) 
      pcd8544_buffer[col] = pcd8544_buffer[col] | (1 << (y%8)); 
    else
      pcd8544_buffer[col] = pcd8544_buffer[col] ^ (1 << (y%8));

    updateBoundingBox(x,y,x,y);
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

  function refreshSync (buffer) {
    buffer = buffer || pcd8544_buffer;

    cs.low();
    dc.low();
    spi.send([PCD8544_SETYADDR | 0, PCD8544_SETXADDR | 0])

    dc.high();
    spi.send(buffer);
    cs.high();

    command(PCD8544_SETYADDR);  // no idea why this is necessary but it is to finish the last byte?
  }

  function refreshDirtySync (buffer) {
    buffer = buffer || pcd8544_buffer;
    
    cs.low();
    for (var p = 0; p < 6; p++) {
      // check if this page is part of update
      if (yUpdateMin >= ((p+1)*8)) {
        continue;   // nope, skip it!
      }
      if (yUpdateMax < p*8) {
        break;
      }

      dc.low();
      spi.send([PCD8544_SETYADDR | p, PCD8544_SETXADDR | xUpdateMin])

      dc.high();
      spi.send(pcd8544_buffer.slice((LCDWIDTH*p)+xUpdateMin, (LCDWIDTH*p)+xUpdateMax))
    }
    cs.high();

    command(PCD8544_SETYADDR);  // no idea why this is necessary but it is to finish the last byte?

    xUpdateMin = LCDWIDTH - 1;
    xUpdateMax = 0;
    yUpdateMin = LCDHEIGHT-1;
    yUpdateMax = 0;
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
    refreshSync: refreshSync,
    refreshDirtySync: refreshDirtySync,
  };

  spi.initialize();
  main();

  return ret;
}