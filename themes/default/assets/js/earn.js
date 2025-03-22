// Initialize PropellerAds
(function(d, z, s) {
    s.src = '//cdn.propellerads.com/sdk.js';
    s.onerror = function() { 
        console.error('Failed to load PropellerAds SDK');
    };
    d.getElementsByTagName('head')[0].appendChild(s);
})(document, window, document.createElement('script'));

let afkTimer = null;
let timeRemaining = 300; // 5 minutes in seconds
let totalCredits = 0;
let sessionActive = true;
let userBalance = 0;

// Initialize the AFK timer
function initAFKTimer() {
    // Get initial balance
    fetchUserBalance();
    
    updateTimer();
    afkTimer = setInterval(updateTimer, 1000);
}

// Fetch user's current balance
async function fetchUserBalance() {
    try {
        console.log('Fetching user balance...');
        const response = await fetch('/api/earn/balance');
        
        if (!response.ok) {
            console.error('Failed to fetch balance:', response.status, response.statusText);
            return;
        }
        
        const data = await response.json();
        
        if (data.success) {
            console.log('Balance fetched successfully:', data.balance);
            userBalance = data.balance;
            updateBalanceDisplay();
        } else {
            console.error('Balance fetch returned error:', data.error);
        }
    } catch (error) {
        console.error('Error fetching user balance:', error);
    }
}

// Fetch user's referral count
async function fetchReferrals() {
    try {
        const response = await fetch('/api/earn/referrals');
        
        if (!response.ok) {
            console.error('Failed to fetch referrals:', response.status, response.statusText);
            return;
        }
        
        const data = await response.json();
        
        if (data.success) {
            const totalReferralsElement = document.getElementById('total-referrals');
            if (totalReferralsElement) {
                totalReferralsElement.textContent = data.referrals;
            }
        } else {
            console.error('Referrals fetch returned error:', data.error);
        }
    } catch (error) {
        console.error('Error fetching referrals:', error);
    }
}

// Update the balance display
function updateBalanceDisplay() {
    console.log('Updating balance display to:', userBalance);
    
    // Update balance displays on the earn page
    const balanceElements = document.querySelectorAll('.user-balance');
    balanceElements.forEach(element => {
        element.textContent = userBalance;
        console.log('Updated element:', element);
    });
    
    // Also update any balance display in the navbar if it exists
    const navBalanceElements = document.querySelectorAll('.nav-balance, .sidebar-balance');
    navBalanceElements.forEach(element => {
        element.textContent = userBalance;
    });
    
    // If we're on a store page, update any store balance elements
    const storeBalanceElements = document.querySelectorAll('.store-balance');
    storeBalanceElements.forEach(element => {
        element.textContent = userBalance;
    });
    
    // Update the header balance display that shows "Your Credits: X"
    const headerBalance = document.querySelector('.glass-card .text-primary-400');
    if (headerBalance) {
        headerBalance.textContent = userBalance;
        console.log('Updated header balance element');
    }
    
    // Log balance update to console for debugging
    console.log(`Updated balance display: ${userBalance} credits`);
}

// Update the timer display
function updateTimer() {
    if (!sessionActive) return;
    
    if (timeRemaining > 0) {
        timeRemaining--;
        const minutes = Math.floor(timeRemaining / 60);
        const seconds = timeRemaining % 60;
        document.getElementById('timer').textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
        
        // Update progress ring
        const progress = ((300 - timeRemaining) / 300) * 100;
        const progressRing = document.getElementById('progress-ring-circle');
        if (progressRing) {
            progressRing.style.strokeDashoffset = (251.2 * (100 - progress)) / 100;
        }
    } else {
        claimAFKReward();
    }
}

