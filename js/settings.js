// settings.js - Handles account settings functionality

let currentAssignedProfessorId = null;
let originalProfileFirstName = '';
let originalProfileLastName = '';

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
            originalProfileFirstName = userInfo.first_name || '';
            originalProfileLastName = userInfo.last_name || '';
            if (emailInput) emailInput.value = userInfo.email || '';
            if (roleInput) roleInput.value = userInfo.role || '';

            if (String(userInfo.role || '').toLowerCase() === 'student') {
                const professorGroup = document.getElementById('assignedProfessorGroup');
                if (professorGroup) professorGroup.hidden = false;
                await loadAssignedProfessorOptions(userInfo.professor || '');
            }
            
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

async function loadAssignedProfessorOptions(currentProfessorId) {
    const professorSelect = document.getElementById('assignedProfessor');
    if (!professorSelect) return;

    try {
        const { data: professors, error } = await window.supabase
            .from('user_info')
            .select('id, first_name, last_name')
            .eq('role', 'professor')
            .order('first_name', { ascending: true });

        if (error) throw error;

        professorSelect.replaceChildren(new Option('Select a professor', ''));
        (professors || []).forEach(professor => {
            const name = [professor.first_name, professor.last_name].filter(Boolean).join(' ').trim();
            if (name) professorSelect.add(new Option(name, professor.id));
        });

        if (currentProfessorId && !Array.from(professorSelect.options).some(option => option.value === currentProfessorId)) {
            throw new Error('Your currently assigned professor could not be found. Please contact your administrator.');
        }
        if (professorSelect.options.length === 1) {
            throw new Error('No professors are available to select.');
        }

        professorSelect.value = currentProfessorId;
        professorSelect.disabled = false;
        currentAssignedProfessorId = currentProfessorId;
    } catch (error) {
        console.error('Error loading professors for account settings:', error);
        professorSelect.replaceChildren(new Option('Professors unavailable', ''));
        showErrorSnackbar(error.message || 'Failed to load professors. Please refresh the page.');
    }
}

// Handle profile update
async function handleProfileUpdate(e) {
    e.preventDefault();
    
    const firstName = document.getElementById('firstName').value.trim();
    const lastName = document.getElementById('lastName').value.trim();
    const professorSelect = document.getElementById('assignedProfessor');
    const professorId = professorSelect?.value || '';

    // Validation
    if (!firstName || !lastName) {
        showErrorSnackbar('Please fill in all required fields.');
        return;
    }

    if ((firstName !== originalProfileFirstName && firstName.length < 2) ||
        (lastName !== originalProfileLastName && lastName.length < 2)) {
        showErrorSnackbar('Names must be at least 2 characters long.');
        return;
    }

    if (professorSelect && professorSelect.disabled) {
        showErrorSnackbar('Please wait for the professor list to finish loading.');
        return;
    }
    if (professorSelect && !professorId) {
        showErrorSnackbar('Please select an assigned professor.');
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
        const profileUpdates = {
            first_name: firstName,
            last_name: lastName
        };
        if (professorSelect) profileUpdates.professor = professorId;

        const { error: updateError } = await window.supabase
            .from('user_info')
            .update(profileUpdates)
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
        originalProfileFirstName = firstName;
        originalProfileLastName = lastName;

        if (professorSelect && professorId !== currentAssignedProfessorId) {
            currentAssignedProfessorId = professorId;
            // The assignment change can move pending account approvals to another professor.
            for (let index = localStorage.length - 1; index >= 0; index--) {
                const key = localStorage.key(index);
                if (key && key.startsWith('account_approvals_cache:')) localStorage.removeItem(key);
            }
        }

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

