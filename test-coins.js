// Test script for user_coins.js

const userCoins = require('./api/user_coins.js');
const fs = require('fs');

// Create a logging function
function log(message) {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${message}\n`;
    console.log(logMessage);
    
    // Append to log file
    fs.appendFileSync('./logs/test-coins.log', logMessage, { flag: 'a+' });
}

// Test user ID
const TEST_USER_ID = 1; // Change this to a real user ID if needed

async function runTests() {
    try {
        log('Starting user_coins module tests');
        
        // Test 1: Get current coins
        log('Test 1: Getting current coins');
        let balance = await userCoins.getUserCoins(TEST_USER_ID);
        log(`Current balance for user ${TEST_USER_ID}: ${balance}`);
        
        // Test 2: Add coins
        const amountToAdd = 50;
        log(`Test 2: Adding ${amountToAdd} coins`);
        await userCoins.addCoins(TEST_USER_ID, amountToAdd);
        
        // Get updated balance
        let newBalance = await userCoins.getUserCoins(TEST_USER_ID);
        log(`New balance after adding coins: ${newBalance} (Expected: ${balance + amountToAdd})`);
        
        // Test 3: Check if user has enough coins
        log('Test 3: Checking if user has enough coins');
        const testAmount1 = 10;
        const testAmount2 = newBalance + 100;
        
        let hasEnough1 = await userCoins.hasEnoughCoins(TEST_USER_ID, testAmount1);
        log(`Has enough coins for ${testAmount1}? ${hasEnough1} (Expected: true)`);
        
        let hasEnough2 = await userCoins.hasEnoughCoins(TEST_USER_ID, testAmount2);
        log(`Has enough coins for ${testAmount2}? ${hasEnough2} (Expected: false)`);
        
        // Test 4: Remove coins
        const amountToRemove = 20;
        log(`Test 4: Removing ${amountToRemove} coins`);
        await userCoins.removeCoins(TEST_USER_ID, amountToRemove);
        
        // Get final balance
        let finalBalance = await userCoins.getUserCoins(TEST_USER_ID);
        log(`Final balance after removing coins: ${finalBalance} (Expected: ${newBalance - amountToRemove})`);
        
        log('All tests completed!');
    } catch (error) {
        log(`Error during tests: ${error.message}`);
        console.error(error);
    }
}

// Run the tests
runTests().then(() => {
    log('Test script finished');
}).catch(err => {
    log(`Fatal error: ${err.message}`);
    console.error(err);
}); 