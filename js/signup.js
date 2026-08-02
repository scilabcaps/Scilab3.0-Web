// signup.js - Handles signup form submission using Supabase OTP + Password

document.addEventListener('DOMContentLoaded', function() {
    const signupForm = document.getElementById('signupForm');
    const errorMessage = document.getElementById('errorMessage');
    const sendOtpBtn = document.getElementById('sendOtpBtn');
    const verifyOtpBtn = document.getElementById('verifyOtpBtn');
    const otpSection = document.getElementById('otpSection');
    const otpInput = document.getElementById('otp');

    let pendingSignupData = null;

    if (sendOtpBtn) {
        sendOtpBtn.addEventListener('click', async function(e) {
            e.preventDefault();
            errorMessage.textContent = '';
            
            const firstname = document.getElementById('firstname').value.trim();
            const lastname = document.getElementById('lastname').value.trim();
            const yearSection = document.getElementById('yearSection').value.trim();
            const course = document.getElementById('course').value;
            const email = document.getElementById('email').value.trim();
            const password = document.getElementById('password').value;
            const confirmPassword = document.getElementById('confirmPassword').value;
            const role = 'student';

            // Validate all fields
            if (!firstname || !lastname || !yearSection || !course || !email || !password || !confirmPassword) {
                showErrorSnackbar('Please fill in all fields.');
                return;
            }

            // Validate email format
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(email)) {
                showErrorSnackbar('Please enter a valid email address.');
                return;
            }

            // Validate password minimum length
            if (password.length < 6) {
                showErrorSnackbar('Password must be at least 6 characters.');
                return;
            }

            // Validate passwords match
            if (password !== confirmPassword) {
                showErrorSnackbar('Passwords do not match.');
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

                // Check if email already exists in user_info table
                const { data: existingUser, error: checkError } = await window.supabase
                    .from('user_info')
                    .select('email')
                    .eq('email', email)
                    .maybeSingle();

                if (checkError && checkError.code !== 'PGRST116') {
                    throw checkError;
                }

                if (existingUser) {
                    showErrorSnackbar('Email already registered. Please use a different email or log in.');
                    setButtonLoading('sendOtpBtn', false);
                    return;
                }

                // Create user with password first (this creates the auth user with password)
                const { data: signUpData, error: signUpError } = await window.supabase.auth.signUp({
                    email: email,
                    password: password,
                    options: {
                        data: {
                            first_name: firstname,
                            last_name: lastname
                        }
                    }
                });

                console.log('Sign up response:', { signUpData, signUpError });

                if (signUpError) {
                    console.error('Signup error:', signUpError);
                    if (signUpError.status === 429) {
                        showErrorSnackbar('Too many requests. Please wait a moment before trying again.');
                    } else {
                        showErrorSnackbar(signUpError.message || 'Signup failed. Please try again.');
                    }
                    setButtonLoading('sendOtpBtn', false);
                    return;
                }

                // Store signup data for later
                pendingSignupData = {
                    firstname,
                    lastname,
                    yearSection,
                    course,
                    email,
                    password,
                    role
                };

                // Show OTP input section for email verification
                if (otpSection) {
                    otpSection.style.display = 'block';
                }
                
                sendOtpBtn.style.display = 'none';
                setButtonLoading('sendOtpBtn', false);
                showSuccessSnackbar('Verification code sent to your email! Please enter the code below.');
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

            if (!pendingSignupData) {
                showErrorSnackbar('Session expired. Please start over.');
                return;
            }

            try {
                // Set loading state
                setButtonLoading('verifyOtpBtn', true, null, 'Verifying...');

                // Verify OTP to confirm email
                const { data, error } = await window.supabase.auth.verifyOtp({
                    email: pendingSignupData.email,
                    token: otp,
                    type: 'signup'
                });

                if (error) {
                    showErrorSnackbar(error.message || 'Invalid OTP. Please try again.');
                    setButtonLoading('verifyOtpBtn', false);
                    return;
                }

                // Insert user info into user_info table
                const { error: userInfoError } = await window.supabase
                    .from('user_info')
                    .insert({
                        id: data.user.id,
                        email: pendingSignupData.email,
                        first_name: pendingSignupData.firstname,
                        last_name: pendingSignupData.lastname,
                        year_section: pendingSignupData.yearSection,
                        course: pendingSignupData.course,
                        role: pendingSignupData.role,
                        isApproved: 0
                    });

                if (userInfoError) {
                    showErrorSnackbar(userInfoError.message || 'Failed to create user info. Please try again.');
                    setButtonLoading('verifyOtpBtn', false);
                    return;
                }

                setButtonLoading('verifyOtpBtn', false);
                showSuccessSnackbar('Account created successfully! Redirecting to login...');
                setTimeout(() => {
                    window.location.href = '../../index.html';
                }, 2000);
            } catch (err) {
                setButtonLoading('verifyOtpBtn', false);
                showErrorSnackbar(err.message || 'Invalid OTP. Please try again.');
            }
        });
    }
});

function togglePassword(fieldId) {
    const field = document.getElementById(fieldId);
    if (field) {
        field.type = field.type === 'password' ? 'text' : 'password';
    }
}