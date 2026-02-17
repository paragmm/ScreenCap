document.getElementById('captureVisible').addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'captureVisible' }, (response) => {
        window.close();
    });
});

const ensureContentScript = async (tabId) => {
    try {
        await chrome.tabs.sendMessage(tabId, { action: 'ping' });
    } catch (e) {
        await chrome.scripting.executeScript({
            target: { tabId: tabId },
            files: ['content.js']
        });
        // Wait a bit for the script to initialize
        await new Promise(r => setTimeout(r, 100));
    }
};

document.getElementById('captureFullPage').addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    await ensureContentScript(tab.id);
    chrome.tabs.sendMessage(tab.id, { action: 'startFullPageCapture' });
    window.close();
});

document.getElementById('captureSelective').addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    await ensureContentScript(tab.id);
    chrome.tabs.sendMessage(tab.id, { action: 'startSelectiveCapture' });
    window.close();
});

document.getElementById('openSnapshots').addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('editor.html?tab=snapshots') });
    window.close();
});

// Load latest snapshot for preview
chrome.storage.local.get(['snapshots'], (result) => {
    if (result.snapshots && result.snapshots.length > 0) {
        const latest = result.snapshots[0];
        const thumb = document.getElementById('latestSnapshotThumb');
        const btn = document.getElementById('openSnapshots');
        if (thumb && btn) {
            thumb.src = latest.thumbnail;
            btn.classList.add('has-data');
        }
    }
});


