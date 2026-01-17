import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { user_id, interaction_type, metadata } = await req.json()

    // Validate user is verified
    const { data: user, error: userError } = await supabaseClient
      .from('users')
      .select('is_verified')
      .eq('id', user_id)
      .single()

    if (userError || !user?.is_verified) {
      return new Response(
        JSON.stringify({ error: 'User not verified or not found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    // Check daily cap
    const { data: stats } = await supabaseClient
      .from('creator_stats')
      .select('*')
      .eq('user_id', user_id)
      .single()

    const today = new Date().toDateString()
    const lastReset = new Date(stats?.last_reset_date || 0).toDateString()
    
    let dailyEarned = stats?.daily_sa_earned || 0
    
    if (today !== lastReset) {
      await supabaseClient
        .from('creator_stats')
        .update({
          daily_sa_earned: 0,
          last_reset_date: new Date().toISOString()
        })
        .eq('user_id', user_id)
      dailyEarned = 0
    }

    const DAILY_SA_CAP = 500
    const SA_PER_INTERACTION = 0.5

    if (dailyEarned >= DAILY_SA_CAP) {
      return new Response(
        JSON.stringify({ reward: 0, message: 'Daily cap reached' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Calculate reward
    const reward = SA_PER_INTERACTION
    const newDailyEarned = Math.min(dailyEarned + reward, DAILY_SA_CAP)

    // Update wallet
    const { data: wallet } = await supabaseClient
      .from('wallets')
      .select('sa_balance')
      .eq('user_id', user_id)
      .single()

    await supabaseClient
      .from('wallets')
      .update({ sa_balance: (wallet?.sa_balance || 0) + reward })
      .eq('user_id', user_id)

    // Update stats
    await supabaseClient
      .from('creator_stats')
      .update({ daily_sa_earned: newDailyEarned })
      .eq('user_id', user_id)

    // Record transaction
    await supabaseClient
      .from('transactions')
      .insert([{
        user_id,
        type: 'reward',
        amount: reward,
        currency: 'SA',
        status: 'completed',
        metadata: {
          interaction_type,
          ...metadata
        }
      }])

    return new Response(
      JSON.stringify({ reward, daily_earned: newDailyEarned, remaining: DAILY_SA_CAP - newDailyEarned }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})