// Claim AFK reward
async function claimAFKReward() {
    try {
        const response = await fetch('/api/earn/afk', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        
        const data = await response.json();
        
        if (data.success) {
            totalCredits += data.credits;
            
            // Update balance in memory and UI
            userBalance = data.balance;
            updateBalanceDisplay();
            
            // Update total credits display
            const totalCreditsElement = document.getElementById('total-credits');
            if (totalCreditsElement) {
                totalCreditsElement.textContent = totalCredits;
            }
            
            // Reset timer
            timeRemaining = 300;
            
            // Refresh balance from server to ensure consistency
            setTimeout(() => {
                fetchUserBalance();
            }, 1000);
            
            // Show success notification
            showNotification('Success', `Earned ${data.credits} credits! Your new balance is ${data.balance} credits.`);
        } else {
            showNotification('Error', data.error);
            if (data.timeRemaining) {
                timeRemaining = Math.ceil(data.timeRemaining / 1000);
            }
        }
    } catch (error) {
        console.error('Error claiming AFK reward:', error);
        showNotification('Error', 'Failed to claim reward');
    }
}

// Claim daily reward
async function claimDailyReward() {
    try {
        const timestamp = new Date().getTime();
        console.log(`[${timestamp}] Attempting to claim daily reward...`);
        
        document.getElementById('daily-btn').disabled = true;
        document.getElementById('daily-btn').textContent = 'Claiming...';
        
        // Add timestamp to avoid caching
        const response = await fetch(`/daily?t=${timestamp}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Requested-With': 'XMLHttpRequest'
            },
            body: JSON.stringify({ timestamp }),
            credentials: 'same-origin'
        });
        
        console.log(`Response status: ${response.status}`);
        const responseData = await response.text();
        console.log(`Response data: ${responseData}`);
        
        try {
            const data = JSON.parse(responseData);
            console.log('Parsed response:', data);
            
            if (data.success) {
                console.log(`Claimed ${data.credits} credits. New balance: ${data.balance}`);
                
                // Update all balance displays
                updateAllBalanceDisplays(data.balance);
                
                // Disable the button and update text
                document.getElementById('daily-btn').disabled = true;
                document.getElementById('daily-btn').textContent = 'Claimed!';
                document.getElementById('daily-btn').classList.add('claimed');
                
                // Show success notification
                showNotification(data.message || `You earned ${data.credits} coins!`, 'success');
                
                // Refresh the page after a delay
                setTimeout(() => {
                    window.location.reload();
                }, 3000);
            } else {
                console.error('Error claiming reward:', data.error);
                document.getElementById('daily-btn').disabled = false;
                document.getElementById('daily-btn').textContent = 'Claim Reward';
                
                // Show error notification
                if (data.timeRemaining) {
                    const hours = Math.ceil(data.timeRemaining / 3600000);
                    showNotification(`You can claim again in ${hours} hours.`, 'warning');
                } else {
                    showNotification(data.error || 'Failed to claim reward', 'error');
                }
            }
        } catch (jsonError) {
            console.error('JSON parse error:', jsonError, responseData);
            document.getElementById('daily-btn').disabled = false;
            document.getElementById('daily-btn').textContent = 'Claim Reward';
            showNotification('Server error. Please try again.', 'error');
        }
    } catch (error) {
        console.error('Claim error:', error);
        document.getElementById('daily-btn').disabled = false;
        document.getElementById('daily-btn').textContent = 'Claim Reward';
        showNotification('Network error. Please try again.', 'error');
    }
}

// Copy referral link
function copyReferralLink() {
    const referralLink = document.getElementById('referral-link').value;
    navigator.clipboard.writeText(referralLink)
        .then(() => showNotification('Success', 'Referral link copied!'))
        .catch(() => showNotification('Error', 'Failed to copy referral link'));
}

// Update leaderboard
async function updateLeaderboard() {
    try {
        const response = await fetch('/api/earn/leaderboard');
        const data = await response.json();
        
        if (data.success) {
            const leaderboardBody = document.getElementById('leaderboard-body');
            if (leaderboardBody) {
                leaderboardBody.innerHTML = '';
                
                data.users.forEach((user, index) => {
                    const row = document.createElement('tr');
                    row.innerHTML = `
                        <td class="px-4 py-2">${index + 1}</td>
                        <td class="px-4 py-2">${user.username}</td>
                        <td class="px-4 py-2">${user.timeActive}</td>
                        <td class="px-4 py-2">${user.credits}</td>
                    `;
                    leaderboardBody.appendChild(row);
                });
            }
        }
    } catch (error) {
        console.error('Error updating leaderboard:', error);
    }
}

// Function to show a notification
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    
    // Add notification to the page
    document.body.appendChild(notification);
    
    // Show notification with animation
    setTimeout(() => {
        notification.classList.add('show');
    }, 10);
    
    // Remove notification after 5 seconds
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => {
            notification.remove();
        }, 500);
    }, 5000);
}

// Handle visibility change
document.addEventListener('visibilitychange', () => {
    sessionActive = !document.hidden;
    if (document.hidden) {
        showNotification('Warning', 'AFK earnings paused - tab not active');
    } else {
        showNotification('Info', 'AFK earnings resumed');
    }
});

// Check if daily reward is available
async function checkDailyRewardStatus() {
    try {
        const response = await fetch('/api/earn/daily/status');
        const data = await response.json();
        
        const dailyBtn = document.getElementById('daily-btn');
        if (!dailyBtn) return;
        
        if (data.available) {
            dailyBtn.disabled = false;
            dailyBtn.classList.remove('bg-gray-500');
            dailyBtn.classList.add('bg-green-600', 'hover:bg-green-700');
        } else {
            dailyBtn.disabled = true;
            dailyBtn.classList.remove('bg-green-600', 'hover:bg-green-700');
            dailyBtn.classList.add('bg-gray-500');
            
            // Show time remaining if available
            if (data.timeRemaining) {
                const hours = Math.ceil(data.timeRemaining / 3600000);
                dailyBtn.textContent = `Available in ${hours}h`;
            } else {
                dailyBtn.textContent = 'Already Claimed';
            }
        }
    } catch (error) {
        console.error('Error checking daily reward status:', error);
    }
}

// Test function for claiming daily reward (for debugging)
async function testDailyReward() {
    const debugOutput = document.getElementById('debug-output');
    debugOutput.innerHTML = '';
    debugOutput.classList.remove('hidden');
    
    function log(message) {
        console.log(message);
        debugOutput.innerHTML += `<div>${message}</div>`;
    }
    
    try {
        log('Starting test claim...');
        log(`Current time: ${new Date().toISOString()}`);
        
        // Direct fetch call
        log('Making direct fetch call to /daily...');
        const response = await fetch('/daily', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'X-Requested-With': 'XMLHttpRequest'
            },
            credentials: 'same-origin'
        });
        
        log(`Response status: ${response.status} (${response.statusText})`);
        
        // Get response headers
        const headers = {};
        response.headers.forEach((value, key) => {
            headers[key] = value;
            log(`Response header: ${key}: ${value}`);
        });
        
        // Get response text
        const responseText = await response.text();
        log(`Response body: ${responseText.substring(0, 100)}${responseText.length > 100 ? '...' : ''}`);
        
        try {
            // Try parsing JSON
            const data = JSON.parse(responseText);
            log(`Parsed JSON: ${JSON.stringify(data)}`);
            
            if (data.success) {
                log(`Success! Credits: ${data.credits}, Balance: ${data.balance}`);
                // Update all balance displays on the page
                updateAllBalanceDisplays(data.balance);
                
                // Disable the claim button if available
                const dailyBtn = document.getElementById('daily-btn');
                if (dailyBtn) {
                    dailyBtn.disabled = true;
                    dailyBtn.textContent = 'Claimed!';
                    dailyBtn.classList.add('claimed');
                }
                
                // Show a success message
                log(`${data.message || 'Reward claimed successfully!'}`);
            } else {
                log(`Error: ${data.error}`);
                if (data.timeRemaining) {
                    const hours = Math.ceil(data.timeRemaining / 3600000);
                    log(`Time remaining: ${hours} hours`);
                }
            }
        } catch (jsonError) {
            log(`Error parsing JSON: ${jsonError.message}`);
        }
    } catch (error) {
        log(`Error: ${error.message}`);
        console.error('Test claim error:', error);
    }
}

// Function to update all balance displays on the page
function updateAllBalanceDisplays(balance) {
    // Find all elements displaying the balance and update them
    const balanceElements = document.querySelectorAll('.balance-display, .user-balance, .text-primary-400');
    balanceElements.forEach(element => {
        element.textContent = balance;
    });
    
    console.log(`Updated ${balanceElements.length} balance display elements to ${balance}`);
}

// Initialize on page load
window.addEventListener('load', () => {
    initAFKTimer();
    updateLeaderboard();
    setInterval(updateLeaderboard, 60000); // Update leaderboard every minute
    
    // Add event listener for daily reward button
    const dailyBtn = document.getElementById('daily-btn');
    if (dailyBtn) {
        dailyBtn.addEventListener('click', claimDailyReward);
    }
    
    // Check daily reward status on page load
    checkDailyRewardStatus();
    
    // Fetch referrals
    fetchReferrals();
});