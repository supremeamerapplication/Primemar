// public/js/messages/sendMessage.js
import { supabase } from '../config/supabase.js';
import { getCurrentUser } from '../guards/authGuard.js';

let currentUserId = null;
let selectedUsers = new Set();

document.addEventListener('DOMContentLoaded', async () => {
    const user = await getCurrentUser();
    if (!user) return;

    currentUserId = user.id;

    // Setup message input
    const messageInput = document.getElementById('messageInput');
    const sendMessageBtn = document.getElementById('sendMessageBtn');
    const attachMediaBtn = document.getElementById('attachMediaBtn');
    const attachFileBtn = document.getElementById('attachFileBtn');
    const mediaUpload = document.getElementById('mediaUpload');
    const fileUpload = document.getElementById('fileUpload');
    const messagePreview = document.getElementById('messagePreview');

    let currentAttachment = null;
    let attachmentType = null;

    // Message input handler
    messageInput.addEventListener('input', () => {
        const hasContent = messageInput.value.trim().length > 0 || currentAttachment;
        sendMessageBtn.disabled = !hasContent;

        // Auto-resize textarea
        messageInput.style.height = 'auto';
        messageInput.style.height = Math.min(messageInput.scrollHeight, 120) + 'px';
    });

    // Attachment handlers
    attachMediaBtn.addEventListener('click', () => {
        mediaUpload.click();
    });

    attachFileBtn.addEventListener('click', () => {
        fileUpload.click();
    });

    mediaUpload.addEventListener('change', (e) => handleAttachmentUpload(e, 'media'));
    fileUpload.addEventListener('change', (e) => handleAttachmentUpload(e, 'file'));

    // Send message
    sendMessageBtn.addEventListener('click', sendMessage);

    // New message modal handlers
    const nextBtn = document.getElementById('nextBtn');
    const searchUsersInput = document.getElementById('searchUsersInput');
    const usersList = document.getElementById('usersList');

    nextBtn.addEventListener('click', startNewChat);
    searchUsersInput.addEventListener('input', debounce(searchUsers, 300));

    // Load initial user list
    loadUsers();
});

async function handleAttachmentUpload(event, type) {
    const file = event.target.files[0];
    if (!file) return;

    // Validate file size (10MB for media, 20MB for files)
    const maxSize = type === 'media' ? 10 * 1024 * 1024 : 20 * 1024 * 1024;
    if (file.size > maxSize) {
        alert(`File size must be less than ${type === 'media' ? '10MB' : '20MB'}`);
        return;
    }

    currentAttachment = file;
    attachmentType = type;

    // Show preview for images
    if (type === 'media' && file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (e) => {
            messagePreview.innerHTML = `
                <img src="${e.target.result}" alt="Preview">
                <button type="button" class="remove-preview" id="removePreview">
                    <i class="fas fa-times"></i>
                </button>
            `;
            messagePreview.style.display = 'block';
            
            document.getElementById('removePreview').addEventListener('click', removeAttachment);
        };
        reader.readAsDataURL(file);
    } else if (type === 'media' && file.type.startsWith('video/')) {
        const url = URL.createObjectURL(file);
        messagePreview.innerHTML = `
            <video src="${url}" controls></video>
            <button type="button" class="remove-preview" id="removePreview">
                <i class="fas fa-times"></i>
            </button>
        `;
        messagePreview.style.display = 'block';
        
        document.getElementById('removePreview').addEventListener('click', removeAttachment);
    }

    // Enable send button
    document.getElementById('sendMessageBtn').disabled = false;
}

function removeAttachment() {
    currentAttachment = null;
    attachmentType = null;
    messagePreview.style.display = 'none';
    messagePreview.innerHTML = '';
    
    // Disable send button if no content
    const messageInput = document.getElementById('messageInput');
    if (messageInput.value.trim().length === 0) {
        document.getElementById('sendMessageBtn').disabled = true;
    }
}

