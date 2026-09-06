// settings.js - Handles account settings functionality

document.addEventListener('DOMContentLoaded', function() {
    // Load user data and initialize forms
    loadUserData();
    initializeTabs();
    initializeForms();
});

// Load user data from Supabase and populate forms
async function loadUserData() {
    try {
        // Get current user from Supabase auth
        const { data: { user }, error: authError } = await window.supabase.auth.getUser();
        
        if (authError || !user) {
            console.error('Error fetching user:', authError);
            window.location.href = '../../index.html';
            return;
        }

        // Fetch user info from user_info table
        const { data: userInfo, error: userError } = await window.supabase
            .from('user_info')
            .select('*')
            .eq('id', user.id)
            .single();

        if (userError) {
            console.error('Error fetching user info:', userError);
            return;
        }

        // Populate profile form
        if (userInfo) {
            const firstNameInput = document.getElementById('firstName');
            const lastNameInput = document.getElementById('lastName');
            const emailInput = document.getElementById('email');
            const roleInput = document.getElementById('role');
            const memberSinceSpan = document.getElementById('memberSince');

            if (firstNameInput) firstNameInput.value = userInfo.first_name || '';
            if (lastNameInput) lastNameInput.value = userInfo.last_name || '';
            if (emailInput) emailInput.value = userInfo.email || '';
            if (roleInput) roleInput.value = userInfo.role || '';
            
            if (memberSinceSpan && userInfo.created_at) {
                const createdDate = new Date(userInfo.created_at);
                memberSinceSpan.textContent = createdDate.toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                });
            }

            // Update sidebar user info
            updateSidebarUserInfo(userInfo);
        }

        // Load last login time (this would need to be tracked separately)
        updateLastLogin();

    } catch (error) {
        console.error('Error loading user data:', error);
        showErrorSnackbar('Failed to load user data. Please refresh the page.');
    }
}

// Update sidebar user information
function updateSidebarUserInfo(userInfo) {
    const userName = document.getElementById('userName');
    const userAvatar = document.getElementById('userAvatar');
    const userRoleBadge = document.getElementById('userRoleBadge');

    if (userName) {
        userName.textContent = `${userInfo.first_name} ${userInfo.last_name}`;
    }

    if (userAvatar) {
        const initials = (userInfo.first_name.charAt(0) + userInfo.last_name.charAt(0)).toUpperCase();
        userAvatar.textContent = initials;
    }

    if (userRoleBadge) {
        userRoleBadge.textContent = userInfo.role.charAt(0).toUpperCase() + userInfo.role.slice(1);
        userRoleBadge.className = `user-role-badge ${userInfo.role.toLowerCase()}`;
    }
}

// Update last login time
function updateLastLogin() {
    const lastLoginSpan = document.getElementById('lastLogin');
    if (lastLoginSpan) {
        const now = new Date();
        lastLoginSpan.textContent = now.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    }
}

// Initialize tab functionality
function initializeTabs() {
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    tabButtons.forEach(button => {
        button.addEventListener('click', function() {
            const tabName = this.getAttribute('data-tab');

            // Remove active class from all buttons and contents
            tabButtons.forEach(btn => btn.classList.remove('active'));
            tabContents.forEach(content => content.classList.remove('active'));

            // Add active class to clicked button and corresponding content
            this.classList.add('active');
            const targetContent = document.getElementById(`${tabName}-tab`);
            if (targetContent) {
                targetContent.classList.add('active');
            }
        });
    });
}

// Initialize form handlers
function initializeForms() {
    // Profile form
    const profileForm = document.getElementById('profileForm');
    if (profileForm) {
        profileForm.addEventListener('submit', handleProfileUpdate);
    }

    // Password form
    const passwordForm = document.getElementById('passwordForm');
    if (passwordForm) {
        passwordForm.addEventListener('submit', handlePasswordChange);
    }

    // Preferences form - removed as tab is no longer present
}

