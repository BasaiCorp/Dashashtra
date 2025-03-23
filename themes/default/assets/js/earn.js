// Initialize PropellerAds
(function(d, z, s) {
    s.src = '//cdn.propellerads.com/sdk.js';
    s.onerror = function() { 
        console.error('Failed to load PropellerAds SDK');
    };
    d.getElementsByTagName('head')[0].appendChild(s);
})(document, window, document.createElement('script'));

// AFK Timer Variables
let timerInterval = null;
let remainingSeconds = 300; // 5 minutes in seconds
let totalCredits = 0;
let isTimerRunning = false;
let totalAFKTime = 0;
let isVisible = true;
let sessionStartTime = Date.now();
let lastUpdateTime = Date.now(); // Track when timer was last updated

// DOM elements that will be accessed multiple times
let timerElement;
let progressRingCircle;
let totalAFKTimeElement;
let totalCreditsElement;
let balanceElement;

// Initialize event listeners when DOM content is loaded
document.addEventListener('DOMContentLoaded', function() {
    console.log('AFK System: DOM fully loaded, initializing...');
    
    // Find all the DOM elements we need
    timerElement = document.getElementById('timer');
    progressRingCircle = document.getElementById('progress-ring-circle');
    totalAFKTimeElement = document.getElementById('total-afk-time');
    totalCreditsElement = document.getElementById('total-credits');
    balanceElement = document.getElementById('afk-balance');
    
    // Verify critical elements exist
    if (!timerElement) {
        console.error('AFK System: Timer element not found!');
        return;
    }
    if (!progressRingCircle) {
        console.error('AFK System: Progress ring element not found!');
        // We can continue without the progress ring
    }
    
    console.log('AFK System: DOM elements found:', {
        timer: !!timerElement,
        ring: !!progressRingCircle,
        totalTime: !!totalAFKTimeElement,
        totalCredits: !!totalCreditsElement,
        balance: !!balanceElement
    });
    
    // Initialize visible content
    if (timerElement) timerElement.textContent = '5:00';
    if (progressRingCircle) {
        const circumference = 2 * Math.PI * 40;
        progressRingCircle.style.strokeDasharray = `${circumference} ${circumference}`;
        progressRingCircle.style.strokeDashoffset = '0';
    }
    
    // Initialize systems
    initAFKStats();
    initPingSystem();
    initNotificationSystem();
    
    // Set up visibility change handlers
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleWindowFocus);
    window.addEventListener('blur', handleWindowBlur);
    
    // Start the timer with a slight delay to ensure everything is loaded
    setTimeout(function() {
        console.log('AFK System: Starting timer...');
        startTimer();
        showNotification('AFK timer started - stay on this page to earn credits', 'info');
    }, 500);
    
    console.log('AFK System: Initialization complete');
});

/**
 * Initialize AFK stats by fetching from server
 */
