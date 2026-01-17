import { supabase, getCurrentUser } from '../config/supabase.js'
import { uploadMedia } from '../utils/uploadMedia.js'

export async function sendMessage(chatId, content, mediaFile = null) {
    const user = await getCurrentUser()
    if (!user) return null

    try {
        let mediaUrl = null
        let mediaType = null

        // Upload media if present
        if (mediaFile) {
            const uploadResult = await uploadMedia(mediaFile, 'messages')
            if (uploadResult) {
                mediaUrl = uploadResult.url
                mediaType = uploadResult.type
            }
        }

        // Insert message
        const { data, error } = await supabase
            .from('messages')
            .insert([{
                chat_id: chatId,
                sender_id: user.id,
                content,
                media_url: mediaUrl,
                media_type: mediaType
            }])
            .select()
            .single()

        if (error) throw error

        // Update chat's updated_at
        await supabase
            .from('chats')
            .update({ updated_at: new Date() })
            .eq('id', chatId)

        return data

    } catch (error) {
        console.error('Error sending message:', error)
        return null
    }
}

export async function markAsRead(messageId) {
    try {
        await supabase
            .from('messages')
            .update({ is_read: true })
            .eq('id', messageId)
    } catch (error) {
        console.error('Error marking message as read:', error)
    }
}

export function setupTypingIndicator(chatId) {
    let typingTimeout = null
    const TYPING_TIMEOUT = 3000 // 3 seconds

    return {
        startTyping: async () => {
            // Send typing event via Supabase Realtime
            await supabase
                .from('typing_indicators')
                .upsert({
                    chat_id: chatId,
                    user_id: (await getCurrentUser()).id,
                    is_typing: true,
                    updated_at: new Date()
                })

            // Clear previous timeout
            if (typingTimeout) {
                clearTimeout(typingTimeout)
            }

            // Set timeout to stop typing indicator
            typingTimeout = setTimeout(() => {
                stopTyping()
            }, TYPING_TIMEOUT)
        },

        stopTyping: async () => {
            if (typingTimeout) {
                clearTimeout(typingTimeout)
                typingTimeout = null
            }

            await supabase
                .from('typing_indicators')
                .upsert({
                    chat_id: chatId,
                    user_id: (await getCurrentUser()).id,
                    is_typing: false,
                    updated_at: new Date()
                })
        }
    }
}

// Subscribe to typing indicators
export function subscribeToTyping(chatId, callback) {
    const subscription = supabase
        .channel(`typing:${chatId}`)
        .on(
            'postgres_changes',
            {
                event: '*',
                schema: 'public',
                table: 'typing_indicators',
                filter: `chat_id=eq.${chatId}`
            },
            (payload) => {
                callback(payload)
            }
        )
        .subscribe()

    return subscription
}

// Subscribe to new messages
export function subscribeToMessages(chatId, callback) {
    const subscription = supabase
        .channel(`messages:${chatId}`)
        .on(
            'postgres_changes',
            {
                event: 'INSERT',
                schema: 'public',
                table: 'messages',
                filter: `chat_id=eq.${chatId}`
            },
            (payload) => {
                callback(payload.new)
            }
        )
        .subscribe()

    return subscription
}