async function sendMessage() {
    const messageInput = document.getElementById('messageInput');
    const content = messageInput.value.trim();
    const receiverId = currentChatId;

    if (!content && !currentAttachment) {
        alert('Please enter a message or attach a file');
        return;
    }

    // Disable send button during upload
    const sendBtn = document.getElementById('sendMessageBtn');
    sendBtn.disabled = true;
    sendBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

    try {
        let mediaUrl = null;
        let mediaType = null;

        // Upload attachment if exists
        if (currentAttachment) {
            const fileExt = currentAttachment.name.split('.').pop();
            const fileName = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}.${fileExt}`;
            const filePath = `messages/${currentUserId}/${receiverId}/${fileName}`;

            const bucket = attachmentType === 'media' ? 'message-attachments' : 'message-attachments';

            const { data: uploadData, error: uploadError } = await supabase.storage
                .from(bucket)
                .upload(filePath, currentAttachment);

            if (uploadError) throw uploadError;

            // Get public URL
            const { data: urlData } = supabase.storage
                .from(bucket)
                .getPublicUrl(filePath);

            mediaUrl = urlData.publicUrl;
            
            // Determine media type
            if (currentAttachment.type.startsWith('image/')) {
                mediaType = 'image';
            } else if (currentAttachment.type.startsWith('video/')) {
                mediaType = 'video';
            } else {
                mediaType = 'file';
            }
        }

        // Insert message into database
        const { data: message, error: messageError } = await supabase
            .from('messages')
            .insert([
                {
                    sender_id: currentUserId,
                    receiver_id: receiverId,
                    content: content || null,
                    media_url: mediaUrl,
                    media_type: mediaType,
                    is_read: false
                }
            ])
            .select()
            .single();

        if (messageError) throw messageError;

        // Clear input and attachment
        messageInput.value = '';
        messageInput.style.height = 'auto';
        removeAttachment();

        // Send notification
        await sendNotification(receiverId, 'message', null, message.id);

    } catch (error) {
        console.error('Error sending message:', error);
        alert('Failed to send message. Please try again.');
    } finally {
        // Re-enable send button
        sendBtn.disabled = false;
        sendBtn.innerHTML = '<i class="fas fa-paper-plane"></i>';
    }
}

async function loadUsers() {
    const usersList = document.getElementById('usersList');
    
    try {
        // Get users that current user follows
        const { data: follows } = await supabase
            .from('follows')
            .select('following_id')
            .eq('follower_id', currentUserId);

        const followingIds = follows?.map(f => f.following_id) || [];

        // Get followed users' profiles
        if (followingIds.length > 0) {
            const { data: users, error } = await supabase
                .from('profiles')
                .select('id, username, display_name, avatar_url')
                .in('id', followingIds)
                .limit(20);

            if (error) throw error;

            usersList.innerHTML = '';

            users.forEach(user => {
                const userItem = createUserSelectItem(user);
                usersList.appendChild(userItem);
            });
        } else {
            usersList.innerHTML = `
                <div class="empty-state">
                    <p>Follow some users to message them.</p>
                </div>
            `;
        }

    } catch (error) {
        console.error('Error loading users:', error);
        usersList.innerHTML = `
            <div class="empty-state">
                <p>Error loading users.</p>
            </div>
        `;
    }
}

function createUserSelectItem(user) {
    const item = document.createElement('div');
    item.className = 'user-select-item';
    item.dataset.userId = user.id;

    item.innerHTML = `
        <div class="user-select-avatar">
            <img src="${user.avatar_url || '/assets/avatar.png'}" alt="${user.display_name}">
        </div>
        <div class="user-select-info">
            <div class="name">${escapeHtml(user.display_name)}</div>
            <div class="username">@${escapeHtml(user.username)}</div>
        </div>
        <input type="checkbox" class="user-checkbox" id="user-${user.id}">
    `;

    const checkbox = item.querySelector('.user-checkbox');
    checkbox.addEventListener('change', (e) => {
        if (e.target.checked) {
            selectedUsers.add(user.id);
            addSelectedUser(user);
        } else {
            selectedUsers.delete(user.id);
            removeSelectedUser(user.id);
        }

        // Enable/disable next button
        document.getElementById('nextBtn').disabled = selectedUsers.size === 0;
    });

    return item;
}

function addSelectedUser(user) {
    const selectedUsersContainer = document.getElementById('selectedUsers');
    
    const selectedUserDiv = document.createElement('div');
    selectedUserDiv.className = 'selected-user';
    selectedUserDiv.dataset.userId = user.id;
    
    selectedUserDiv.innerHTML = `
        <span>${escapeHtml(user.display_name)}</span>
        <button type="button" class="remove-selected" data-user-id="${user.id}">
            <i class="fas fa-times"></i>
        </button>
    `;

    selectedUsersContainer.appendChild(selectedUserDiv);

    // Add remove event listener
    selectedUserDiv.querySelector('.remove-selected').addEventListener('click', (e) => {
        e.stopPropagation();
        removeSelectedUser(user.id);
        
        // Uncheck the checkbox
        const checkbox = document.getElementById(`user-${user.id}`);
        if (checkbox) {
            checkbox.checked = false;
        }
    });
}

function removeSelectedUser(userId) {
    selectedUsers.delete(userId);
    
    // Remove from selected users container
    const selectedUserDiv = document.querySelector(`.selected-user[data-user-id="${userId}"]`);
    if (selectedUserDiv) {
        selectedUserDiv.remove();
    }

    // Update next button
    document.getElementById('nextBtn').disabled = selectedUsers.size === 0;
}

async function searchUsers(event) {
    const searchTerm = event.target.value.trim().toLowerCase();
    
    if (!searchTerm) {
        loadUsers();
        return;
    }

    const usersList = document.getElementById('usersList');
    
    try {
        const { data: users, error } = await supabase
            .from('profiles')
            .select('id, username, display_name, avatar_url')
            .or(`username.ilike.%${searchTerm}%,display_name.ilike.%${searchTerm}%`)
            .neq('id', currentUserId)
            .limit(10);

        if (error) throw error;

        usersList.innerHTML = '';

        if (users.length === 0) {
            usersList.innerHTML = `
                <div class="empty-state">
                    <p>No users found.</p>
                </div>
            `;
            return;
        }

        users.forEach(user => {
            const userItem = createUserSelectItem(user);
            usersList.appendChild(userItem);
        });

    } catch (error) {
        console.error('Error searching users:', error);
    }
}

function startNewChat() {
    if (selectedUsers.size === 0) return;

    // For now, only handle single user chats
    // Could be extended to group chats
    const userId = Array.from(selectedUsers)[0];
    
    // Close modal
    document.getElementById('newMessageModal').classList.add('hidden');
    
    // Clear selection
    selectedUsers.clear();
    document.getElementById('selectedUsers').innerHTML = '';
    document.getElementById('searchUsersInput').value = '';
    
    // Open chat with selected user
    // We need to get user details first
    supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single()
        .then(({ data: user }) => {
            if (user) {
                openChat(userId, user);
            }
        });
}

async function sendNotification(userId, type, postId = null, messageId = null) {
    try {
        await supabase
            .from('notifications')
            .insert([
                {
                    user_id: userId,
                    type: type,
                    from_user_id: currentUserId,
                    post_id: postId,
                    message_id: messageId,
                    is_read: false
                }
            ]);
    } catch (error) {
        console.error('Error sending notification:', error);
    }
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
