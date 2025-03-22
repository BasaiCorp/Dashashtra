/**
 * AFK Initialization Script
 * This file initializes AFK stats data and handles real-time updates
 */

// Will be populated by server-rendered script
let initialAfkStats = {
    timeActive: 0,
    totalEarned: 0,
    lastReward: 0
};

// Update initial stats from server data
function updateAfkStatsFromServer(stats) {
    console.log('Initializing AFK stats from server:', stats);
    initialAfkStats = stats;
    
    // Update displays with initial stats
    document.addEventListener('DOMContentLoaded', function() {
        // Update total AFK time
        const totalTimeElement = document.getElementById('total-afk-time');
        if (totalTimeElement && initialAfkStats.timeActive) {
            totalTimeElement.textContent = formatTime(initialAfkStats.timeActive);
        }
        
        // Update total earned credits
        const totalCreditsElement = document.getElementById('total-credits');
        if (totalCreditsElement && initialAfkStats.totalEarned) {
            totalCreditsElement.textContent = initialAfkStats.totalEarned;
        }
    });
}

// Format time in HH:MM:SS for display
function formatTime(seconds) {
    if (!seconds) return '00:00:00';
    
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// Setup ping to server every 30 seconds to update activity
let pingInterval = null;

// Start ping system
function startPing() {
    console.log('Starting AFK ping system');
    // Clear any existing interval
    if (pingInterval) clearInterval(pingInterval);
    
    // Start new interval
    pingInterval = setInterval(async () => {
        try {
            // Visual indication of ping
            const pingIndicator = document.getElementById('ping-indicator');
            if (pingIndicator) {
                pingIndicator.classList.remove('opacity-0');
                setTimeout(() => {
                    pingIndicator.classList.add('opacity-0');
                }, 500);
            }
            
            // Send ping to server
            const response = await fetch('/api/earn/afk/ping', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            
            if (!response.ok) {
                console.error('Ping failed:', response.status, response.statusText);
            } else {
                console.log('Ping successful');
            }
        } catch (error) {
            console.error('Error sending ping:', error);
        }
    }, 30000); // Every 30 seconds
}

// Update AFK stats from server periodically
async function fetchAfkStats() {
    try {
        console.log('Fetching AFK stats from server');
        const response = await fetch('/api/earn/afk/stats');
        
        if (!response.ok) {
            console.error('Failed to fetch AFK stats:', response.status, response.statusText);
            return;
        }
        
        const data = await response.json();
        console.log('AFK stats response:', data);
        
        if (data.success && data.stats) {
            // Update display with server data
            const totalTimeElement = document.getElementById('total-afk-time');
            if (totalTimeElement && data.stats.timeActive) {
                totalTimeElement.textContent = formatTime(data.stats.timeActive);
                console.log('Updated total time:', totalTimeElement.textContent);
            }
            
            const totalCreditsElement = document.getElementById('total-credits');
            if (totalCreditsElement && data.stats.totalEarned !== undefined) {
                totalCreditsElement.textContent = data.stats.totalEarned;
                console.log('Updated total credits:', totalCreditsElement.textContent);
            }
            
            const totalSessionsElement = document.getElementById('total-sessions');
            if (totalSessionsElement && data.stats.sessionsToday) {
                totalSessionsElement.textContent = data.stats.sessionsToday;
                console.log('Updated sessions count:', totalSessionsElement.textContent);
            }
        }
    } catch (error) {
        console.error('Error fetching AFK stats:', error);
    }
}

// Hide notification function
function hideNotification() {
    const notification = document.getElementById('notification');
    if (notification) {
        notification.classList.add('translate-y-20', 'opacity-0');
    }
}

// Initialize when the DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM loaded, starting AFK systems');
    startPing();
    fetchAfkStats();
    
    // Fetch stats every 2 minutes
    setInterval(fetchAfkStats, 120000);
    
    // Make sure timer is initialized
    const timerElement = document.getElementById('timer');
    if (timerElement) {
        console.log('Timer element found:', timerElement);
        // Force the timer to show 5:00 initially
        timerElement.textContent = '5:00';
        
        // Make sure the progress ring is visible and initialized
        const progressRing = document.getElementById('progress-ring-circle');
        if (progressRing) {
            console.log('Progress ring found, initializing');
            // Set initial state of progress ring (full circle)
            progressRing.style.strokeDashoffset = '251.2';
        } else {
            console.error('Progress ring element not found');
        }
    } else {
        console.error('Timer element not found on page load');
    }
});

// Clean up on page unload
window.addEventListener('beforeunload', () => {
    console.log('Page unloading, clearing ping interval');
    if (pingInterval) clearInterval(pingInterval);
}); 