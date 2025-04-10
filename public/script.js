const socket = io();

let tab1 = document.getElementById("1");
let tab2 = document.getElementById("2");

function tab(params = 1) {
  if (params !== 1) {
    tab1.style.display = "none";
    tab2.style.display = "block";
  } else {
    tab2.style.display = "none";
    tab1.style.display = "block";
  }
}

const solInput = document.getElementById('tradeAmount');

solInput.addEventListener('change', () => {
  const value = parseFloat(solInput.value);

  if (!isNaN(value)) {
    const lamports = Math.round(value * 1_000_000_000);
    solInput.value = lamports; // Replace input value with lamports
  } else {
    solInput.value = '';
  }
});

if ('serviceWorker' in navigator && 'PushManager' in window) {
  navigator.serviceWorker.register('/sw.js')
  .then(registration => {
    return registration.pushManager.getSubscription()
      .then(subscription => {
        if (subscription) {
          // Subscription already exists, no need to re-subscribe or send again
          console.log('Already subscribed.');
          return subscription;
        }

        // No subscription, so create a new one
        return registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
        });
      });
  })
  .then(subscription => {
    // Send to server only if it’s a *new* subscription
    return fetch('/subscribe', {
      method: 'POST',
      body: JSON.stringify(subscription),
      headers: {
        'Content-Type': 'application/json'
      }
    });
  })
  .catch(err => console.error('Service Worker or Push setup failed:', err));
}

// Helper function to convert VAPID key to Uint8Array
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

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
        alert('updated')
        console.log('Thresholds updated:', updatedThresholds);
    } catch (error) {
        console.error('Error updating thresholds:', error);
        alert('Error updating thresholds');
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
        notifications.focus();
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
