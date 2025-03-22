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
let totalAfkTime = 0; // Track total AFK time in seconds
let lastTimerUpdate = Date.now();
let reconnectAttempts = 0;
let statsUpdateInterval = null;

// Global variables for AFK timer
let timerInterval = null;
let isTimerRunning = false;

/**
 * Initialize the AFK timer with the progress ring
 */
function initAFKTimer() {
    console.log('Initializing AFK timer');
    
    // Make sure we have the timer element
    const timerElement = document.getElementById('timer');
    if (!timerElement) {
        console.error('Timer element not found!');
        return;
    }
    
    // Reset timer state
    timeRemaining = 300; // 5 minutes in seconds
    updateTimerDisplay(timeRemaining);
    
    // Make sure progress ring is found
    const progressRing = document.getElementById('progress-ring-circle');
    if (!progressRing) {
        console.error('Progress ring element not found!');
    } else {
        // Initialize progress ring to full circle (no progress)
        progressRing.style.strokeDashoffset = '0';
    }
    
    // Start the timer if not already running
    if (!isTimerRunning) {
        startAFKTimer();
    }
}

/**
 * Start the AFK timer countdown
 */
function startAFKTimer() {
    console.log('Starting AFK timer');
    
    // Clear any existing interval
    if (timerInterval) {
        clearInterval(timerInterval);
    }
    
    isTimerRunning = true;
    
    // Update timer every second
    timerInterval = setInterval(() => {
        // Decrement time remaining
        timeRemaining--;
        
        // Update the display
        updateTimerDisplay(timeRemaining);
        
        // Check if timer has reached zero
        if (timeRemaining <= 0) {
            console.log('Timer completed!');
            claimAFKReward();
            timeRemaining = 300; // Reset to 5 minutes
        }
    }, 1000);
}

/**
 * Update the timer display and progress ring
 * @param {number} seconds - Seconds remaining
 */
