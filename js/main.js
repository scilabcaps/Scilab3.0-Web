// Main JavaScript file for common functionality

// Toggle password visibility
function togglePassword(inputId = 'password') {
    const input = document.getElementById(inputId);
    const type = input.getAttribute('type') === 'password' ? 'text' : 'password';
    input.setAttribute('type', type);
}

// Logout function
function logout() {
    if (confirm('Are you sure you want to logout?')) {
        sessionStorage.removeItem('user');
        window.location.href = '../../index.html';
    }
}

// Navigation function
function navigateTo(page) {
    window.location.href = page;
}

// Set active navigation link based on current page
function setActiveNavLink() {
    const currentPage = window.location.pathname.split('/').pop() || window.location.href.split('/').pop();
    console.log('Current page detected:', currentPage); // Debug log
    const navLinks = document.querySelectorAll('.nav-link');
    navLinks.forEach(link => {
        const href = link.getAttribute('href');
        console.log('Checking link href:', href, 'against current page:', currentPage); // Debug log
        if (href === currentPage || (currentPage === '' && href === 'index.html')) {
            link.classList.add('active');
        } else {
            link.classList.remove('active');
        }
    });
}

// Initialize sidebar user info
function initSidebarUser() {
    const user = JSON.parse(sessionStorage.getItem('user') || '{}');
    const userAvatar = document.getElementById('userAvatar');
    const userName = document.getElementById('userName');
    
    if (user.firstname) {
        const firstName = user.firstname || 'User';
        const lastName = user.lastname || '';
        const initials = (firstName.charAt(0) + (lastName ? lastName.charAt(0) : firstName.charAt(1) || '')).toUpperCase();
        const fullName = firstName + ' ' + lastName;
        
        if (userAvatar) userAvatar.textContent = initials;
        if (userName) userName.textContent = fullName;
    }
}

// Load sidebar component dynamically
async function loadSidebarComponent(containerId, sidebarPath) {
    const container = document.getElementById(containerId);
    if (container) {
        try {
            const response = await fetch(sidebarPath);
            if (response.ok) {
                const sidebarHTML = await response.text();
                container.innerHTML = sidebarHTML;
                // Initialize sidebar after loading
                setActiveNavLink();
                initSidebarUser();
            }
        } catch (error) {
            console.error('Error loading sidebar:', error);
        }
    }
}

// Initialize sidebar on page load
document.addEventListener('DOMContentLoaded', function() {
    setActiveNavLink();
    initSidebarUser();
});

// Handle login form submission - Supabase authentication
document.addEventListener('DOMContentLoaded', function() {
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            const email = document.getElementById('email')?.value || document.getElementById('username')?.value;
            const password = document.getElementById('password').value;
            
            try {
                const { data, error } = await supabase.auth.signInWithPassword({
                    email: email,
                    password: password
                });
                
                if (error) throw error;
                
                // Fetch user role from user_info table
                const { data: userData, error: userError } = await supabase
                    .from('user_info')
                    .select('*')
                    .eq('email', email)
                    .single();
                
                if (userError) throw userError;
                
                sessionStorage.setItem('user', JSON.stringify(userData));
                
                // Redirect based on role
                if (userData.role === 'Professor') {
                    window.location.href = 'pages/professor/professor_dashboard.html';
                } else {
                    window.location.href = 'pages/student/student_dashboard.html';
                }
            } catch (error) {
                console.error('Login error:', error);
                const errorMsg = document.getElementById('errorMessage');
                if (errorMsg) {
                    errorMsg.textContent = error.message || 'Invalid email or password';
                    errorMsg.style.display = 'block';
                } else {
                    alert(error.message || 'Invalid email or password');
                }
            }
        });
    }

    // Handle signup form submission - Supabase authentication
    const signupForm = document.getElementById('signupForm');
    if (signupForm) {
        signupForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;
            const confirmPassword = document.getElementById('confirmPassword').value;
            const firstname = document.getElementById('firstname').value;
            const lastname = document.getElementById('lastname').value;
            
            if (password !== confirmPassword) {
                const errorMsg = document.getElementById('errorMessage');
                if (errorMsg) {
                    errorMsg.textContent = 'Passwords do not match';
                    errorMsg.style.display = 'block';
                } else {
                    alert('Passwords do not match');
                }
                return;
            }

            try {
                // Create auth user
                const { data: authData, error: authError } = await supabase.auth.signUp({
                    email: email,
                    password: password
                });
                
                if (authError) throw authError;
                
                // Create user info record
                const { error: userError } = await supabase
                    .from('user_info')
                    .insert({
                        email: email,
                        first_name: firstname,
                        last_name: lastname,
                        role: 'Student',
                        is_banned: false
                    });
                
                if (userError) throw userError;
                
                alert('Account created successfully! Please login.');
                window.location.href = '../index.html';
            } catch (error) {
                console.error('Signup error:', error);
                const errorMsg = document.getElementById('errorMessage');
                if (errorMsg) {
                    errorMsg.textContent = error.message || 'Error creating account';
                    errorMsg.style.display = 'block';
                } else {
                    alert(error.message || 'Error creating account');
                }
            }
        });
    }
});

// Close modal when clicking outside
window.onclick = function(event) {
    const modals = document.querySelectorAll('.modal');
    modals.forEach(modal => {
        if (event.target === modal) {
            modal.style.display = 'none';
        }
    });
}

