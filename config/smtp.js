// SMTP Configuration for Email Services
// SECURITY NOTE: These values should be set via environment variables
// For local development, set them in window.ENV or update the fallback values
// For deployment (Netlify/Vercel), set these in the platform's environment settings

const SMTP_CONFIG = {
    host: window.ENV?.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(window.ENV?.SMTP_PORT || '587'),
    secure: (window.ENV?.SMTP_SECURE || 'false') === 'true',
    auth: {
        user: window.ENV?.SMTP_USER || '',
        pass: window.ENV?.SMTP_PASS || ''
    },
    from: {
        name: window.ENV?.SMTP_FROM_NAME || 'Scilab3.0',
        address: window.ENV?.SMTP_FROM_ADDRESS || ''
    }
};

// Export configuration
if (typeof module !== 'undefined' && module.exports) {
    module.exports = SMTP_CONFIG;
} else {
    window.SMTP_CONFIG = SMTP_CONFIG;
}
