// public/js/messages/indicators.js
import { supabase } from '../config/supabase.js';

let typingChannels = new Map();
let presenceChannels = new Map();

export function setupTypingIndicator(userId, currentUserId) {
    const channelId = `typing:${Math.min(userId, currentUserId)}:${Math.max(userId, currentUserId)}`;
    
    if (typingChannels.has(channelId)) {
        return; // Already set up
    }

    // Create a channel for typing indicators
    const channel = supabase.channel(channelId, {
        config: {
            broadcast: { self: false }
        }
    });

    channel
        .on('broadcast', { event: 'typing' }, (payload) => {
            if (payload.payload.userId === userId) {
                showTypingIndicator(userId, payload.payload.isTyping);
            }
        })
        .subscribe();

    typingChannels.set(channelId, channel);

    return channel;
}

export function sendTypingStatus(userId, currentUserId, isTyping) {
    const channelId = `typing:${Math.min(userId, currentUserId)}:${Math.max(userId, currentUserId)}`;
    const channel = typingChannels.get(channelId);
    
    if (channel) {
        channel.send({
            type: 'broadcast',
            event: 'typing',
            payload: {
                userId: currentUserId,
                isTyping: isTyping
            }
        });
    }
}

function showTypingIndicator(userId, isTyping) {
    const typingIndicator = document.getElementById('typingIndicator');
    const typingUserName = document.getElementById('typingUserName');
    
    if (!typingIndicator || !typingUserName) return;

    if (isTyping) {
        // Get user name
        const conversationItem = document.querySelector(`.conversation-item[data-user-id="${userId}"]`);
        if (conversationItem) {
            const userName = conversationItem.querySelector('.name').textContent;
            typingUserName.textContent = userName;
        }
        typingIndicator.classList.remove('hidden');
    } else {
        typingIndicator.classList.add('hidden');
    }
}

export function setupPresence(userId) {
    if (presenceChannels.has(userId)) {
        return;
    }

    const channel = supabase.channel(`presence:${userId}`, {
        config: {
            presence: {
                key: userId
            }
        }
    });

    channel
        .on('presence', { event: 'sync' }, () => {
            const state = channel.presenceState();
            updateOnlineStatus(userId, Object.keys(state).length > 0);
        })
        .subscribe((status) => {
            if (status === 'SUBSCRIBED') {
                channel.track({ online_at: new Date().toISOString() });
            }
        });

    presenceChannels.set(userId, channel);
}

function updateOnlineStatus(userId, isOnline) {
    const userStatus = document.getElementById('userStatus');
    const onlineIndicator = document.querySelector(`.conversation-item[data-user-id="${userId}"] .online-indicator`);
    
    if (userStatus) {
        userStatus.textContent = isOnline ? 'Online' : 'Offline';
        userStatus.style.color = isOnline ? '#00ba7c' : 'var(--text-secondary)';
    }
    
    if (onlineIndicator) {
        onlineIndicator.style.display = isOnline ? 'block' : 'none';
    }
}

export function cleanupIndicators() {
    // Clean up typing channels
    typingChannels.forEach(channel => {
        supabase.removeChannel(channel);
    });
    typingChannels.clear();

    // Clean up presence channels
    presenceChannels.forEach(channel => {
        supabase.removeChannel(channel);
    });
    presenceChannels.clear();
}
