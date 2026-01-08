// Check if beer details endpoint has serving style info
const https = require('https');

const BEER_ID = '5151355'; // Happy Hound from Lister's
const CLIENT_ID = '3AD547533F5E6EDDE05ECF72E5F1B5881EF3965F';
const CLIENT_SECRET = '57AAC5C71B0435CD5A81F06E5B5D7AF20F333A99';

const url = `https://api.untappd.com/v4/beer/info/${BEER_ID}?client_id=${CLIENT_ID}&client_secret=${CLIENT_SECRET}`;

https.get(url, (res) => {
  let data = '';
  res.on('data', (chunk) => data += chunk);
  res.on('end', () => {
    const json = JSON.parse(data);
    console.log('\n🍺 BEER DETAIL RESPONSE:\n');
    console.log(JSON.stringify(json.response?.beer, null, 2));
  });
}).on('error', (e) => {
  console.error('Error:', e.message);
});