function updateTimerDisplay(seconds) {
    // Get timer element
    const timerElement = document.getElementById('timer');
    if (!timerElement) {
        console.error('Timer element not found when updating!');
        return;
    }
    
    // Calculate minutes and seconds
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    
    // Format as MM:SS
    timerElement.textContent = `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    
    // Update progress ring if it exists
    const progressRing = document.getElementById('progress-ring-circle');
    if (progressRing) {
        // Calculate progress percentage (inverted: 0% = full circle, 100% = empty)
        const progress = 1 - (seconds / 300);
        
        // Convert to stroke-dashoffset (251.2 is the circumference of the circle)
        // 0 = full circle, 251.2 = empty circle
        const offset = progress * 251.2;
        progressRing.style.strokeDashoffset = offset;
    }
}

/**
 * Claim AFK reward when timer completes
 */
async function claimAFKReward() {
    try {
        console.log('Claiming AFK reward');
        
        // Show loading state
        const timerElement = document.getElementById('timer');
        if (timerElement) {
            timerElement.textContent = 'Claiming...';
        }
        
        // Send request to claim reward
        const response = await fetch('/api/earn/afk', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        
        const data = await response.json();
        console.log('Claim response:', data);
        
        if (data.success) {
            // Update balance display
            const balanceElement = document.getElementById('afk-balance');
            if (balanceElement && data.balance !== undefined) {
                balanceElement.textContent = data.balance;
            }
            
            // Show success notification
            showNotification('success', `You earned ${data.credits} credits!`);
            
            // Reset and restart timer
            timeRemaining = 300;
            updateTimerDisplay(timeRemaining);
            
            // Update AFK stats
            fetchAfkStats();
        } else {
            // Show error notification
            let errorMessage = data.error || 'Failed to claim reward';
            showNotification('error', errorMessage);
            
            // If there's a specific time remaining, update the timer
            if (data.timeRemaining) {
                const secondsRemaining = Math.ceil(data.timeRemaining / 1000);
                timeRemaining = secondsRemaining;
                updateTimerDisplay(timeRemaining);
            }
        }
    } catch (error) {
        console.error('Error claiming AFK reward:', error);
        showNotification('error', 'Error claiming reward. Please try again.');
        
        // Reset timer
        timeRemaining = 300;
        updateTimerDisplay(timeRemaining);
    }
}

// Handle tab visibility changes
function handleVisibilityChange() {
    if (document.hidden) {
        sessionActive = false;
        // Use the local notification function if it exists
        if (typeof showLocalNotification === 'function') {
            showLocalNotification('AFK earnings paused - tab not active', 'warning');
        } else if (typeof showNotification === 'function') {
            showNotification('warning', 'AFK earnings paused - tab not active');
        }
    } else {
        sessionActive = true;
        lastTimerUpdate = Date.now(); // Reset timer reference point
        if (typeof showLocalNotification === 'function') {
            showLocalNotification('AFK earnings resumed', 'info');
        } else if (typeof showNotification === 'function') {
            showNotification('info', 'AFK earnings resumed');
        }
    }
}

// Attempt to reconnect websocket if connection fails
function setupWebSocketReconnect() {
    // If the server implements a websocket connection, this will help reconnect
    window.addEventListener('online', () => {
        if (reconnectAttempts < 5) {
            reconnectAttempts++;
            showNotification('Info', 'Network connection restored, reconnecting...');
            fetchUserBalance();
            updateAfkStats();
        }
    });
}

// Update AFK statistics display
function updateAfkStats() {
    const totalTimeElement = document.getElementById('total-afk-time');
    if (totalTimeElement) {
        totalTimeElement.textContent = formatTime(totalAfkTime);
    }
    
    const sessionsElement = document.getElementById('total-sessions');
    if (sessionsElement) {
        // Get session count from localStorage or default to 1
        const sessionCount = parseInt(localStorage.getItem('afkSessionCount') || '1');
        sessionsElement.textContent = sessionCount;
    }
    
    const creditsEarnedElement = document.getElementById('total-credits');
    if (creditsEarnedElement) {
        creditsEarnedElement.textContent = totalCredits;
    }
    
    // Save AFK session data to localStorage for persistence
    saveAfkSessionData();
}

// Save AFK session data to localStorage
function saveAfkSessionData() {
    try {
        localStorage.setItem('afkTotalTime', totalAfkTime.toString());
        localStorage.setItem('afkTotalCredits', totalCredits.toString());
        
        // Increment session count if not already counted
        if (!localStorage.getItem('afkSessionToday')) {
            const today = new Date().toDateString();
            localStorage.setItem('afkSessionToday', today);
            
            const sessionCount = parseInt(localStorage.getItem('afkSessionCount') || '0') + 1;
            localStorage.setItem('afkSessionCount', sessionCount.toString());
        }
    } catch (error) {
        console.error('Error saving AFK session data:', error);
    }
}

// Load AFK session data from localStorage
function loadAfkSessionData() {
    try {
        const savedTotalTime = localStorage.getItem('afkTotalTime');
        if (savedTotalTime) {
            totalAfkTime = parseInt(savedTotalTime);
        }
        
        const savedTotalCredits = localStorage.getItem('afkTotalCredits');
        if (savedTotalCredits) {
            totalCredits = parseInt(savedTotalCredits);
        }
        
        // Check if session is from a different day
        const today = new Date().toDateString();
        const savedDate = localStorage.getItem('afkSessionToday');
        if (savedDate !== today) {
            localStorage.setItem('afkSessionToday', today);
        }
        
        updateAfkStats();
    } catch (error) {
        console.error('Error loading AFK session data:', error);
    }
}

// Format time in HH:MM:SS
function formatTime(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
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
    }
    
    // Update the AFK page balance display if present
    const afkBalanceElement = document.getElementById('afk-balance');
    if (afkBalanceElement) {
        afkBalanceElement.textContent = userBalance;
    }
}

/**
 * Show notification to the user
 * @param {string} type - Type of notification (success, error, warning, info)
 * @param {string} message - Message to display
 */
function showNotification(type, message) {
    console.log(`Showing ${type} notification:`, message);
    
    // If the AFK page's showLocalNotification function exists, use that instead
    if (typeof showLocalNotification === 'function') {
        showLocalNotification(message, type);
        return;
    }
    
    // Get notification elements
    const notification = document.getElementById('notification');
    const notificationText = document.getElementById('notification-text');
    const notificationIcon = document.getElementById('notification-icon');
    
    if (!notification || !notificationText || !notificationIcon) {
        console.error('Notification elements not found!');
        return;
    }
    
    // Set notification text
    notificationText.textContent = message;
    
    // Clear any existing classes
    notificationIcon.className = 'fas';
    notification.className = 'fixed bottom-4 right-4 max-w-md p-4 rounded-lg shadow-lg transform transition-all duration-500 z-50';
    
    // Add appropriate classes based on type
    switch (type) {
        case 'success':
            notification.classList.add('bg-green-800', 'text-white');
            notificationIcon.classList.add('fa-check-circle', 'text-green-400');
            break;
        case 'error':
            notification.classList.add('bg-red-800', 'text-white');
            notificationIcon.classList.add('fa-exclamation-circle', 'text-red-400');
            break;
        case 'warning':
            notification.classList.add('bg-yellow-800', 'text-white');
            notificationIcon.classList.add('fa-exclamation-triangle', 'text-yellow-400');
            break;
        case 'info':
        default:
            notification.classList.add('bg-blue-800', 'text-white');
            notificationIcon.classList.add('fa-info-circle', 'text-blue-400');
            break;
    }
    
    // Show notification
    notification.classList.remove('translate-y-20', 'opacity-0');
    
    // Hide notification after 5 seconds
    setTimeout(() => {
        notification.classList.add('translate-y-20', 'opacity-0');
    }, 5000);
}

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

// Initialize when the DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM loaded, checking for AFK timer');
    
    // Load saved session data if the function exists
    if (typeof loadAfkSessionData === 'function') {
        loadAfkSessionData();
    }
    
    // Set up tab visibility detection
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    // Check daily reward status
    checkDailyRewardStatus();
    
    // Set up event listeners for UI elements
    const dailyBtn = document.getElementById('daily-btn');
    if (dailyBtn) {
        dailyBtn.addEventListener('click', claimDailyReward);
    }
    
    const copyBtn = document.getElementById('copy-btn');
    if (copyBtn) {
        copyBtn.addEventListener('click', copyReferralLink);
    }
    
    // Make dropdown menu togglable
    const dropdownBtn = document.getElementById('dropdownBtn');
    const dropdownMenu = document.getElementById('dropdownMenu');
    if (dropdownBtn && dropdownMenu) {
        dropdownBtn.addEventListener('click', function() {
            dropdownMenu.classList.toggle('hidden');
        });
        
        // Close dropdown when clicking outside
        document.addEventListener('click', function(event) {
            if (!dropdownBtn.contains(event.target) && !dropdownMenu.contains(event.target)) {
                dropdownMenu.classList.add('hidden');
            }
        });
    }
    
    // Mobile menu toggle
    const mobileMenuBtn = document.getElementById('mobileMenuBtn');
    const sidebar = document.getElementById('sidebar');
    const mobileSearch = document.getElementById('mobileSearch');
    if (mobileMenuBtn && sidebar) {
        mobileMenuBtn.addEventListener('click', function() {
            sidebar.classList.toggle('-translate-x-full');
            if (mobileSearch) {
                mobileSearch.classList.add('hidden');
            }
        });
    }
    
    // Toggle sidebar on mobile
    const toggleSidebarBtn = document.getElementById('toggleSidebar');
    if (toggleSidebarBtn && sidebar) {
        toggleSidebarBtn.addEventListener('click', function() {
            sidebar.classList.toggle('-translate-x-full');
        });
    }
    
    // Process page-specific initialization
    if (window.location.pathname === '/earn') {
        fetchReferrals();
        updateLeaderboard();
    }
});

// Clean up when the page is unloaded
window.addEventListener('beforeunload', function() {
    // Save AFK session data
    saveAfkSessionData();
    
    // Clear intervals
    if (timerInterval) clearInterval(timerInterval);
    if (statsUpdateInterval) clearInterval(statsUpdateInterval);
});