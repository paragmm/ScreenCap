/**
 * Logic for handling premium features and authentication UI
 */
import { Auth } from './auth.js';

export const Premium = (() => {
    const premiumToolsList = [
        'tool-pen-ribbon', 'tool-eraser-ribbon', 'tool-clear-ribbon', 'tool-crop-ribbon',
        'tool-line-ribbon', 'tool-arrow-ribbon', 'tool-rect-ribbon', 'tool-circle-ribbon',
        'tool-polygon-ribbon', 'tool-text-ribbon', 'tool-textarea-ribbon', 'tool-blur-ribbon',
        'btn-undo-ribbon', 'btn-redo-ribbon', 'compare-btn', 'take-snapshot-btn', 'clear-snapshots-btn',
        'tool-select-ribbon', 'appearance-ribbon-group', 'size-ribbon-group'
    ];

    let elements = {};
    let pendingAction = null;
    let isUserLoggedIn = false; // Cache login state for sync checking

    function getElements() {
        elements = {
            modal: document.getElementById('login-modal'),
            closeBtn: document.getElementById('close-login'),
            submitBtn: document.getElementById('submit-login'),
            error: document.getElementById('login-error'),
            username: document.getElementById('login-username'),
            password: document.getElementById('login-password'),
            statusBadge: document.getElementById('status-badge'),
            logoutBtn: document.getElementById('logout-btn')
        };
    }

    function showLoginModal(onSuccess) {
        pendingAction = onSuccess;
        if (elements.modal) {
            elements.modal.style.display = 'flex';
            elements.error.style.display = 'none';
            elements.username.value = '';
            elements.password.value = '';
            elements.username.focus();
        }
    }

    function hideLoginModal() {
        if (elements.modal) {
            elements.modal.style.display = 'none';
        }
        pendingAction = null;
    }

    async function updateUI() {
        isUserLoggedIn = await Auth.isLoggedIn();

        // Update tool icons
        premiumToolsList.forEach(id => {
            const btn = document.getElementById(id);
            if (btn) {
                btn.classList.toggle('premium-locked', !isUserLoggedIn);
            }
        });

        // Update settings status
        if (elements.statusBadge) {
            if (isUserLoggedIn) {
                elements.statusBadge.innerText = 'Premium Member';
                elements.statusBadge.className = 'status-badge premium';
            } else {
                elements.statusBadge.innerText = 'Free Plan';
                elements.statusBadge.className = 'status-badge free';
            }
        }

        if (elements.logoutBtn) {
            elements.logoutBtn.style.display = isUserLoggedIn ? 'block' : 'none';
        }
    }

    // Initialize listeners
    function init() {
        getElements();

        if (elements.closeBtn) {
            elements.closeBtn.addEventListener('click', hideLoginModal);
        }

        if (elements.submitBtn) {
            elements.submitBtn.addEventListener('click', async () => {
                const success = await Auth.login(elements.username.value, elements.password.value);
                if (success) {
                    hideLoginModal();
                    await updateUI();
                    if (pendingAction) pendingAction();
                } else {
                    elements.error.style.display = 'block';
                    elements.error.innerText = 'Invalid username or password';
                }
            });
        }

        if (elements.modal) {
            elements.modal.addEventListener('click', (e) => {
                if (e.target === elements.modal) hideLoginModal();
            });
        }

        if (elements.logoutBtn) {
            elements.logoutBtn.addEventListener('click', async () => {
                await Auth.logout();
                await updateUI();
                if (typeof window.redrawCanvas === 'function') {
                    window.redrawCanvas();
                }
            });
        }

        // Intercept premium clicks - MUST BE SYNCHRONOUS to block other listeners
        document.addEventListener('click', (e) => {
            // Check for both buttons and groups
            const target = e.target.closest('.ribbon-btn, .ribbon-group');
            if (target && premiumToolsList.includes(target.id)) {
                if (!isUserLoggedIn) {
                    // Completely block the event
                    e.preventDefault();
                    e.stopPropagation();
                    e.stopImmediatePropagation();

                    showLoginModal(() => {
                        // After login, re-trigger the click if it was a button
                        if (target.classList.contains('ribbon-btn')) {
                            target.click();
                        }
                    });
                }
            }
        }, true); // Use capture phase to intercept before original listeners

        updateUI();
    }

    return {
        init,
        updateUI,
        isLocked: (id) => premiumToolsList.includes(id),
        get isLoggedIn() { return isUserLoggedIn; }
    };
})();
