import { supabase, getCurrentUser } from '../config/supabase.js'

// Initialize Stripe
let stripe = null
if (typeof Stripe !== 'undefined') {
    stripe = Stripe('your-stripe-publishable-key')
}

export async function initiateVerification() {
    const user = await getCurrentUser()
    if (!user) return

    // Check if already verified
    if (user.is_verified) {
        alert('You are already verified!')
        return
    }

    // Check minimum followers
    const { data: stats, error } = await supabase
        .from('users')
        .select('followers_count')
        .eq('id', user.id)
        .single()

    if (error || (stats.followers_count || 0) < 3000) {
        alert('You need at least 3,000 followers to apply for verification.')
        return
    }

    // Determine payment method based on location
    const { data: locationData } = await supabase
        .from('user_locations')
        .select('country')
        .eq('user_id', user.id)
        .single()

    const country = locationData?.country || 'US'
    const isNigeria = country === 'NG'

    if (isNigeria) {
        await initiatePaystackPayment(10000, 'verification', user) // 10000 NGN = ~$10
    } else {
        await initiateStripePayment(1000, 'verification', user) // 1000 cents = $10
    }
}

async function initiateStripePayment(amount, type, user) {
    try {
        // Create payment intent
        const response = await fetch('/api/create-payment-intent', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                amount,
                currency: 'usd',
                metadata: {
                    type,
                    user_id: user.id
                }
            })
        })

        const { clientSecret } = await response.json()

        // Confirm payment
        const { error } = await stripe.confirmCardPayment(clientSecret, {
            payment_method: {
                card: elements.getElement(CardElement),
                billing_details: {
                    name: user.display_name || user.username,
                    email: user.email
                }
            }
        })

        if (error) throw error

        // Update user verification status
        await supabase
            .from('users')
            .update({ is_verified: true })
            .eq('id', user.id)

        // Record transaction
        await supabase
            .from('transactions')
            .insert([{
                user_id: user.id,
                type: 'verification',
                amount: amount / 100, // Convert cents to dollars
                currency: 'USD',
                status: 'completed'
            }])

        alert('Verification successful! You are now a verified creator.')

    } catch (error) {
        console.error('Payment error:', error)
        alert('Payment failed: ' + error.message)
    }
}

async function initiatePaystackPayment(amount, type, user) {
    const handler = PaystackPop.setup({
        key: 'your-paystack-public-key',
        email: user.email,
        amount: amount * 100, // Convert to kobo
        currency: 'NGN',
        ref: `${type}_${user.id}_${Date.now()}`,
        callback: async function(response) {
            if (response.status === 'success') {
                // Update user verification status
                await supabase
                    .from('users')
                    .update({ is_verified: true })
                    .eq('id', user.id)

                // Record transaction
                await supabase
                    .from('transactions')
                    .insert([{
                        user_id: user.id,
                        type: 'verification',
                        amount: amount / 100, // Convert kobo to NGN
                        currency: 'NGN',
                        status: 'completed',
                        metadata: { reference: response.reference }
                    }])

                alert('Verification successful! You are now a verified creator.')
            } else {
                alert('Payment failed. Please try again.')
            }
        },
        onClose: function() {
            alert('Transaction was not completed, window closed.');
        }
    })
    
    handler.openIframe();
}

export async function createSubscription(creatorId, amount, currency = 'USD') {
    const user = await getCurrentUser()
    if (!user) return

    // Check if already subscribed
    const { data: existingSub } = await supabase
        .from('subscriptions')
        .select('id')
        .eq('creator_id', creatorId)
        .eq('subscriber_id', user.id)
        .eq('status', 'active')
        .single()

    if (existingSub) {
        alert('You are already subscribed to this creator!')
        return
    }

    const isNigeria = currency === 'NGN'
    const amountInCents = isNigeria ? amount * 100 : amount // NGN in kobo, USD in cents

    if (isNigeria) {
        await initiatePaystackSubscription(creatorId, amountInCents, currency, user)
    } else {
        await initiateStripeSubscription(creatorId, amountInCents, currency, user)
    }
}

async function initiateStripeSubscription(creatorId, amount, currency, user) {
    try {
        // Create subscription via backend
        const response = await fetch('/api/create-subscription', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                creator_id: creatorId,
                subscriber_id: user.id,
                amount,
                currency,
                email: user.email
            })
        })

        const { sessionId } = await response.json()

        // Redirect to checkout
        const { error } = await stripe.redirectToCheckout({ sessionId })

        if (error) throw error

    } catch (error) {
        console.error('Subscription error:', error)
        alert('Failed to create subscription: ' + error.message)
    }
}

export async function processWithdrawal(amount, currency, method) {
    const user = await getCurrentUser()
    if (!user) return

    // Check minimum withdrawal
    const minAmount = 10 // $10 minimum
    if (amount < minAmount) {
        alert(`Minimum withdrawal amount is $${minAmount}`)
        return
    }

    // Check USD balance
    const { data: wallet, error: walletError } = await supabase
        .from('wallets')
        .select('usd_balance')
        .eq('user_id', user.id)
        .single()

    if (walletError || wallet.usd_balance < amount) {
        alert('Insufficient USD balance')
        return
    }

    try {
        // Create withdrawal request
        const { data, error } = await supabase
            .from('transactions')
            .insert([{
                user_id: user.id,
                type: 'withdrawal',
                amount: -amount,
                currency,
                status: 'pending',
                metadata: { method }
            }])
            .select()
            .single()

        if (error) throw error

        // Process withdrawal via appropriate gateway
        if (method === 'paystack' && currency === 'NGN') {
            await processPaystackWithdrawal(user, amount, data.id)
        } else if (method === 'stripe' && currency === 'USD') {
            await processStripeWithdrawal(user, amount, data.id)
        } else {
            throw new Error('Invalid withdrawal method for currency')
        }

        // Update wallet balance
        await supabase
            .from('wallets')
            .update({ usd_balance: wallet.usd_balance - amount })
            .eq('user_id', user.id)

        // Update transaction status
        await supabase
            .from('transactions')
            .update({ status: 'completed' })
            .eq('id', data.id)

        alert('Withdrawal processed successfully!')

    } catch (error) {
        console.error('Withdrawal error:', error)
        alert('Withdrawal failed: ' + error.message)
    }
}

async function processPaystackWithdrawal(user, amount, transactionId) {
    // Implement Paystack transfer API call
    const response = await fetch('/api/paystack-transfer', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            amount: amount * 100, // Convert to kobo
            recipient: user.paystack_recipient_code,
            reference: `withdrawal_${transactionId}`
        })
    })

    const result = await response.json()
    
    if (!result.status) {
        throw new Error(result.message || 'Paystack transfer failed')
    }
}

async function processStripeWithdrawal(user, amount, transactionId) {
    // Implement Stripe transfer API call
    const response = await fetch('/api/stripe-transfer', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            amount: amount * 100, // Convert to cents
            destination: user.stripe_account_id,
            description: `Withdrawal for transaction ${transactionId}`
        })
    })

    const result = await response.json()
    
    if (!result.success) {
        throw new Error(result.error || 'Stripe transfer failed')
    }
}