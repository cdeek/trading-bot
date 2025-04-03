const socket = io();

// Auto Trade Toggle
document.getElementById('toggleAutoTrade').addEventListener('click', async () => {
    try {
        const res = await fetch('/toggle-autotrade');
        if (!res.ok) throw new Error('Network response was not ok');
        const data = await res.json();
        document.getElementById('autoTradeStatus').textContent = data.autoTrade ? 'ON ✅' : 'OFF ❌';
        document.getElementById('toggleAutoTrade').textContent = data.autoTrade ? 'Turn OFF' : 'Turn ON';
    } catch (error) {
        console.error('Error toggling auto trade:', error);
    }
});

// Threshold Form Submission
document.getElementById('thresholdForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
        const formData = new FormData(e.target);
        const thresholds = {};
        formData.forEach((value, key) => {
            thresholds[key] = Number(value);
        });

        const res = await fetch('/thresholds', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(thresholds)
        });

        if (!res.ok) throw new Error('Network response was not ok');
        const updatedThresholds = await res.json();
        console.log('Thresholds updated:', updatedThresholds);
    } catch (error) {
        console.error('Error updating thresholds:', error);
    }
});

// Handle notifications
socket.on('notification', (message) => {
    const notifications = document.getElementById('notifications');
    if (Array.isArray(message.message)) {
        message.message.forEach(m => {
            const newMessage = document.createElement('ul');
            newMessage.innerHTML += `<li>${m}</i>`; // Use innerHTML to render HTML
            notifications.appendChild(newMessage);
        });
    } else {
        const newMessage = document.createElement('p');
        newMessage.textContent += message.message;
        notifications.appendChild(newMessage);
    }
});

// Update Market Analysis
socket.on('analysisUpdate', (analysis) => {
    document.getElementById('marketAnalysis').innerHTML = `
        <p><strong>Last Update:</strong> ${analysis.timestamp}</p>
        <p><strong>Tokens Fetched:</strong> ${analysis.totalTokensFetched}</p>
        <p><strong>Verified Tokens:</strong> ${analysis.verifiedCount}</p>
    `;
});
