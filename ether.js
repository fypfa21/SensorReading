const { ethers } = require('ethers');
const newWallet = ethers.Wallet.createRandom();
console.log('New Wallet Private Key:', newWallet.privateKey);
console.log('Loaded Environment Variables:', process.env);
