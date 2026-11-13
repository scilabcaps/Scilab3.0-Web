// forgot-password.js - Handles forgot password OTP flow using Supabase

document.addEventListener('DOMContentLoaded', function() {
    const form = document.getElementById('forgotPasswordForm');
    const errorMessage = document.getElementById('errorMessage');
    const sendOtpBtn = document.getElementById('sendOtpBtn');
    const verifyOtpBtn = document.getElementById('verifyOtpBtn');
    const otpSection = document.getElementById('otpSection');
    const otpInput = document.getElementById('otp');

    let pendingEmail = null;

    if (sendOtpBtn) {
        sendOtpBtn.addEventListener('click', async function(e) {
            e.preventDefault();
            errorMessage.textContent = '';
            
            const email = document.getElementById('email').value.trim();

            // Validate email
            if (!email) {
                showErrorSnackbar('Please enter your email address.');
                return;
            }

            // Validate email format
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email)) {
                showErrorSnackbar('Please enter a valid email address.');
                return;
            }

            try {
                // Ensure Supabase client is available
                if (!window.supabase) {
                    showErrorSnackbar('Supabase client not initialized. Please refresh the page.');
                    return;
                }

                // Set loading state with spinner
                setButtonLoadingWithSpinner('sendOtpBtn', true, null, 'Sending OTP...');

                // Send OTP for password reset using Supabase
                const { data, error } = await window.supabase.auth.resetPasswordForEmail(email, {
                    redirectTo: `${window.location.origin}/pages/reset-password.html`
                });

                if (error) {
                    showErrorSnackbar(error.message || 'Failed to send OTP. Please try again.');
                    setButtonLoading('sendOtpBtn', false);
                    return;
                }

                // Store email for later verification
                pendingEmail = email;
                sessionStorage.setItem('resetEmail', email);

                // Show OTP input section
                if (otpSection) {
                    otpSection.style.display = 'block';
                }
                
                sendOtpBtn.style.display = 'none';
                setButtonLoading('sendOtpBtn', false);
                showSuccessSnackbar('OTP code sent to your email! Please enter the code below.');
            } catch (err) {
                setButtonLoading('sendOtpBtn', false);
                showErrorSnackbar(err.message || 'An error occurred. Please try again.');
            }
        });
    }

    if (verifyOtpBtn) {
        verifyOtpBtn.addEventListener('click', async function(e) {
            e.preventDefault();
            errorMessage.textContent = '';
            
            const otp = otpInput.value.trim();

            if (!otp) {
                showErrorSnackbar('Please enter the OTP code.');
                return;
            }

            if (!pendingEmail) {
                showErrorSnackbar('Session expired. Please start over.');
                return;
            }

            try {
                // Set loading state
                setButtonLoading('verifyOtpBtn', true, null, 'Verifying...');

                // Verify OTP for password recovery
                const { data, error } = await window.supabase.auth.verifyOtp({
                    email: pendingEmail,
                    token: otp,
                    type: 'recovery'
                });

                if (error) {
                    showErrorSnackbar(error.message || 'Invalid OTP. Please try again.');
                    setButtonLoading('verifyOtpBtn', false);
                    return;
                }

                setButtonLoading('verifyOtpBtn', false);
                showSuccessSnackbar('OTP verified! Redirecting to reset password...');
                
                // Redirect to reset password page
                setTimeout(() => {
                    window.location.href = 'reset-password.html';
                }, 1500);
            } catch (err) {
                setButtonLoading('verifyOtpBtn', false);
                showErrorSnackbar(err.message || 'Invalid OTP. Please try again.');
            }
        });
    }
});
