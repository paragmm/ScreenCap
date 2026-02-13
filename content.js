chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'startFullPageCapture') {
        handleFullPageCapture();
    } else if (request.action === 'startSelectiveCapture') {
        startSelectiveSelection();
    }
});

async function handleFullPageCapture() {
    const scrollHeight = document.documentElement.scrollHeight;
    const viewHeight = window.innerHeight;
    const totalSteps = Math.ceil(scrollHeight / viewHeight);
    let capturedChunks = [];

    // Hide scrollbar temporarily
    const originalOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';

    for (let i = 0; i < totalSteps; i++) {
        window.scrollTo(0, i * viewHeight);
        await new Promise(r => setTimeout(r, 500)); // Wait for content/JS to settle

        // Request visible capture from background
        const dataUrl = await new Promise(resolve => {
            chrome.runtime.sendMessage({ action: 'captureVisible' }, (response) => {
                // We don't actually need the response here because background.js handles the editor
                // But for full page, we need to stitch. 
                // Wait, the current background.js just opens the editor. 
                // I need a specialized background listener for stitching.
                resolve();
            });
        });
    }

    document.documentElement.style.overflow = originalOverflow;
}

function startSelectiveSelection() {
    const overlay = document.createElement('div');
    overlay.id = 'screencap-selection-overlay';
    overlay.style.cssText = `
    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
    background: rgba(0,0,0,0.3); z-index: 999999; cursor: crosshair;
  `;

    const selection = document.createElement('div');
    selection.style.cssText = `
    position: absolute; border: 2px solid #6366f1; background: rgba(99, 102, 241, 0.1);
  `;
    overlay.appendChild(selection);

    let startX, startY;
    let isDragging = false;

    const onMouseDown = (e) => {
        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;
        selection.style.left = startX + 'px';
        selection.style.top = startY + 'px';
        selection.style.width = '0px';
        selection.style.height = '0px';
    };

    const onMouseMove = (e) => {
        if (!isDragging) return;
        const currentX = e.clientX;
        const currentY = e.clientY;

        const left = Math.min(startX, currentX);
        const top = Math.min(startY, currentY);
        const width = Math.abs(startX - currentX);
        const height = Math.abs(startY - currentY);

        selection.style.left = left + 'px';
        selection.style.top = top + 'px';
        selection.style.width = width + 'px';
        selection.style.height = height + 'px';
    };

    const onMouseUp = async (e) => {
        if (!isDragging) return;
        isDragging = false;

        const rect = selection.getBoundingClientRect();
        overlay.remove();

        // Hide overlay before capture
        await new Promise(r => setTimeout(r, 100));

        // For simplicity in this version: capture visible and then crop in editor
        // Better: capture tab and send coordinates to editor
        chrome.runtime.sendMessage({
            action: 'captureVisible',
            crop: {
                x: rect.left * window.devicePixelRatio,
                y: rect.top * window.devicePixelRatio,
                w: rect.width * window.devicePixelRatio,
                h: rect.height * window.devicePixelRatio
            }
        });

        document.removeEventListener('mousedown', onMouseDown);
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
    };

    overlay.addEventListener('mousedown', onMouseDown);
    overlay.addEventListener('mousemove', onMouseMove);
    overlay.addEventListener('mouseup', onMouseUp);

    document.body.appendChild(overlay);
}
