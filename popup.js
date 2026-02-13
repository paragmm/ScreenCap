document.getElementById('captureVisible').addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'captureVisible' }, (response) => {
        window.close();
    });
});

document.getElementById('captureFullPage').addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    chrome.tabs.sendMessage(tab.id, { action: 'startFullPageCapture' });
    window.close();
});

document.getElementById('captureSelective').addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    chrome.tabs.sendMessage(tab.id, { action: 'startSelectiveCapture' });
    window.close();
});
