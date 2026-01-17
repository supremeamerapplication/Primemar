import { supabase, getCurrentUser } from '../config/supabase.js'

const SA_PER_INTERACTION = 0.5
const DAILY_SA_CAP = 500
const SA_TO_USD_RATE = 0.01

export async function rewardSA(userId, interactionType, metadata = {}) {
    try {
        // Check daily cap
        const { data: stats, error: statsError } = await supabase
            .from('creator_stats')
            .select('*')
            .eq('user_id', userId)
            .single()

        if (statsError) {
            // Create stats if not exists
            await supabase
                .from('creator_stats')
                .insert([{
                    user_id: userId,
                    daily_sa_earned: 0,
                    last_reset_date: new Date()
                }])
            
            return await rewardSA(userId, interactionType, metadata)
        }

        // Reset daily earnings if it's a new day
        const today = new Date().toDateString()
        const lastReset = new Date(stats.last_reset_date).toDateString()
        
        if (today !== lastReset) {
            await supabase
                .from('creator_stats')
                .update({
                    daily_sa_earned: 0,
                    last_reset_date: new Date()
                })
                .eq('user_id', userId)
        }

        // Check if cap reached
        if (stats.daily_sa_earned >= DAILY_SA_CAP) {
            console.log('Daily SA cap reached for user:', userId)
            return 0 // No reward
        }

        // Calculate reward
        let reward = SA_PER_INTERACTION
        
        // Check if user is verified (only verified creators earn SA)
        const { data: user, error: userError } = await supabase
            .from('users')
            .select('is_verified')
            .eq('id', userId)
            .single()

        if (userError || !user.is_verified) {
            return 0 // Non-verified users don't earn SA
        }

        // Update wallet
        const { data: wallet, error: walletError } = await supabase
            .from('wallets')
            .select('sa_balance')
            .eq('user_id', userId)
            .single()

        if (walletError) {
            console.error('Wallet error:', walletError)
            return 0
        }

        const newBalance = wallet.sa_balance + reward
        const newDailyEarned = Math.min(stats.daily_sa_earned + reward, DAILY_SA_CAP)

        // Update wallet and stats
        await supabase
            .from('wallets')
            .update({ sa_balance: newBalance })
            .eq('user_id', userId)

        await supabase
            .from('creator_stats')
            .update({ daily_sa_earned: newDailyEarned })
            .eq('user_id', userId)

        // Record transaction
        await supabase
            .from('transactions')
            .insert([{
                user_id: userId,
                type: 'reward',
                amount: reward,
                currency: 'SA',
                status: 'completed',
                metadata: {
                    interaction_type: interactionType,
                    ...metadata
                }
            }])

        return reward

    } catch (error) {
        console.error('Error rewarding SA:', error)
        return 0
    }
}

export async function checkDailyCap(userId) {
    try {
        const { data: stats, error } = await supabase
            .from('creator_stats')
            .select('daily_sa_earned')
            .eq('user_id', userId)
            .single()

        if (error) return { earned: 0, remaining: DAILY_SA_CAP }

        const remaining = Math.max(0, DAILY_SA_CAP - stats.daily_sa_earned)
        return {
            earned: stats.daily_sa_earned,
            remaining: remaining,
            percentage: (stats.daily_sa_earned / DAILY_SA_CAP) * 100
        }

    } catch (error) {
        console.error('Error checking daily cap:', error)
        return { earned: 0, remaining: DAILY_SA_CAP }
    }
}

export async function convertSATOUSD(saAmount, userId) {
    const usdAmount = saAmount * SA_TO_USD_RATE
    
    // Update wallet
    const { data: wallet, error } = await supabase
        .from('wallets')
        .select('sa_balance, usd_balance')
        .eq('user_id', userId)
        .single()

    if (error) throw error

    if (wallet.sa_balance < saAmount) {
        throw new Error('Insufficient SA balance')
    }

    // Update balances
    await supabase
        .from('wallets')
        .update({
            sa_balance: wallet.sa_balance - saAmount,
            usd_balance: wallet.usd_balance + usdAmount
        })
        .eq('user_id', userId)

    // Record transaction
    await supabase
        .from('transactions')
        .insert([{
            user_id: userId,
            type: 'conversion',
            amount: saAmount,
            currency: 'SA',
            status: 'completed',
            metadata: { usd_amount: usdAmount }
        }])

    return usdAmount
}

// Run daily reset at midnight UTC
export async function runDailyReset() {
    try {
        const { error } = await supabase
            .from('creator_stats')
            .update({
                daily_sa_earned: 0,
                last_reset_date: new Date()
            })
            .lt('last_reset_date', new Date().toDateString())

        if (error) {
            console.error('Error in daily reset:', error)
        } else {
            console.log('Daily reset completed')
        }
    } catch (error) {
        console.error('Error running daily reset:', error)
    }
}

// Schedule daily reset (this would be run via Supabase Edge Functions)
function scheduleDailyReset() {
    const now = new Date()
    const utcMidnight = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0)
    )
    
    const timeUntilReset = utcMidnight.getTime() - now.getTime()
    
    setTimeout(() => {
        runDailyReset()
        // Schedule next reset
        setInterval(runDailyReset, 24 * 60 * 60 * 1000)
    }, timeUntilReset)
}

// Start scheduler when module loads
scheduleDailyReset()