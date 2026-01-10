const axios = require('axios');
const fs = require('fs');
const path = require('path');

const apiKey = process.env.EXCHANGE_API_KEY;

if (!apiKey) {
    console.error('EXCHANGE_API_KEY is not set');
    process.exit(1);
}

const ratesDir = path.join(__dirname, 'static', 'rates');

async function fetchRates() {
    if (!fs.existsSync(ratesDir)) {
        fs.mkdirSync(ratesDir, { recursive: true });
    }

    const currencies = ['USD', 'KZT'];

    for (const currency of currencies) {
        const url = `https://v6.exchangerate-api.com/v6/${apiKey}/latest/${currency}`;

        try {
            console.log(`Fetching rates for ${currency}...`);
            const response = await axios.get(url);

            const filePath = path.join(ratesDir, `${currency.toLowerCase()}.json`);
            fs.writeFileSync(filePath, JSON.stringify(response.data, null, 2));

            console.log(`Saved ${currency} rates to ${filePath}`);
        } catch (error) {
            console.error(`Failed to fetch ${currency} rates:`, error.message);
            process.exit(1);
        }
    }

    console.log('All rates updated successfully');
}

fetchRates();
