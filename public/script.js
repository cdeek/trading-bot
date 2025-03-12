const socket = io();

// Auto Trade Toggle
document.getElementById('toggleAutoTrade').addEventListener('click', async () => {
    const res = await fetch('/toggle-autotrade');
    const data = await res.json();
    document.getElementById('autoTradeStatus').textContent = data.autoTrade ? 'ON ✅' : 'OFF ❌';
    document.getElementById('toggleAutoTrade').textContent = data.autoTrade ? 'Turn OFF' : 'Turn ON';
});

// Threshold Form Submission
document.getElementById('thresholdForm').addEventListener('submit', async (e) => {
    e.preventDefault();
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

    const updatedThresholds = await res.json();
    console.log('Thresholds updated:', updatedThresholds);
});

// Handle notifications
socket.on('notification', (message) => {
    const notifications = document.getElementById('notifications');
    const newMessage = document.createElement('p');
    newMessage.textContent = message.message;
    notifications.appendChild(newMessage);
});

// Update Market Analysis
socket.on('analysisUpdate', (analysis) => {
    document.getElementById('marketAnalysis').innerHTML = `
        <p><strong>Last Update:</strong> ${analysis.timestamp}</p>
        <p><strong>Tokens Fetched:</strong> ${analysis.totalTokensFetched}</p>
        <p><strong>Verified Tokens:</strong> ${analysis.verifiedCount}</p>
    `;
});
