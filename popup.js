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