// Handle profile update
async function handleProfileUpdate(e) {
    e.preventDefault();
    
    const firstName = document.getElementById('firstName').value.trim();
    const lastName = document.getElementById('lastName').value.trim();

    // Validation
    if (!firstName || !lastName) {
        showErrorSnackbar('Please fill in all required fields.');
        return;
    }

    if (firstName.length < 2 || lastName.length < 2) {
        showErrorSnackbar('Names must be at least 2 characters long.');
        return;
    }

    try {
        // Get current user
        const { data: { user }, error: authError } = await window.supabase.auth.getUser();
        
        if (authError || !user) {
            showErrorSnackbar('Authentication error. Please log in again.');
            return;
        }

        // Set loading state
        const submitBtn = e.target.querySelector('button[type="submit"]');
        setButtonLoadingWithSpinner(submitBtn, true, null, 'Updating...');

        // Update user_info table
        const { error: updateError } = await window.supabase
            .from('user_info')
            .update({
                first_name: firstName,
                last_name: lastName
            })
            .eq('id', user.id);

        if (updateError) {
            throw updateError;
        }

        // Update Supabase auth user metadata
        const { error: authUpdateError } = await window.supabase.auth.updateUser({
            data: {
                first_name: firstName,
                last_name: lastName
            }
        });

        if (authUpdateError) {
            console.warn('Failed to update auth metadata:', authUpdateError);
        }

        // Update session storage
        const sessionUser = JSON.parse(sessionStorage.getItem('user') || '{}');
        sessionUser.firstname = firstName;
        sessionUser.lastname = lastName;
        sessionStorage.setItem('user', JSON.stringify(sessionUser));

        // Update sidebar
        updateSidebarUserInfo({
            first_name: firstName,
            last_name: lastName,
            role: sessionUser.role
        });

        setButtonLoading(submitBtn, false);
        showSuccessSnackbar('Profile updated successfully!');

    } catch (error) {
        console.error('Error updating profile:', error);
        const submitBtn = e.target.querySelector('button[type="submit"]');
        setButtonLoading(submitBtn, false);
        showErrorSnackbar(error.message || 'Failed to update profile. Please try again.');
    }
}

// Handle password change
async function handlePasswordChange(e) {
    e.preventDefault();
    
    const currentPassword = document.getElementById('currentPassword').value;
    const newPassword = document.getElementById('newPassword').value;
    const confirmNewPassword = document.getElementById('confirmNewPassword').value;

    // Validation
    if (!currentPassword || !newPassword || !confirmNewPassword) {
        showErrorSnackbar('Please fill in all password fields.');
        return;
    }

    if (newPassword.length < 6) {
        showErrorSnackbar('New password must be at least 6 characters long.');
        return;
    }

    if (newPassword !== confirmNewPassword) {
        showErrorSnackbar('New passwords do not match.');
        return;
    }

    if (currentPassword === newPassword) {
        showErrorSnackbar('New password must be different from current password.');
        return;
    }

    try {
        // Get current user
        const { data: { user }, error: authError } = await window.supabase.auth.getUser();
        
        if (authError || !user) {
            showErrorSnackbar('Authentication error. Please log in again.');
            return;
        }

        // Set loading state
        const submitBtn = e.target.querySelector('button[type="submit"]');
        setButtonLoadingWithSpinner(submitBtn, true, null, 'Changing Password...');

        // Verify current password by attempting to sign in
        const { error: signInError } = await window.supabase.auth.signInWithPassword({
            email: user.email,
            password: currentPassword
        });

        if (signInError) {
            setButtonLoading(submitBtn, false);
            showErrorSnackbar('Current password is incorrect.');
            return;
        }

        // Update password
        const { error: updateError } = await window.supabase.auth.updateUser({
            password: newPassword
        });

        if (updateError) {
            throw updateError;
        }

        // Clear form
        document.getElementById('currentPassword').value = '';
        document.getElementById('newPassword').value = '';
        document.getElementById('confirmNewPassword').value = '';

        setButtonLoading(submitBtn, false);
        showSuccessSnackbar('Password changed successfully!');

    } catch (error) {
        console.error('Error changing password:', error);
        const submitBtn = e.target.querySelector('button[type="submit"]');
        setButtonLoading(submitBtn, false);
        showErrorSnackbar(error.message || 'Failed to change password. Please try again.');
    }
}

// Toggle password visibility
function togglePassword(fieldId) {
    const field = document.getElementById(fieldId);
    if (field) {
        field.type = field.type === 'password' ? 'text' : 'password';
    }
}

// Logout function
async function logout() {
    try {
        const { error } = await window.supabase.auth.signOut();
        if (error) {
            console.error('Logout error:', error);
        }
        sessionStorage.clear();
        window.location.href = '../../index.html';
    } catch (error) {
        console.error('Error during logout:', error);
        sessionStorage.clear();
        window.location.href = '../../index.html';
    }
}
