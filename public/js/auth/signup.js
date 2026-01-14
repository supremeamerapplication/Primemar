// public/js/auth/signup.js
import { supabase } from '../config/supabase.js';

document.addEventListener('DOMContentLoaded', () => {
    const signupForm = document.getElementById('signupForm');
    const usernameInput = document.getElementById('username');
    const displayNameInput = document.getElementById('displayName');
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const confirmPasswordInput = document.getElementById('confirmPassword');
    const bioInput = document.getElementById('bio');
    
    const usernameError = document.getElementById('usernameError');
    const displayNameError = document.getElementById('displayNameError');
    const emailError = document.getElementById('emailError');
    const passwordError = document.getElementById('passwordError');
    const confirmPasswordError = document.getElementById('confirmPasswordError');
    const generalError = document.getElementById('generalError');
    const successMessage = document.getElementById('successMessage');

    // Check if user is already logged in
    supabase.auth.getSession().then(({ data }) => {
        if (data.session) {
            window.location.href = '/feed.html';
        }
    });

    signupForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        // Reset errors
        resetErrors();
        
        const username = usernameInput.value.trim();
        const displayName = displayNameInput.value.trim();
        const email = emailInput.value.trim();
        const password = passwordInput.value;
        const confirmPassword = confirmPasswordInput.value;
        const bio = bioInput.value.trim();

        // Validation
        let isValid = true;

        if (!username) {
            showError(usernameError, 'Username is required');
            isValid = false;
        } else if (username.length < 3) {
            showError(usernameError, 'Username must be at least 3 characters');
            isValid = false;
        } else if (!/^[a-zA-Z0-9_]+$/.test(username)) {
            showError(usernameError, 'Username can only contain letters, numbers, and underscores');
            isValid = false;
        }

        if (!displayName) {
            showError(displayNameError, 'Display name is required');
            isValid = false;
        }

        if (!email) {
            showError(emailError, 'Email is required');
            isValid = false;
        } else if (!isValidEmail(email)) {
            showError(emailError, 'Please enter a valid email');
            isValid = false;
        }

        if (!password) {
            showError(passwordError, 'Password is required');
            isValid = false;
        } else if (password.length < 6) {
            showError(passwordError, 'Password must be at least 6 characters');
            isValid = false;
        }

        if (password !== confirmPassword) {
            showError(confirmPasswordError, 'Passwords do not match');
            isValid = false;
        }

        if (!isValid) return;

        // Show loading state
        signupForm.classList.add('loading');
        const submitBtn = signupForm.querySelector('button[type="submit"]');
        const originalText = submitBtn.textContent;
        submitBtn.textContent = 'Creating account...';
        submitBtn.disabled = true;

        try {
            // Check if username already exists
            const { data: existingUser, error: usernameCheckError } = await supabase
                .from('profiles')
                .select('id')
                .eq('username', username)
                .single();

            if (existingUser) {
                showError(usernameError, 'Username already taken');
                return;
            }

            // Sign up with Supabase Auth
            const { data: authData, error: authError } = await supabase.auth.signUp({
                email,
                password,
                options: {
                    data: {
                        username,
                        display_name: displayName,
                        bio
                    }
                }
            });

            if (authError) {
                throw authError;
            }

            // Create profile in database
            const { error: profileError } = await supabase
                .from('profiles')
                .insert([
                    {
                        id: authData.user.id,
                        username,
                        display_name: displayName,
                        bio,
                        avatar_url: null,
                        followers_count: 0,
                        following_count: 0
                    }
                ]);

            if (profileError) {
                throw profileError;
            }

            // Show success message
            showSuccess(successMessage, 'Account created successfully! Check your email for confirmation.');

            // Reset form
            signupForm.reset();

            // Redirect to login page after 3 seconds
            setTimeout(() => {
                window.location.href = '/login.html';
            }, 3000);

        } catch (error) {
            console.error('Signup error:', error);
            
            if (error.message.includes('already registered')) {
                showError(emailError, 'Email already registered');
            } else if (error.message.includes('password')) {
                showError(passwordError, 'Password does not meet requirements');
            } else {
                showError(generalError, 'An error occurred. Please try again.');
            }
        } finally {
            // Reset loading state
            signupForm.classList.remove('loading');
            submitBtn.textContent = originalText;
            submitBtn.disabled = false;
        }
    });

    function resetErrors() {
        usernameError.style.display = 'none';
        displayNameError.style.display = 'none';
        emailError.style.display = 'none';
        passwordError.style.display = 'none';
        confirmPasswordError.style.display = 'none';
        generalError.style.display = 'none';
        successMessage.style.display = 'none';
    }

    function showError(element, message) {
        element.textContent = message;
        element.style.display = 'block';
    }

    function showSuccess(element, message) {
        element.textContent = message;
        element.style.display = 'block';
    }

    function isValidEmail(email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    }
});
