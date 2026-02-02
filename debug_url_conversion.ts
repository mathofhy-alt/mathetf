
import fetch from 'node-fetch';

async function testUrlConversion() {
    // Real URL from Supabase verification
    const testUrl = "https://eupclfzfouxzzmipjchz.supabase.co/storage/v1/object/public/question_images/MANUAL_Q_1769792045355.png";

    console.log(`Testing URL: ${testUrl}`);

    try {
        const res = await fetch(testUrl);
        console.log(`Fetch Status: ${res.status} ${res.statusText}`);

        if (res.ok) {
            const buffer = await res.arrayBuffer();
            console.log(`Buffer Size: ${buffer.byteLength}`);

            const b64 = Buffer.from(buffer).toString('base64');
            console.log(`Base64 Start: ${b64.substring(0, 50)}...`);

            // Check Content-Type
            const contentType = res.headers.get('content-type');
            console.log(`Content-Type: ${contentType}`);

            let format = 'unknown';
            if (contentType?.includes('png')) format = 'png';
            else if (contentType?.includes('jpeg') || contentType?.includes('jpg')) format = 'jpg';

            console.log(`Determined Format: ${format}`);
        }
    } catch (err) {
        console.error("Fetch Error:", err);
    }
}

testUrlConversion();
