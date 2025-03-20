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

// Initialize the AFK timer
function initAFKTimer() {
    updateTimer();
    afkTimer = setInterval(updateTimer, 1000);
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
        document.getElementById('progress-ring-circle').style.strokeDashoffset = 
            (251.2 * (100 - progress)) / 100;
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
            document.getElementById('total-credits').textContent = totalCredits;
            timeRemaining = 300;
            showNotification('Success', `Earned ${data.credits} credits!`);
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
        const response = await fetch('/api/earn/daily', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        
        const data = await response.json();
        
        if (data.success) {
            totalCredits += data.credits;
            document.getElementById('total-credits').textContent = totalCredits;
            document.getElementById('daily-btn').disabled = true;
            showNotification('Success', `Claimed daily reward of ${data.credits} credits!`);
        } else {
            showNotification('Error', data.error);
            if (data.timeRemaining) {
                const hours = Math.ceil(data.timeRemaining / 3600000);
                showNotification('Info', `Daily reward available in ${hours} hours`);
            }
        }
    } catch (error) {
        console.error('Error claiming daily reward:', error);
        showNotification('Error', 'Failed to claim daily reward');
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
    } catch (error) {
        console.error('Error updating leaderboard:', error);
    }
}

// Show notification
function showNotification(title, message) {
    const notification = document.createElement('div');
    notification.className = 'fixed bottom-4 right-4 bg-gray-800 text-white p-4 rounded-lg shadow-lg z-50';
    notification.innerHTML = `
        <h4 class="font-bold">${title}</h4>
        <p>${message}</p>
    `;
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 3000);
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

// Initialize on page load
window.addEventListener('load', () => {
    initAFKTimer();
    updateLeaderboard();
    setInterval(updateLeaderboard, 60000); // Update leaderboard every minute
}); 