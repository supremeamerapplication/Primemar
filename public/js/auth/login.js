// public/js/auth/login.js
import { supabase } from '../config/supabase.js';

document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('loginForm');
    const emailInput = document.getElementById('email');
    const passwordInput = document.getElementById('password');
    const emailError = document.getElementById('emailError');
    const passwordError = document.getElementById('passwordError');
    const generalError = document.getElementById('generalError');
    const successMessage = document.getElementById('successMessage');

    // Check if user is already logged in
    supabase.auth.getSession().then(({ data }) => {
        if (data.session) {
            window.location.href = '/feed.html';
        }
    });

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        // Reset errors
        resetErrors();
        
        const email = emailInput.value.trim();
        const password = passwordInput.value;

        // Basic validation
        let isValid = true;

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

        if (!isValid) return;

        // Show loading state
        loginForm.classList.add('loading');
        const submitBtn = loginForm.querySelector('button[type="submit"]');
        const originalText = submitBtn.textContent;
        submitBtn.textContent = 'Signing in...';
        submitBtn.disabled = true;

        try {
            // Sign in with Supabase
            const { data, error } = await supabase.auth.signInWithPassword({
                email,
                password
            });

            if (error) {
                throw error;
            }

            // Show success message
            showSuccess(successMessage, 'Login successful! Redirecting...');

            // Redirect to feed page
            setTimeout(() => {
                window.location.href = '/feed.html';
            }, 1000);

        } catch (error) {
            console.error('Login error:', error);
            
            if (error.message.includes('Invalid login credentials')) {
                showError(generalError, 'Invalid email or password');
            } else if (error.message.includes('Email not confirmed')) {
                showError(generalError, 'Please confirm your email before logging in');
            } else {
                showError(generalError, 'An error occurred. Please try again.');
            }
        } finally {
            // Reset loading state
            loginForm.classList.remove('loading');
            submitBtn.textContent = originalText;
            submitBtn.disabled = false;
        }
    });

    function resetErrors() {
        emailError.style.display = 'none';
        passwordError.style.display = 'none';
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
