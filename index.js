require('dotenv').config();
const express = require('express');
const { initializeApp } = require('firebase/app');
const { getDatabase, ref, get } = require('firebase/database');
const { ethers } = require('ethers');

// Firebase Configuration
const firebaseConfig = {
    apiKey: process.env.FIREBASE_API_KEY,
    authDomain: process.env.FIREBASE_AUTH_DOMAIN,
    databaseURL: process.env.FIREBASE_DATABASE_URL,
    projectId: process.env.FIREBASE_PROJECT_ID,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.FIREBASE_APP_ID,
    measurementId: process.env.FIREBASE_MEASUREMENT_ID
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const database = getDatabase(app);

// Ethers and Smart Contract Configuration
const provider = new ethers.JsonRpcProvider(`https://sepolia.infura.io/v3/${process.env.WEB3_INFURA_PROJECT_ID}`);
const privateKey = '0xca9c95d09f05be9212da5a46cd168791d1919ccba4efe60171f1ccb2ccd71f1c';
if (!/^0x[a-fA-F0-9]{64}$/.test(privateKey)) {
    throw new Error('Invalid private key format');
}
const wallet = new ethers.Wallet(privateKey, provider);
const contractAddress = process.env.SMART_CONTRACT_ADDRESS;
const contractABI = JSON.parse(process.env.SMART_CONTRACT_ABI);
const contract = new ethers.Contract(contractAddress, contractABI, wallet);

// Express Setup
const appServer = express();
const port = process.env.PORT || 3000;

appServer.set('view engine', 'ejs');
appServer.use(express.static('public'));

let sensorOutputs = [];
let breachedSensors = [];

// Function to fetch sensor data from Firebase and interact with smart contract
async function performCheck() {
    try {
        const sensorPaths = {
            temperature: 'DHT11/Temperature',
            humidity: 'DHT11/Humidity',
            IR: 'IR/Value',
            LDR: 'LDR/Value',
            MQ2: 'MQ2/Value'
        };

        breachedSensors = [];
        sensorOutputs = [];  // Reset sensor outputs for each run

        for (const [sensorType, path] of Object.entries(sensorPaths)) {
            const sensorDataRef = ref(database, path);
            const snapshot = await get(sensorDataRef);

            if (snapshot.exists()) {
                const sensorData = snapshot.val();
                const records = Object.entries(sensorData).map(([key, value]) => ({
                    id: key,
                    value: Number(value)
                }));

                if (records.length === 0) continue;

                const lastRecord = records[records.length - 1];
                const lastValue = Math.round(lastRecord.value);

                let threshold;
                switch (sensorType) {
                    case 'temperature': threshold = await contract.getTemperatureThreshold(); break;
                    case 'humidity': threshold = await contract.getHumidityThreshold(); break;
                    case 'IR': threshold = await contract.getIRThreshold(); break;
                    case 'LDR': threshold = await contract.getLDRThreshold(); break;
                    case 'MQ2': threshold = await contract.getMQ2Threshold(); break;
                }

                let tx;
                switch (sensorType) {
                    case 'temperature': tx = await contract.checkTemperatureData(lastValue); break;
                    case 'humidity': tx = await contract.checkHumidityData(lastValue); break;
                    case 'IR': tx = await contract.checkIRData(lastValue); break;
                    case 'LDR': tx = await contract.checkLDRData(lastValue); break;
                    case 'MQ2': tx = await contract.checkMQ2Data(lastValue); break;
                }

                await tx.wait();

                let breached;
                switch (sensorType) {
                    case 'temperature': breached = await contract.getTemperatureBreached(); break;
                    case 'humidity': breached = await contract.getHumidityBreached(); break;
                    case 'IR': breached = await contract.getIRBreached(); break;
                    case 'LDR': breached = await contract.getLDRBreached(); break;
                    case 'MQ2': breached = await contract.getMQ2Breached(); break;
                }

                let latestSensorData;
                switch (sensorType) {
                    case 'temperature': latestSensorData = await contract.getLatestTemperatureData(); break;
                    case 'humidity': latestSensorData = await contract.getLatestHumidityData(); break;
                    case 'IR': latestSensorData = await contract.getLatestIRData(); break;
                    case 'LDR': latestSensorData = await contract.getLatestLDRData(); break;
                    case 'MQ2': latestSensorData = await contract.getLatestMQ2Data(); break;
                }

                sensorOutputs.push({
                    sensorType,
                    latestSensorData: latestSensorData.toString(),
                    breached: breached ? 'Breached' : 'Not breached'
                });

                if (breached) {
                    breachedSensors.push(sensorType);
                }
            }
        }

        if (breachedSensors.length > 0) {
            console.log(`The smart contract breaches due to the following sensor parameters: ${breachedSensors.join(', ')}.`);
        } else {
            console.log('The smart contract did not breach for any sensor parameters.');
        }
    } catch (error) {
        console.error('Error fetching sensor data or interacting with contract:', error);
    }
}

// Route to render the data on the web page
appServer.get('/', async (req, res) => {
    await performCheck();
    res.render('index', { sensorOutputs, breachedSensors });
});

// Start the server
appServer.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
