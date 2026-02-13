chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'ping') {
        sendResponse({ status: 'pong' });
    } else if (request.action === 'startFullPageCapture') {
        handleFullPageCapture();
    } else if (request.action === 'startSelectiveCapture') {
        startSelectiveSelection();
    }
    return true;
});

async function handleFullPageCapture() {
    try {
        // Scroll to top first as requested
        window.scrollTo(0, 0);
        await new Promise(r => setTimeout(r, 500));

        const scrollHeight = document.documentElement.scrollHeight;
        const scrollWidth = document.documentElement.scrollWidth;
        const viewHeight = window.innerHeight;
        const viewWidth = window.innerWidth;
        const dpr = window.devicePixelRatio || 1;

        // Hide scrollbar temporarily
        const originalOverflow = document.documentElement.style.overflow;
        document.documentElement.style.overflow = 'hidden';

        // Wait for layout to settle after hiding scrollbar
        await new Promise(r => setTimeout(r, 200));

        const canvas = document.createElement('canvas');
        canvas.width = scrollWidth * dpr;
        canvas.height = scrollHeight * dpr;
        const ctx = canvas.getContext('2d');

        let currentScroll = 0;
        while (currentScroll < scrollHeight) {
            window.scrollTo(0, currentScroll);
            // Wait for fixed elements and content to settle
            await new Promise(r => setTimeout(r, 600));

            const response = await new Promise((resolve, reject) => {
                chrome.runtime.sendMessage({ action: 'captureSegment' }, (res) => {
                    if (chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message));
                    } else {
                        resolve(res);
                    }
                });
            });

            if (!response || !response.dataUrl) {
                throw new Error('Failed to capture segment');
            }

            const img = new Image();
            img.src = response.dataUrl;

            await new Promise((resolve, reject) => {
                img.onload = () => {
                    // Calculate exact source and destination to avoid seams
                    const remainingHeight = scrollHeight - currentScroll;
                    const drawHeight = Math.min(viewHeight, remainingHeight);

                    // If it's the last segment, it might be shorter than the viewport
                    // We take the bottom slice of the viewport capture
                    const sourceY = (viewHeight - drawHeight) * dpr;

                    ctx.drawImage(
                        img,
                        0, sourceY, // Source X, Y
                        viewWidth * dpr, drawHeight * dpr, // Source W, H
                        0, currentScroll * dpr, // Destination X, Y
                        viewWidth * dpr, drawHeight * dpr // Destination W, H
                    );
                    resolve();
                };
                img.onerror = () => reject(new Error('Failed to load segment image'));
            });

            currentScroll += viewHeight;
            if (currentScroll >= scrollHeight) break;
        }

        // Reset overflow
        document.documentElement.style.overflow = originalOverflow;

        // Send stitched image to editor
        const finalDataUrl = canvas.toDataURL('image/png');
        chrome.runtime.sendMessage({ action: 'openEditorWithData', dataUrl: finalDataUrl });
    } catch (error) {
        console.error('Full page capture failed:', error);
        alert('Screenshot failed: ' + error.message + '. Please try again.');
        // Cleanup if possible
        document.documentElement.style.overflow = '';
    }
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
