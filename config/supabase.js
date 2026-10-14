// Supabase Configuration
// SECURITY NOTE: These values should be set via environment variables
// For local development, set them in window.ENV or update the fallback values
// For deployment (Netlify/Vercel), set these in the platform's environment settings

const SUPABASE_URL = window.ENV?.SUPABASE_URL || 'https://mfemixkenhgpsterrqzo.supabase.co';
const SUPABASE_ANON_KEY = window.ENV?.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1mZW1peGtlbmhncHN0ZXJycXpvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc4OTI5OTksImV4cCI6MjA5MzQ2ODk5OX0.nLwM4aKBjoMcNjhdn6-wC7gT4W4qnNduRq6qpBejzAs';

// Initialize Supabase client immediately
if (typeof supabase !== 'undefined') {
    if (SUPABASE_URL && SUPABASE_ANON_KEY && SUPABASE_URL !== 'YOUR_SUPABASE_URL_HERE') {
        window.supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        console.log('Supabase client initialized successfully');
    } else {
        console.error('Supabase credentials not configured. Please set them in config/supabase.js');
    }
} else {
    console.error('Supabase library not loaded. Make sure the Supabase CDN script is included before this file.');
}

// Create a broadcast notification for the admin app.
window.createAdminNotification = async function ({
    title,
    message,
    type = 'general',
    relatedId = null,
    entityType = null,
    entityId = null,
    action = 'view'
}) {
    if (!window.supabase) return { error: new Error('Supabase client is not initialized') };

    const { error } = await window.supabase.rpc('create_admin_notification', {
        p_title: title,
        p_message: message,
        p_type: type,
        p_related_id: relatedId == null ? null : String(relatedId),
        p_entity_type: entityType,
        p_entity_id: entityId == null ? null : Number(entityId),
        p_action: action
    });

    if (error) console.error('Unable to create notification:', error);
    return { error };
};
