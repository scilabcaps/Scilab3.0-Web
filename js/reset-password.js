// reset-password.js - Handles password reset after OTP verification using Supabase

// Toggle password visibility
function togglePassword(fieldId) {
    const field = document.getElementById(fieldId);
    if (field) {
        field.type = field.type === 'password' ? 'text' : 'password';
    }
}

document.addEventListener('DOMContentLoaded', function() {
    const form = document.getElementById('resetPasswordForm');
    const errorMessage = document.getElementById('errorMessage');
    const submitBtn = form.querySelector('.login-btn');
    
    if (!form) return;

    form.addEventListener('submit', async function(e) {
        e.preventDefault();
        const newPassword = document.getElementById('newPassword').value;
        const confirmPassword = document.getElementById('confirmPassword').value;

        // Validate passwords
        if (!newPassword || !confirmPassword) {
            showErrorSnackbar('Please fill in all fields.');
            return;
        }

        // Validate password minimum length
        if (newPassword.length < 6) {
            showErrorSnackbar('Password must be at least 6 characters.');
            return;
        }

        // Validate passwords match
        if (newPassword !== confirmPassword) {
            showErrorSnackbar('Passwords do not match.');
            return;
        }

        try {
            // Ensure Supabase client is available
            if (!window.supabase) {
                showErrorSnackbar('Supabase client not initialized. Please refresh the page.');
                return;
            }

            // Set loading state
            setButtonLoading(submitBtn, true, null, 'Resetting password...');

            // Check if user has an active session (from OTP verification)
            const { data: { session }, error: sessionError } = await window.supabase.auth.getSession();
            
            if (sessionError || !session) {
                showErrorSnackbar('Session expired. Please request a new OTP code.');
                setButtonLoading(submitBtn, false);
                setTimeout(() => {
                    window.location.href = 'forgot-password.html';
                }, 2000);
                return;
            }

            // Update user password
            const { data, error } = await window.supabase.auth.updateUser({
                password: newPassword
            });

            if (error) {
                showErrorSnackbar(error.message || 'Failed to reset password. Please try again.');
                setButtonLoading(submitBtn, false);
                return;
            }

            setButtonLoading(submitBtn, false);
            showSuccessSnackbar('Password reset successful! Redirecting to login...');
            
            // Clear the form
            form.reset();
            
            // Clear the stored email
            sessionStorage.removeItem('resetEmail');
            
            // Redirect to login after a delay
            setTimeout(() => {
                window.location.href = '../index.html';
            }, 2000);
        } catch (error) {
            showErrorSnackbar('An error occurred: ' + error.message);
            setButtonLoading(submitBtn, false);
        }
    });
});