async function initAFKStats() {
    console.log('AFK System: Initializing AFK stats...');
    
    // Load saved session data if available
    loadSessionData();
    
    // Fetch current stats from server
    fetch('/api/earn/stats')
        .then(response => {
            if (!response.ok) {
                throw new Error(`Server responded with ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            console.log('AFK System: Stats loaded successfully:', data);
            
            if (data && data.data) {
                // Update total time
                if (totalAFKTimeElement && data.data.timeActive) {
                    totalAFKTime = data.data.timeActive;
                    totalAFKTimeElement.textContent = formatTime(totalAFKTime);
                }
                
                // Update total credits
                if (totalCreditsElement && data.data.totalEarned) {
                    totalCredits = parseInt(data.data.totalEarned);
                    totalCreditsElement.textContent = totalCredits;
                }
                
                // Update balance
                if (balanceElement && data.data.currentBalance) {
                    balanceElement.textContent = data.data.currentBalance;
                }
            }
        })
        .catch(error => {
            console.error('AFK System: Error loading stats:', error);
            showNotification('Failed to load AFK stats', 'error');
        });
}

/**
 * Format seconds into a readable time string (HH:MM:SS)
 */
function formatTime(seconds) {
    if (typeof seconds !== 'number' || isNaN(seconds)) {
        return '00:00:00';
    }
    
    seconds = Math.max(0, Math.floor(seconds));
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Format minutes and seconds for timer display
 */
function formatTimerDisplay(seconds) {
    if (typeof seconds !== 'number' || isNaN(seconds)) {
        return '5:00';
    }
    
    seconds = Math.max(0, Math.floor(seconds));
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Start the AFK timer countdown
 */
function startTimer() {
    // Clear any existing timer
    if (timerInterval) {
        console.log('AFK System: Clearing existing timer interval');
        clearInterval(timerInterval);
        timerInterval = null;
    }
    
    // Reset timer state
    remainingSeconds = 300; // 5 minutes
    isTimerRunning = true;
    lastUpdateTime = Date.now(); // Reset timestamp
    
    // Update display initially
    updateTimerDisplay();
    
    console.log('AFK System: Timer starting with interval');
    
    // Set up the timer to update every second
    timerInterval = setInterval(function() {
        // Calculate actual elapsed time since last update
        const now = Date.now();
        const elapsed = (now - lastUpdateTime) / 1000; // Convert to seconds
        lastUpdateTime = now;
        
        // Don't update when tab is not visible
        if (!isVisible) {
            console.log('AFK System: Timer paused - tab not visible');
            return;
        }
        
        // If elapsed time is unexpectedly large (> 2 seconds), 
        // it means the browser throttled our timer
        if (elapsed > 2) {
            console.log(`AFK System: Browser throttled timer - ${elapsed.toFixed(1)}s elapsed`);
            // Decrement by actual elapsed time, but cap at 60 seconds to prevent skipping too much
            remainingSeconds -= Math.min(elapsed, 60);
        } else {
            // Normal update - decrement by 1 second
            remainingSeconds--;
        }
        
        console.log(`AFK System: Timer tick - ${remainingSeconds.toFixed(1)}s remaining`);
        
        // Update the display
        updateTimerDisplay();
        
        // Check if timer has reached zero
        if (remainingSeconds <= 0) {
            console.log('AFK System: Timer complete, claiming reward');
            clearInterval(timerInterval);
            timerInterval = null;
            isTimerRunning = false;
            claimReward();
        }
    }, 1000);
    
    console.log('AFK System: Timer started with interval ID:', timerInterval);
}

/**
 * Update the timer display and progress ring
 */
function updateTimerDisplay() {
    // Update timer text
    if (timerElement) {
        const displayText = formatTimerDisplay(remainingSeconds);
        timerElement.textContent = displayText;
        console.log(`AFK System: Timer display updated to ${displayText}`);
    }
    
    // Update progress ring if it exists
    if (progressRingCircle) {
        const circumference = 2 * Math.PI * 40; // 2πr where r=40
        const progress = remainingSeconds / 300; // 300 seconds = 5 minutes (full timer)
        const offset = circumference * (1 - progress);
        
        progressRingCircle.style.strokeDasharray = `${circumference} ${circumference}`;
        progressRingCircle.style.strokeDashoffset = offset;
    }
}

/**
 * Claim AFK reward when timer completes
 */
async function claimReward() {
    console.log('AFK System: Claiming reward...');
    
    // Show loading state
    if (timerElement) {
        timerElement.textContent = 'Claiming...';
    }
    
    // Make API request to claim the reward
    fetch('/api/earn/claim', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        }
    })
    .then(response => {
        console.log('AFK System: Claim response received:', response.status);
        if (!response.ok) {
            throw new Error(`Server responded with ${response.status}`);
        }
        return response.json();
    })
    .then(data => {
        console.log('AFK System: Reward claimed successfully:', data);
        
        // Update total credits earned
        if (data.amount && totalCreditsElement) {
            totalCredits += parseInt(data.amount);
            totalCreditsElement.textContent = totalCredits;
        }
        
        // Update user balance
        if (data.balance && balanceElement) {
            balanceElement.textContent = data.balance;
        }
        
        // Show success notification
        showNotification(`Earned ${data.amount} credits! Balance: ${data.balance}`, 'success');
        
        // Start the timer again
        startTimer();
    })
    .catch(error => {
        console.error('AFK System: Error claiming reward:', error);
        showNotification('Failed to claim reward. Restarting timer...', 'error');
        
        // Restart timer anyway
        startTimer();
    });
}

/**
 * Handle visibility change (tab becomes visible/hidden)
 */
function handleVisibilityChange() {
    const wasVisible = isVisible;
    isVisible = document.visibilityState === 'visible';
    console.log(`AFK System: Visibility changed - Tab is ${isVisible ? 'visible' : 'hidden'}`);
    
    if (isVisible && !wasVisible) {
        // Tab became visible again - sync timer to compensate for throttling
        const now = Date.now();
        const elapsedSeconds = (now - lastUpdateTime) / 1000;
        
        console.log(`AFK System: Tab visible after ${elapsedSeconds.toFixed(1)}s - syncing timer`);
        
        // Only decrement time if it's been a reasonable amount of time (avoid extreme jumps)
        if (elapsedSeconds > 1 && elapsedSeconds < 300) {
            remainingSeconds -= Math.min(elapsedSeconds, 60); // Cap at 60 seconds to avoid extreme jumps
            // If timer would go below zero, claim reward immediately
            if (remainingSeconds <= 0) {
                clearInterval(timerInterval);
                timerInterval = null;
                isTimerRunning = false;
                remainingSeconds = 0;
                updateTimerDisplay();
                claimReward();
            } else {
                updateTimerDisplay();
            }
        }
        
        // Reset the timestamp
        lastUpdateTime = now;
        
        showNotification('AFK timer resumed', 'info');
    } else if (!isVisible && wasVisible) {
        // Tab is now hidden - save the current timestamp
        lastUpdateTime = Date.now();
        updateTotalAFKTime();
    }
}

/**
 * Handle window focus
 */
function handleWindowFocus() {
    const wasVisible = isVisible;
    isVisible = true;
    console.log('AFK System: Window focused');
    
    if (!wasVisible) {
        // Same logic as when visibility changes to visible
        const now = Date.now();
        const elapsedSeconds = (now - lastUpdateTime) / 1000;
        
        console.log(`AFK System: Window focused after ${elapsedSeconds.toFixed(1)}s - syncing timer`);
        
        // Only decrement time if it's been a reasonable amount of time
        if (elapsedSeconds > 1 && elapsedSeconds < 300) {
            remainingSeconds -= Math.min(elapsedSeconds, 60);
            if (remainingSeconds <= 0) {
                clearInterval(timerInterval);
                timerInterval = null;
                isTimerRunning = false;
                remainingSeconds = 0;
                updateTimerDisplay();
                claimReward();
            } else {
                updateTimerDisplay();
            }
        }
        
        lastUpdateTime = now;
    }
}

/**
 * Handle window blur
 */
function handleWindowBlur() {
    isVisible = false;
    console.log('AFK System: Window blurred');
    lastUpdateTime = Date.now();
    updateTotalAFKTime();
}

/**
 * Update the total AFK time display
 */
function updateTotalAFKTime() {
    if (!totalAFKTimeElement) return;
    
    const now = Date.now();
    const sessionTime = Math.floor((now - sessionStartTime) / 1000);
    
    if (sessionTime > 0) {
        totalAFKTime += sessionTime;
        totalAFKTimeElement.textContent = formatTime(totalAFKTime);
        sessionStartTime = now; // Reset for next update
    }
}

/**
 * Setup notifications
 */
function initNotificationSystem() {
    console.log('AFK System: Initializing notification system...');
    
    if (!document.getElementById('notification-container')) {
        const container = document.createElement('div');
        container.id = 'notification-container';
        container.className = 'fixed top-4 right-4 z-50 flex flex-col items-end space-y-2';
        document.body.appendChild(container);
        console.log('AFK System: Created notification container');
    }
}

/**
 * Show a notification
 * @param {string} message - Message to display
 * @param {string} type - Type of notification (success, error, warning, info)
 */
function showNotification(message, type = 'info') {
    const container = document.getElementById('notification-container');
    if (!container) {
        console.error('AFK System: Notification container not found');
        return;
    }
    
    console.log(`AFK System: Showing notification - ${type}: ${message}`);
    
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification p-3 rounded-lg shadow-lg flex items-center ${
        type === 'success' ? 'bg-green-600' : 
        type === 'error' ? 'bg-red-600' : 
        'bg-blue-600'
    } text-white max-w-xs animate-fade-in`;
    
    // Add icon based on type
    const iconClass = 
        type === 'success' ? 'fa-check-circle' : 
        type === 'error' ? 'fa-exclamation-circle' : 
        'fa-info-circle';
    
    notification.innerHTML = `
        <i class="fas ${iconClass} mr-2"></i>
        <span>${message}</span>
    `;
    
    // Add to container
    container.appendChild(notification);
    
    // Remove after 5 seconds
    setTimeout(() => {
        notification.classList.add('animate-fade-out');
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }, 5000);
}

/**
 * Setup ping system to keep session alive
 */
function initPingSystem() {
    console.log('AFK System: Initializing ping system...');
    
    // Ping server every 30 seconds to keep session alive
    setInterval(() => {
        if (isVisible) {
            pingServer();
        }
    }, 30000);
    
    // Update stats every minute
    setInterval(() => {
        if (isVisible) {
            fetchAFKStats();
        }
    }, 60000);
}

/**
 * Ping server to keep session alive
 */
async function pingServer() {
    console.log('AFK System: Pinging server...');
    
    fetch('/api/earn/ping', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ timestamp: Date.now() })
    })
    .then(response => {
        if (response.ok) {
            console.log('AFK System: Ping successful');
        } else {
            console.error('AFK System: Ping failed:', response.status);
        }
    })
    .catch(error => {
        console.error('AFK System: Ping error:', error);
    });
}

/**
 * Fetch AFK stats from server
 */
async function fetchAFKStats() {
    console.log('AFK System: Fetching updated stats...');
    
    fetch('/api/earn/stats')
        .then(response => {
            if (!response.ok) {
                throw new Error(`Server responded with ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            console.log('AFK System: Stats updated successfully');
            
            if (data && data.data) {
                // Update total time display
                if (totalAFKTimeElement && data.data.timeActive) {
                    totalAFKTime = data.data.timeActive;
                    totalAFKTimeElement.textContent = formatTime(totalAFKTime);
                }
                
                // Update balance display
                if (balanceElement && data.data.currentBalance) {
                    balanceElement.textContent = data.data.currentBalance;
                }
            }
        })
        .catch(error => {
            console.error('AFK System: Error updating stats:', error);
        });
}

/**
 * Save session data before page unload
 */
function saveSessionData() {
    try {
        const sessionData = {
            totalCredits,
            totalAFKTime,
            lastUpdateTime: Date.now()
        };
        
        localStorage.setItem('afkSessionData', JSON.stringify(sessionData));
        console.log('AFK System: Session data saved');
    } catch (error) {
        console.error('AFK System: Error saving session data:', error);
    }
}

/**
 * Load session data on page load
 */
function loadSessionData() {
    try {
        const data = localStorage.getItem('afkSessionData');
        if (!data) {
            console.log('AFK System: No session data found');
            return;
        }
        
        const sessionData = JSON.parse(data);
        const now = Date.now();
        
        // Only use data if it's not too old (less than 1 hour)
        if (sessionData.lastUpdateTime && (now - sessionData.lastUpdateTime) < 3600000) {
            totalCredits = sessionData.totalCredits || 0;
            totalAFKTime = sessionData.totalAFKTime || 0;
            
            console.log('AFK System: Session data loaded:', {
                totalCredits,
                totalAFKTime
            });
        } else {
            console.log('AFK System: Saved data too old, starting fresh');
        }
    } catch (error) {
        console.error('AFK System: Error loading session data:', error);
    }
}

// Handle page unload
window.addEventListener('beforeunload', function() {
    updateTotalAFKTime();
    saveSessionData();
    
    if (timerInterval) {
        clearInterval(timerInterval);
    }
});

// Add required styles for animations
(function addRequiredStyles() {
    if (!document.getElementById('afk-system-styles')) {
        const styleElement = document.createElement('style');
        styleElement.id = 'afk-system-styles';
        styleElement.textContent = `
            @keyframes fadeIn {
                from { opacity: 0; transform: translateY(-10px); }
                to { opacity: 1; transform: translateY(0); }
            }
            
            @keyframes fadeOut {
                from { opacity: 1; transform: translateY(0); }
                to { opacity: 0; transform: translateY(-10px); }
            }
            
            .animate-fade-in {
                animation: fadeIn 0.3s ease-out forwards;
            }
            
            .animate-fade-out {
                animation: fadeOut 0.3s ease-in forwards;
            }
            
            .progress-ring-circle {
                transition: stroke-dashoffset 0.35s;
                transform-origin: center;
                transform: rotate(-90deg);
            }
        `;
        document.head.appendChild(styleElement);
        console.log('AFK System: Added required CSS styles');
    }
})();