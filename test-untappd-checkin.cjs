// Quick script to fetch and display Untappd checkin structure
const https = require('https');

const BREWERY_ID = '68768'; // Lister's Brewery
const CLIENT_ID = '3AD547533F5E6EDDE05ECF72E5F1B5881EF3965F';
const CLIENT_SECRET = '57AAC5C71B0435CD5A81F06E5B5D7AF20F333A99';

const url = `https://api.untappd.com/v4/brewery/checkins/${BREWERY_ID}?client_id=${CLIENT_ID}&client_secret=${CLIENT_SECRET}&limit=5`;

https.get(url, (res) => {
  let data = '';
  res.on('data', (chunk) => data += chunk);
  res.on('end', () => {
    const json = JSON.parse(data);
    const checkins = json.response?.checkins?.items || [];

    if (checkins.length > 0) {
      console.log('\n🍺 FIRST CHECKIN STRUCTURE:\n');
      console.log(JSON.stringify(checkins[0], null, 2));
    } else {
      console.log('No checkins found');
    }
  });
}).on('error', (e) => {
  console.error('Error:', e.message);
});
