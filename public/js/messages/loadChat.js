// public/js/messages/loadChats.js
import { supabase } from '../config/supabase.js';
import { getCurrentUser } from '../guards/authGuard.js';

let currentUserId = null;
let currentChatId = null;
let typingTimeout = null;
let chatSubscription = null;

document.addEventListener('DOMContentLoaded', async () => {
    const user = await getCurrentUser();
    if (!user) return;

    currentUserId = user.id;
    
    // Load conversations
    loadConversations();
    
    // Setup search
    const searchInput = document.getElementById('searchConversations');
    searchInput.addEventListener('input', debounce(searchConversations, 300));
});

async function loadConversations() {
    const conversationsList = document.getElementById('conversationsList');
    
    try {
        // Get unique conversations (group by other user)
        const { data: messages, error } = await supabase
            .from('messages')
            .select(`
                *,
                sender:profiles!messages_sender_id_fkey(
                    id,
                    username,
                    display_name,
                    avatar_url
                ),
                receiver:profiles!messages_receiver_id_fkey(
                    id,
                    username,
                    display_name,
                    avatar_url
                )
            `)
            .or(`sender_id.eq.${currentUserId},receiver_id.eq.${currentUserId}`)
            .order('created_at', { ascending: false });

        if (error) throw error;

        // Group messages by conversation (other user)
        const conversations = {};
        messages.forEach(message => {
            const otherUserId = message.sender_id === currentUserId 
                ? message.receiver_id 
                : message.sender_id;
            
            const otherUser = message.sender_id === currentUserId 
                ? message.receiver 
                : message.sender;
            
            if (!conversations[otherUserId]) {
                conversations[otherUserId] = {
                    user: otherUser,
                    lastMessage: message,
                    unreadCount: message.receiver_id === currentUserId && !message.is_read ? 1 : 0
                };
            } else {
                // Update unread count
                if (message.receiver_id === currentUserId && !message.is_read) {
                    conversations[otherUserId].unreadCount++;
                }
                
                // Keep the most recent message
                if (new Date(message.created_at) > new Date(conversations[otherUserId].lastMessage.created_at)) {
                    conversations[otherUserId].lastMessage = message;
                }
            }
        });

        // Clear loading state
        conversationsList.innerHTML = '';

        if (Object.keys(conversations).length === 0) {
            conversationsList.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-comments"></i>
                    <h3>No conversations yet</h3>
                    <p>Start a new conversation to send messages.</p>
                </div>
            `;
            return;
        }

        // Create conversation items
        for (const [userId, conversation] of Object.entries(conversations)) {
            const conversationItem = createConversationItem(userId, conversation);
            conversationsList.appendChild(conversationItem);
        }

    } catch (error) {
        console.error('Error loading conversations:', error);
        conversationsList.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-exclamation-circle"></i>
                <h3>Error loading conversations</h3>
                <p>Please try again later</p>
            </div>
        `;
    }
}

function createConversationItem(userId, conversation) {
    const item = document.createElement('div');
    item.className = 'conversation-item';
    item.dataset.userId = userId;

    const lastMessage = conversation.lastMessage;
    const isSentByMe = lastMessage.sender_id === currentUserId;
    const messagePreview = isSentByMe 
        ? `You: ${lastMessage.content || 'Media'}`
        : lastMessage.content || 'Media';

    const formattedTime = formatMessageTime(new Date(lastMessage.created_at));
    const unreadCount = conversation.unreadCount > 0 
        ? `<div class="unread-count">${conversation.unreadCount}</div>` 
        : '';

    item.innerHTML = `
        <div class="conversation-avatar">
            <img src="${conversation.user.avatar_url || '/assets/avatar.png'}" 
                 alt="${conversation.user.display_name}">
        </div>
        <div class="conversation-info">
            <div class="name">${escapeHtml(conversation.user.display_name)}</div>
            <div class="last-message">${escapeHtml(messagePreview)}</div>
        </div>
        <div class="conversation-meta">
            <div class="conversation-time">${formattedTime}</div>
            ${unreadCount}
        </div>
    `;

    item.addEventListener('click', () => openChat(userId, conversation.user));

    return item;
}

async function openChat(userId, user) {
    currentChatId = userId;

    // Update UI
    document.getElementById('activeChat').classList.remove('hidden');
    document.getElementById('chatArea').classList.add('hidden');

    // Update chat header
    document.getElementById('chatUserName').textContent = user.display_name;
    document.getElementById('chatAvatar').src = user.avatar_url || '/assets/avatar.png';

    // Load messages
    await loadMessages(userId);

    // Mark messages as read
    await markMessagesAsRead(userId);

    // Remove unread badge
    const conversationItem = document.querySelector(`.conversation-item[data-user-id="${userId}"]`);
    if (conversationItem) {
        conversationItem.querySelector('.unread-count')?.remove();
    }

    // Setup realtime subscription for this chat
    setupChatSubscription(userId);

    // Setup typing indicator
    setupTypingIndicator(userId);
}

async function loadMessages(userId) {
    const messagesContainer = document.getElementById('messagesContainer');
    
    try {
        // Get messages between current user and selected user
        const { data: messages, error } = await supabase
            .from('messages')
            .select(`
                *,
                sender:profiles!messages_sender_id_fkey(
                    username,
                    display_name,
                    avatar_url
                )
            `)
            .or(`and(sender_id.eq.${currentUserId},receiver_id.eq.${userId}),and(sender_id.eq.${userId},receiver_id.eq.${currentUserId})`)
            .order('created_at', { ascending: true });

        if (error) throw error;

        // Clear container
        messagesContainer.innerHTML = '';

        if (messages.length === 0) {
            messagesContainer.innerHTML = `
                <div class="empty-state">
                    <p>No messages yet. Start the conversation!</p>
                </div>
            `;
            return;
        }

        // Add messages to container
        messages.forEach(message => {
            const messageElement = createMessageElement(message);
            messagesContainer.appendChild(messageElement);
        });

        // Scroll to bottom
        messagesContainer.scrollTop = messagesContainer.scrollHeight;

    } catch (error) {
        console.error('Error loading messages:', error);
        messagesContainer.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-exclamation-circle"></i>
                <p>Error loading messages</p>
            </div>
        `;
    }
}

function createMessageElement(message) {
    const isSent = message.sender_id === currentUserId;
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${isSent ? 'sent' : 'received'}`;
    
    const formattedTime = formatMessageTime(new Date(message.created_at));
    const mediaHtml = message.media_url ? createMessageMediaHtml(message) : '';

    messageDiv.innerHTML = `
        <div class="message-avatar">
            <img src="${message.sender.avatar_url || '/assets/avatar.png'}" 
                 alt="${message.sender.display_name}">
        </div>
        <div class="message-content">
            <div class="message-bubble">
                ${message.content ? `<div class="message-text">${escapeHtml(message.content)}</div>` : ''}
                ${mediaHtml}
            </div>
            <div class="message-time">
                ${formattedTime}
                ${isSent ? `
                    <span class="message-status">
                        <i class="fas fa-${message.is_read ? 'check-double' : 'check'}"></i>
                    </span>
                ` : ''}
            </div>
        </div>
    `;

    return messageDiv;
}

function createMessageMediaHtml(message) {
    if (message.media_type === 'image') {
        return `
            <div class="message-media">
                <img src="${message.media_url}" alt="Image" loading="lazy">
            </div>
        `;
    } else if (message.media_type === 'video') {
        return `
            <div class="message-media">
                <video src="${message.media_url}" controls></video>
            </div>
        `;
    } else if (message.media_type) {
        // For documents/files
        const fileName = message.media_url.split('/').pop();
        return `
            <div class="message-media file">
                <a href="${message.media_url}" target="_blank" class="file-link">
                    <i class="fas fa-file"></i>
                    <span>${fileName}</span>
                </a>
            </div>
        `;
    }
    return '';
}

async function markMessagesAsRead(userId) {
    try {
        await supabase
            .from('messages')
            .update({ is_read: true })
            .eq('sender_id', userId)
            .eq('receiver_id', currentUserId)
            .eq('is_read', false);
    } catch (error) {
        console.error('Error marking messages as read:', error);
    }
}

function setupChatSubscription(userId) {
    // Remove existing subscription
    if (chatSubscription) {
        supabase.removeChannel(chatSubscription);
    }

    // Subscribe to new messages in this chat
    chatSubscription = supabase
        .channel(`chat:${Math.min(currentUserId, userId)}:${Math.max(currentUserId, userId)}`)
        .on('postgres_changes', 
            {
                event: 'INSERT',
                schema: 'public',
                table: 'messages',
                filter: `or(and(sender_id.eq.${currentUserId},receiver_id.eq.${userId}),and(sender_id.eq.${userId},receiver_id.eq.${currentUserId}))`
            },
            async (payload) => {
                const messagesContainer = document.getElementById('messagesContainer');
                const messageElement = createMessageElement(payload.new);
                messagesContainer.appendChild(messageElement);
                
                // Scroll to bottom
                messagesContainer.scrollTop = messagesContainer.scrollHeight;

                // Mark as read if message is for current user
                if (payload.new.receiver_id === currentUserId) {
                    await supabase
                        .from('messages')
                        .update({ is_read: true })
                        .eq('id', payload.new.id);
                }
            }
        )
        .subscribe();
}

function setupTypingIndicator(userId) {
    const messageInput = document.getElementById('messageInput');
    const typingIndicator = document.getElementById('typingIndicator');
    
    let typing = false;
    let lastTypingTime = 0;

    // Listen for typing
    messageInput.addEventListener('input', () => {
        const now = Date.now();
        if (!typing && now - lastTypingTime > 1000) {
            typing = true;
            // Send typing status (you would need to implement this in Supabase)
            sendTypingStatus(userId, true);
        }
        lastTypingTime = now;
    });

    // Clear typing status after 2 seconds of no typing
    messageInput.addEventListener('blur', () => {
        if (typing) {
            typing = false;
            sendTypingStatus(userId, false);
        }
    });
}

function sendTypingStatus(userId, isTyping) {
    // This would typically be done through a separate "typing_status" table
    // or using Supabase Realtime presence
    console.log(`Typing ${isTyping ? 'started' : 'stopped'} for user ${userId}`);
}

function searchConversations(event) {
    const searchTerm = event.target.value.toLowerCase();
    const conversationItems = document.querySelectorAll('.conversation-item');
    
    conversationItems.forEach(item => {
        const name = item.querySelector('.name').textContent.toLowerCase();
        const lastMessage = item.querySelector('.last-message').textContent.toLowerCase();
        
        if (name.includes(searchTerm) || lastMessage.includes(searchTerm)) {
            item.style.display = 'flex';
        } else {
            item.style.display = 'none';
        }
    });
}

function formatMessageTime(date) {
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m`;
    if (diffHours < 24) return `${diffHours}h`;
    if (diffDays < 7) return `${diffDays}d`;
    
    return date.toLocaleDateString();
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}
