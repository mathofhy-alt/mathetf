
import fetch from 'node-fetch';

async function testRender() {
    const scripts = [
        "LEFT ( f circ g RIGHT ) LEFT ( 3 RIGHT )",
        "LEFT ( f circ g RIGHT ) LEFT ( x RIGHT ) = LEFT ( g circ f RIGHT ) LEFT ( x RIGHT )"
    ];

    for (const script of scripts) {
        console.log(`Testing: ${script}`);
        try {
            const resp = await fetch('http://localhost:5000/render-math', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ script })
            });

            if (resp.ok) {
                const data = await resp.json();
                console.log(`  Success! Image Length: ${data.image?.length}`);
            } else {
                console.log(`  Failed! Status: ${resp.status}`);
            }
        } catch (e) {
            console.error(`  Error: ${e.message}`);
        }
    }
}

testRender();
