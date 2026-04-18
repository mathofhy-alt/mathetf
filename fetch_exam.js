const http = require('http');
const fs = require('fs');

http.get('http://localhost:3000/api/storage/download?id=ab48a27f-92ce-4fbc-b109-2be9ccfe4c71', (res) => {
    let data = '';
    res.on('data', (chunk) => data += chunk);
    res.on('end', () => {
        fs.writeFileSync('임시/downloaded_exam.hml', data);
        console.log('Saved downloaded exam to 임시/downloaded_exam.hml, size:', data.length);
    });
}).on('error', (err) => {
    console.log('Error:', err.message);
});
