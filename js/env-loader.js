// Environment variable loader for local development
// This loads the .env file and makes variables available via window.ENV
// In production (Netlify/Vercel), environment variables are injected differently

(async function loadEnv() {
    try {
        const response = await fetch('.env');
        if (!response.ok) {
            console.warn('Could not load .env file. Using fallback values or platform environment variables.');
            return;
        }
        
        const envText = await response.text();
        const envVars = {};
        
        envText.split('\n').forEach(line => {
            const trimmedLine = line.trim();
            // Skip comments and empty lines
            if (trimmedLine && !trimmedLine.startsWith('#')) {
                const [key, ...valueParts] = trimmedLine.split('=');
                if (key && valueParts.length > 0) {
                    envVars[key.trim()] = valueParts.join('=').trim();
                }
            }
        });
        
        window.ENV = envVars;
        console.log('Environment variables loaded successfully');
    } catch (error) {
        console.warn('Error loading .env file:', error.message);
        console.log('Using fallback values or platform environment variables');
    }
})();
