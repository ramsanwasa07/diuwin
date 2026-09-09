const fs = require('fs');
const path = require('path');
const https = require('https');

const assets = [
  ['https://diuwin.art/images/logo.png', 'diuwin_lobby_demo/images/logo.png'],
  ['https://diuwin.art/banner/b1.png', 'diuwin_lobby_demo/banner/b1.png'],
  ['https://diuwin.art/banner/b2.png', 'diuwin_lobby_demo/banner/b2.png'],
  ['https://diuwin.art/banner/b3.png', 'diuwin_lobby_demo/banner/b3.png'],
  ['https://diuwin.art/banner/b4.png', 'diuwin_lobby_demo/banner/b4.png'],
  ['https://diuwin.art/images/audio.webp', 'diuwin_lobby_demo/images/audio.webp'],
  ['https://diuwin.art/images/hot.webp', 'diuwin_lobby_demo/images/hot.webp'],
  ['https://diuwin.art/images/casino.webp', 'diuwin_lobby_demo/images/casino.webp'],
  ['https://diuwin.art/images/CP.webp', 'diuwin_lobby_demo/images/CP.webp'],
  ['https://diuwin.art/images/DC.webp', 'diuwin_lobby_demo/images/DC.webp'],
  ['https://diuwin.art/images/fishing.webp', 'diuwin_lobby_demo/images/fishing.webp'],
  ['https://diuwin.art/images/aviator_tile.jpg', 'diuwin_lobby_demo/images/aviator_tile.jpg'],
  ['https://diuwin.art/images/mines_tile.jpg', 'diuwin_lobby_demo/images/mines_tile.jpg'],
  ['https://diuwin.art/images/chicken_tile.png', 'diuwin_lobby_demo/images/chicken_tile.png'],
  ['https://diuwin.art/images/customer-5ef38c22.png', 'diuwin_lobby_demo/images/customer-5ef38c22.png']
];

function download(url, dest) {
  return new Promise((resolve) => {
    const fullPath = path.join(__dirname, dest);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    const file = fs.createWriteStream(fullPath);
    https.get(url, (res) => {
      if (res.statusCode === 200) {
        res.pipe(file);
        file.on('finish', () => {
          file.close();
          console.log(`Saved ${dest}`);
          resolve(true);
        });
      } else {
        file.close();
        fs.unlink(fullPath, () => {});
        console.log(`Failed ${url}: ${res.statusCode}`);
        resolve(false);
      }
    }).on('error', (err) => {
      file.close();
      fs.unlink(fullPath, () => {});
      console.log(`Error ${url}:`, err.message);
      resolve(false);
    });
  });
}

async function run() {
  for (const [url, dest] of assets) {
    await download(url, dest);
  }
  console.log('Finished downloading assets.');
}

run();
