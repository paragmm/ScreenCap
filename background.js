chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'captureVisible') {
        chrome.tabs.captureVisibleTab(null, { format: 'png' }, (dataUrl) => {
            if (request.crop) {
                // Pass crop data to editor
                chrome.storage.local.set({
                    'capturedImage': dataUrl,
                    'cropData': request.crop
                }, () => {
                    chrome.tabs.create({ url: chrome.runtime.getURL('editor.html') });
                });
            } else {
                openEditor(dataUrl);
            }
            sendResponse({ status: 'success' });
        });
        return true;
    }

    if (request.action === 'openEditorWithData') {
        openEditor(request.dataUrl);
        sendResponse({ status: 'success' });
    }
});

function openEditor(dataUrl) {
    chrome.storage.local.remove('cropData', () => {
        chrome.storage.local.set({ 'capturedImage': dataUrl }, () => {
            chrome.tabs.create({ url: chrome.runtime.getURL('editor.html') });
        });
    });
}
