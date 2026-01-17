import { supabase } from '../config/supabase.js'

document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('loginForm')
    const togglePassword = document.getElementById('togglePassword')
    const passwordInput = document.getElementById('password')
    const messageDiv = document.getElementById('message')
    const forgotPassword = document.getElementById('forgotPassword')
    const googleBtn = document.querySelector('.btn-google')
    const githubBtn = document.querySelector('.btn-github')

    // Toggle password visibility
    if (togglePassword) {
        togglePassword.addEventListener('click', () => {
            const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password'
            passwordInput.setAttribute('type', type)
            togglePassword.classList.toggle('fa-eye')
            togglePassword.classList.toggle('fa-eye-slash')
        })
    }

    // Handle form submission
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault()
        
        const email = document.getElementById('email').value.trim()
        const password = document.getElementById('password').value
        
        if (!email || !password) {
            showMessage('Please fill in all fields', 'error')
            return
        }
        
        const submitBtn = loginForm.querySelector('button[type="submit"]')
        submitBtn.disabled = true
        submitBtn.textContent = 'Logging in...'
        
        try {
            const { data, error } = await supabase.auth.signInWithPassword({
                email,
                password
            })
            
            if (error) throw error
            
            // Check if user profile exists
            const { data: userData, error: profileError } = await supabase
                .from('users')
                .select('*')
                .eq('id', data.user.id)
                .single()
            
            if (profileError && profileError.code === 'PGRST116') {
                // Profile doesn't exist, create one
                const { error: createError } = await supabase
                    .from('users')
                    .insert([{
                        id: data.user.id,
                        username: data.user.email.split('@')[0],
                        display_name: data.user.email.split('@')[0],
                        created_at: new Date()
                    }])
                
                if (createError) {
                    console.error('Error creating profile:', createError)
                }
                
                // Create wallet for user
                await supabase
                    .from('wallets')
                    .insert([{
                        user_id: data.user.id,
                        sa_balance: 100, // Starting bonus
                        usd_balance: 0,
                        created_at: new Date()
                    }])
                
                // Create creator stats
                await supabase
                    .from('creator_stats')
                    .insert([{
                        user_id: data.user.id,
                        daily_sa_earned: 0,
                        last_reset_date: new Date()
                    }])
            }
            
            showMessage('Login successful! Redirecting...', 'success')
            setTimeout(() => {
                window.location.href = '/feed.html'
            }, 1000)
            
        } catch (error) {
            console.error('Login error:', error)
            showMessage(error.message || 'Login failed. Please check your credentials.', 'error')
        } finally {
            submitBtn.disabled = false
            submitBtn.textContent = 'Log In'
        }
    })

    // Forgot password
    if (forgotPassword) {
        forgotPassword.addEventListener('click', async (e) => {
            e.preventDefault()
            const email = prompt('Please enter your email address:')
            if (!email) return
            
            const { error } = await supabase.auth.resetPasswordForEmail(email, {
                redirectTo: `${window.location.origin}/reset-password.html`
            })
            
            if (error) {
                showMessage('Error sending reset email: ' + error.message, 'error')
            } else {
                showMessage('Password reset email sent! Check your inbox.', 'success')
            }
        })
    }

    // Social login
    if (googleBtn) {
        googleBtn.addEventListener('click', () => {
            supabase.auth.signInWithOAuth({
                provider: 'google',
                options: {
                    redirectTo: `${window.location.origin}/feed.html`
                }
            })
        })
    }

    if (githubBtn) {
        githubBtn.addEventListener('click', () => {
            supabase.auth.signInWithOAuth({
                provider: 'github',
                options: {
                    redirectTo: `${window.location.origin}/feed.html`
                }
            })
        })
    }

    function showMessage(text, type) {
        messageDiv.textContent = text
        messageDiv.className = `message ${type}`
        messageDiv.style.display = 'block'
        
        setTimeout(() => {
            messageDiv.style.display = 'none'
        }, 5000)
    }
})