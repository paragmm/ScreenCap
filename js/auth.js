
/**
 * Authentication and encryption logic for ScreenCap Premium
 */
const Auth = (() => {
    const DEFAULT_USER = 'admin';
    const DEFAULT_PASS = 'pass123#';
    const STORAGE_KEY = 'screencap_auth_token';

    /**
     * Generates a unique browser signature based on browser and hardware properties.
     */
    function getBrowserSignature() {
        const parts = [
            navigator.userAgent,
            navigator.language,
            screen.colorDepth,
            screen.width + 'x' + screen.height,
            new Date().getTimezoneOffset(),
            navigator.hardwareConcurrency || 'unknown'
        ];
        return btoa(parts.join('|')).slice(0, 32);
    }

    /**
     * Simple encryption using the browser signature as a key.
     * Note: This is not military-grade but serves the "local lock" requirement.
     */
    function encrypt(text, salt) {
        const key = salt + getBrowserSignature();
        let result = '';
        for (let i = 0; i < text.length; i++) {
            const charCode = text.charCodeAt(i) ^ key.charCodeAt(i % key.length);
            result += String.fromCharCode(charCode);
        }
        return btoa(result);
    }

    /**
     * Decryption matching the encrypt function.
     */
    function decrypt(encodedText, salt) {
        try {
            const text = atob(encodedText);
            const key = salt + getBrowserSignature();
            let result = '';
            for (let i = 0; i < text.length; i++) {
                const charCode = text.charCodeAt(i) ^ key.charCodeAt(i % key.length);
                result += String.fromCharCode(charCode);
            }
            return result;
        } catch (e) {
            return null;
        }
    }

    return {
        login: async (username, password) => {
            if (username === DEFAULT_USER && password === DEFAULT_PASS) {
                const tokenData = {
                    user: username,
                    timestamp: Date.now(),
                    expiry: Date.now() + (30 * 24 * 60 * 60 * 1000) // 30 days
                };

                const salt = Math.random().toString(36).substring(7);
                const encryptedData = encrypt(JSON.stringify(tokenData), salt);
                const storageObject = {
                    s: salt,
                    d: encryptedData
                };

                return new Promise((resolve) => {
                    chrome.storage.local.set({ [STORAGE_KEY]: storageObject }, () => {
                        resolve(true);
                    });
                });
            }
            return false;
        },

        isLoggedIn: async () => {
            return new Promise((resolve) => {
                chrome.storage.local.get([STORAGE_KEY], (res) => {
                    const storageObject = res[STORAGE_KEY];
                    if (!storageObject || !storageObject.s || !storageObject.d) {
                        resolve(false);
                        return;
                    }

                    const decryptedStr = decrypt(storageObject.d, storageObject.s);
                    if (!decryptedStr) {
                        resolve(false);
                        return;
                    }

                    try {
                        const tokenData = JSON.parse(decryptedStr);
                        if (tokenData && tokenData.user === DEFAULT_USER && tokenData.expiry > Date.now()) {
                            resolve(true);
                        } else {
                            resolve(false);
                        }
                    } catch (e) {
                        resolve(false);
                    }
                });
            });
        },

        logout: async () => {
            return new Promise((resolve) => {
                chrome.storage.local.remove([STORAGE_KEY], () => {
                    resolve(true);
                });
            });
        }
    };
})();

window.Auth = Auth;
