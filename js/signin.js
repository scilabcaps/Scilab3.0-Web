// signin.js
// Handles login form submission and redirects based on user role using Supabase

// Toggle password visibility
function togglePassword() {
    const passwordInput = document.getElementById('password');
    const showPasswordBtn = document.querySelector('.show-password-btn');
    
    if (passwordInput.type === 'password') {
        passwordInput.type = 'text';
        showPasswordBtn.innerHTML = `
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 7C14.76 7 17 9.24 17 12C17 12.67 16.87 13.31 16.64 13.9L19.57 16.83C20.88 15.64 21.94 14.18 22.64 12.5C21.27 8.61 17.1 5.5 12 5.5C10.46 5.5 8.99 5.8 7.64 6.35L10.1 8.81C10.69 8.58 11.33 8.45 12 8.45ZM2 4.27L4.28 6.55L4.73 7C3.08 8.3 1.78 10.02 1 12C2.38 15.97 6.49 19.5 12 19.5C13.55 19.5 15.03 19.2 16.38 18.65L16.81 19.08L19.73 22L21 20.73L3.27 3L2 4.27ZM7.53 9.8L9.08 11.35C9.03 11.56 9 11.77 9 12C9 13.66 10.34 15 12 15C12.23 15 12.44 14.97 12.65 14.92L14.2 16.47C13.53 16.8 12.79 17 12 17C9.24 17 7 14.76 7 12C7 11.21 7.2 10.47 7.53 9.8ZM9.84 12.01L11.99 14.16C11.67 14.06 11.34 14 11 14C9.9 14 9 13.1 9 12C9 11.66 9.06 11.33 9.16 11.01L9.84 12.01Z" fill="#152614"/>
            </svg>
        `;
    } else {
        passwordInput.type = 'password';
        showPasswordBtn.innerHTML = `
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 4.5C7 4.5 2.73 7.61 1 12C2.73 16.39 7 19.5 12 19.5C17 19.5 21.27 16.39 23 12C21.27 7.61 17 4.5 12 4.5ZM12 17C9.24 17 7 14.76 7 12C7 9.24 9.24 7 12 7C14.76 7 17 9.24 17 12C17 14.76 14.76 17 12 17ZM12 9C10.34 9 9 10.34 9 12C9 13.66 10.34 15 12 15C13.66 15 15 13.66 15 12C15 10.34 13.66 9 12 9Z" fill="#152614"/>
            </svg>
        `;
    }
}

document.addEventListener('DOMContentLoaded', function() {
    const form = document.getElementById('loginForm');
    const loginBtn = form.querySelector('.login-btn');
    if (!form) return;

    form.addEventListener('submit', async function(e) {
        e.preventDefault();
        const username = document.getElementById('username').value.trim();
        const password = document.getElementById('password').value;

        // Validate fields
        if (!username || !password) {
            showErrorSnackbar('Please fill in all fields.');
            return;
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(username)) {
            showErrorSnackbar('Please enter a valid email address.');
            return;
        }

        try {
            // Ensure Supabase client is available
            if (!window.supabase) {
                showErrorSnackbar('Supabase client not initialized. Please refresh the page.');
                return;
            }

            // Set loading state
            setButtonLoading(loginBtn, true, null, 'Logging in...');

            // Sign in with Supabase using email
            const { data, error } = await window.supabase.auth.signInWithPassword({
                email: username,
                password: password,
            });

            if (error) {
                if (error.status === 400) {
                    showErrorSnackbar('Invalid email or password.');
                } else {
                    showErrorSnackbar(error.message || 'Login failed. Please try again.');
                }
                setButtonLoading(loginBtn, false);
                return;
            }

            // Get user from auth
            const user = data.user;

            // Fetch role from public.user_info table
            const { data: userInfo, error: userInfoError } = await window.supabase
                .from('user_info')
                .select('role, username, first_name, last_name, middle_name, phone')
                .eq('id', user.id)
                .single();

            if (userInfoError) {
                showErrorSnackbar('Failed to fetch user information. Please try again.');
                setButtonLoading(loginBtn, false);
                return;
            }

            const role = userInfo.role || 'student';

            // Store user in sessionStorage
            const userData = {
                id: user.id,
                email: user.email,
                role: role.charAt(0).toUpperCase() + role.slice(1), // Capitalize first letter
                username: userInfo.username || username,
                firstname: userInfo.first_name,
                lastname: userInfo.last_name,
                middle_name: userInfo.middle_name,
                phone: userInfo.phone
            };
            sessionStorage.setItem('user', JSON.stringify(userData));

            showSuccessSnackbar('Login successful! Redirecting...');
            
            // Redirect based on role
            setTimeout(() => {
                switch (role) {
                    case 'professor':
                        window.location.href = 'pages/professor/professor_dashboard.html';
                        break;
                    case 'student':
                        window.location.href = 'pages/student/student_dashboard.html';
                        break;
                    default:
                        showErrorSnackbar('Unknown role. Please contact administrator.');
                        setButtonLoading(loginBtn, false);
                }
            }, 1000);
        } catch (error) {
            showErrorSnackbar('Login failed: ' + error.message);
            setButtonLoading(loginBtn, false);
        }
    });
});
