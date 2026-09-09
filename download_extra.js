const fs = require('fs');
const path = require('path');
const https = require('https');

const assets = [
  ['https://diuwin.art/asset/lotterycategory/lotterycategory_202504211530201tr5.png', 'diuwin_lobby_demo/asset/wingo.png'],
  ['https://diuwin.art/asset/lotterycategory/lotterycategory_202504211530308pte.png', 'diuwin_lobby_demo/asset/k3.png'],
  ['https://diuwin.art/asset/lotterycategory/lotterycategory_20250421153042a2cb.png', 'diuwin_lobby_demo/asset/5d.png'],
  ['https://diuwin.art/asset/ass/turn_icon-0c8307cf.png', 'diuwin_lobby_demo/asset/turn_icon.png'],
  ['https://diuwin.art/asset/ass/vip_icon-0ce6fe20.png', 'diuwin_lobby_demo/asset/vip_icon.png']
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
  console.log('Finished extra assets.');
}

run();
