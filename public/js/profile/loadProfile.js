// public/js/profile/loadProfile.js
import { supabase } from '../config/supabase.js';
import { getCurrentUser } from '../guards/authGuard.js';

document.addEventListener('DOMContentLoaded', async () => {
    const currentUser = await getCurrentUser();
    if (!currentUser) return;

    // Get profile ID from URL or use current user
    const urlParams = new URLSearchParams(window.location.search);
    const profileId = urlParams.get('id') || currentUser.id;

    const isOwnProfile = profileId === currentUser.id;

    // Load profile data
    loadProfile(profileId, isOwnProfile);
    loadProfilePosts(profileId);

    // Setup event listeners
    setupEventListeners(profileId, isOwnProfile);
});

async function loadProfile(profileId, isOwnProfile) {
    try {
        // Fetch profile data
        const { data: profile, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', profileId)
            .single();

        if (error) throw error;

        // Update profile header
        document.getElementById('profileDisplayName').textContent = profile.display_name;
        document.getElementById('profileUsername').textContent = `@${profile.username}`;
        document.getElementById('profileBio').textContent = profile.bio || 'No bio yet';
        
        // Update avatar if exists
        if (profile.avatar_url) {
            document.getElementById('profileAvatar').src = profile.avatar_url;
        }

        // Update stats
        document.getElementById('followingCount').textContent = profile.following_count || 0;
        document.getElementById('followersCount').textContent = profile.followers_count || 0;

        // Format join date
        const joinDate = new Date(profile.created_at);
        document.getElementById('joinDate').textContent = joinDate.toLocaleDateString('en-US', {
            month: 'long',
            year: 'numeric'
        });

        // Show appropriate buttons
        const editProfileBtn = document.getElementById('editProfileBtn');
        const followBtn = document.getElementById('followBtn');
        const unfollowBtn = document.getElementById('unfollowBtn');

        if (isOwnProfile) {
            editProfileBtn.classList.remove('hidden');
            followBtn.classList.add('hidden');
            unfollowBtn.classList.add('hidden');
        } else {
            editProfileBtn.classList.add('hidden');
            
            // Check if current user is following this profile
            const { data: follow } = await supabase
                .from('follows')
                .select('id')
                .eq('follower_id', currentUser.id)
                .eq('following_id', profileId)
                .single();

            if (follow) {
                unfollowBtn.classList.remove('hidden');
                followBtn.classList.add('hidden');
            } else {
                followBtn.classList.remove('hidden');
                unfollowBtn.classList.add('hidden');
            }
        }

    } catch (error) {
        console.error('Error loading profile:', error);
        
        // Show error state
        document.getElementById('profileDisplayName').textContent = 'Error loading profile';
        document.getElementById('profileUsername').textContent = '';
        document.getElementById('profileBio').textContent = 'Unable to load profile information';
    }
}

async function loadProfilePosts(profileId) {
    const feed = document.getElementById('profileFeed');
    
    try {
        // Fetch user's posts
        const { data: posts, error } = await supabase
            .from('posts')
            .select(`
                *,
                profiles (
                    username,
                    display_name,
                    avatar_url
                )
            `)
            .eq('user_id', profileId)
            .order('created_at', { ascending: false })
            .limit(20);

        if (error) throw error;

        // Clear loading state
        feed.innerHTML = '';

        if (posts.length === 0) {
            feed.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-feather-alt"></i>
                    <h3>No posts yet</h3>
                    <p>When this user posts, you'll see it here.</p>
                </div>
            `;
            return;
        }

        // Create post elements (using the same function from loadFeed.js)
        for (const post of posts) {
            const postElement = await createProfilePostElement(post);
            feed.appendChild(postElement);
        }

    } catch (error) {
        console.error('Error loading profile posts:', error);
        feed.innerHTML = `
            <div class="empty-state">
                <i class="fas fa-exclamation-circle"></i>
                <h3>Error loading posts</h3>
                <p>Please try again later</p>
            </div>
        `;
    }
}

async function createProfilePostElement(post) {
    // Similar to createPostElement from loadFeed.js
    const postElement = document.createElement('div');
    postElement.className = 'post';
    postElement.dataset.postId = post.id;

    const formattedTime = formatTimeAgo(new Date(post.created_at));
    const mediaHtml = post.media_url ? createMediaHtml(post) : '';

    postElement.innerHTML = `
        <div class="post-header">
            <div class="post-avatar">
                <img src="${post.profiles.avatar_url || '/assets/avatar.png'}" 
                     alt="${post.profiles.display_name}">
            </div>
            <div class="post-user-info">
                <span class="name">${escapeHtml(post.profiles.display_name)}</span>
                <span class="username">@${escapeHtml(post.profiles.username)}</span>
                <span class="time">· ${formattedTime}</span>
            </div>
            <button class="post-options">
                <i class="fas fa-ellipsis-h"></i>
            </button>
        </div>
        
        <div class="post-content">
            ${post.content ? `<p>${escapeHtml(post.content)}</p>` : ''}
            ${mediaHtml}
        </div>
        
        <div class="post-actions">
            <button class="action-btn reply-btn" title="Reply">
                <i class="far fa-comment"></i>
                <span>${post.reply_count || 0}</span>
            </button>
            
            <button class="action-btn repost-btn" title="Repost">
                <i class="fas fa-retweet"></i>
                <span>${post.repost_count || 0}</span>
            </button>
            
            <button class="action-btn like-btn" title="Like">
                <i class="far fa-heart"></i>
                <span>${post.like_count || 0}</span>
            </button>
            
            <button class="action-btn share-btn" title="Share">
                <i class="far fa-share-square"></i>
            </button>
        </div>
    `;

    return postElement;
}

function createMediaHtml(post) {
    if (post.media_type === 'image') {
        return `
            <div class="post-media">
                <img src="${post.media_url}" alt="Post image" loading="lazy">
            </div>
        `;
    } else if (post.media_type === 'video') {
        return `
            <div class="post-media">
                <video src="${post.media_url}" controls></video>
            </div>
        `;
    }
    return '';
}

function setupEventListeners(profileId, isOwnProfile) {
    const editProfileBtn = document.getElementById('editProfileBtn');
    const followBtn = document.getElementById('followBtn');
    const unfollowBtn = document.getElementById('unfollowBtn');
    const editProfileModal = document.getElementById('editProfileModal');
    const closeEditModal = document.getElementById('closeEditModal');
    const saveProfileBtn = document.getElementById('saveProfileBtn');
    const editProfileForm = document.getElementById('editProfileForm');

    if (editProfileBtn) {
        editProfileBtn.addEventListener('click', () => {
            editProfileModal.classList.remove('hidden');
            loadEditProfileForm(profileId);
        });
    }

    if (followBtn) {
        followBtn.addEventListener('click', () => followUser(profileId));
    }

    if (unfollowBtn) {
        unfollowBtn.addEventListener('click', () => unfollowUser(profileId));
    }

    closeEditModal.addEventListener('click', () => {
        editProfileModal.classList.add('hidden');
    });

    editProfileModal.addEventListener('click', (e) => {
        if (e.target === editProfileModal) {
            editProfileModal.classList.add('hidden');
        }
    });

    if (saveProfileBtn) {
        saveProfileBtn.addEventListener('click', saveProfile);
    }
}

async function followUser(profileId) {
    const currentUser = await getCurrentUser();
    if (!currentUser) return;

    try {
        const { error } = await supabase
            .from('follows')
            .insert([
                {
                    follower_id: currentUser.id,
                    following_id: profileId
                }
            ]);

        if (error) throw error;

        // Update UI
        document.getElementById('followBtn').classList.add('hidden');
        document.getElementById('unfollowBtn').classList.remove('hidden');

        // Update follower count
        updateFollowerCount(profileId, 1);

        // Update current user's following count
        updateFollowingCount(currentUser.id, 1);

    } catch (error) {
        console.error('Error following user:', error);
        alert('Failed to follow user. Please try again.');
    }
}

async function unfollowUser(profileId) {
    const currentUser = await getCurrentUser();
    if (!currentUser) return;

    try {
        const { error } = await supabase
            .from('follows')
            .delete()
            .eq('follower_id', currentUser.id)
            .eq('following_id', profileId);

        if (error) throw error;

        // Update UI
        document.getElementById('unfollowBtn').classList.add('hidden');
        document.getElementById('followBtn').classList.remove('hidden');

        // Update follower count
        updateFollowerCount(profileId, -1);

        // Update current user's following count
        updateFollowingCount(currentUser.id, -1);

    } catch (error) {
        console.error('Error unfollowing user:', error);
        alert('Failed to unfollow user. Please try again.');
    }
}

async function updateFollowerCount(profileId, change) {
    const followersCount = document.getElementById('followersCount');
    const currentCount = parseInt(followersCount.textContent) || 0;
    followersCount.textContent = currentCount + change;

    // Update in database
    await supabase.rpc('increment_followers', {
        profile_id: profileId,
        increment: change
    });
}

async function updateFollowingCount(profileId, change) {
    // Update in database
    await supabase.rpc('increment_following', {
        profile_id: profileId,
        increment: change
    });
}

async function loadEditProfileForm(profileId) {
    try {
        const { data: profile } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', profileId)
            .single();

        if (profile) {
            document.getElementById('editDisplayName').value = profile.display_name;
            document.getElementById('editUsername').value = profile.username;
            document.getElementById('editBio').value = profile.bio || '';
            
            if (profile.avatar_url) {
                document.getElementById('editAvatarPreview').src = profile.avatar_url;
            }
            
            if (profile.background_url) {
                document.getElementById('editHeaderPreview').src = profile.background_url;
            }
        }

        // Setup avatar upload
        const changeAvatarBtn = document.getElementById('changeAvatarBtn');
        const editAvatarInput = document.getElementById('editAvatarInput');
        
        changeAvatarBtn.addEventListener('click', () => editAvatarInput.click());
        editAvatarInput.addEventListener('change', handleAvatarUpload);

        // Setup header upload
        const changeHeaderBtn = document.getElementById('changeHeaderBtn');
        const editHeaderInput = document.getElementById('editHeaderInput');
        
        changeHeaderBtn.addEventListener('click', () => editHeaderInput.click());
        editHeaderInput.addEventListener('change', handleHeaderUpload);

    } catch (error) {
        console.error('Error loading edit form:', error);
    }
}

async function handleAvatarUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    // Validate file
    if (!file.type.startsWith('image/')) {
        alert('Please select an image file');
        return;
    }

    if (file.size > 5 * 1024 * 1024) { // 5MB
        alert('Image size must be less than 5MB');
        return;
    }

    // Show preview
    const reader = new FileReader();
    reader.onload = (e) => {
        document.getElementById('editAvatarPreview').src = e.target.result;
    };
    reader.readAsDataURL(file);
}

async function handleHeaderUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    // Validate file
    if (!file.type.startsWith('image/')) {
        alert('Please select an image file');
        return;
    }

    if (file.size > 10 * 1024 * 1024) { // 10MB
        alert('Image size must be less than 10MB');
        return;
    }

    // Show preview
    const reader = new FileReader();
    reader.onload = (e) => {
        document.getElementById('editHeaderPreview').src = e.target.result;
    };
    reader.readAsDataURL(file);
}

async function saveProfile() {
    const currentUser = await getCurrentUser();
    if (!currentUser) return;

    const displayName = document.getElementById('editDisplayName').value.trim();
    const username = document.getElementById('editUsername').value.trim();
    const bio = document.getElementById('editBio').value.trim();
    const avatarInput = document.getElementById('editAvatarInput');
    const headerInput = document.getElementById('editHeaderInput');

    // Basic validation
    if (!displayName || !username) {
        alert('Display name and username are required');
        return;
    }

    if (username.length < 3) {
        alert('Username must be at least 3 characters');
        return;
    }

    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
        alert('Username can only contain letters, numbers, and underscores');
        return;
    }

    // Check if username is taken (by another user)
    const { data: existingUser } = await supabase
        .from('profiles')
        .select('id')
        .eq('username', username)
        .neq('id', currentUser.id)
        .single();

    if (existingUser) {
        alert('Username already taken');
        return;
    }

    // Show loading
    const saveBtn = document.getElementById('saveProfileBtn');
    const originalText = saveBtn.textContent;
    saveBtn.textContent = 'Saving...';
    saveBtn.disabled = true;

    try {
        let avatarUrl = null;
        let backgroundUrl = null;

        // Upload avatar if changed
        if (avatarInput.files[0]) {
            avatarUrl = await uploadFile(
                'avatars',
                currentUser.id,
                avatarInput.files[0],
                'avatar'
            );
        }

        // Upload header if changed
        if (headerInput.files[0]) {
            backgroundUrl = await uploadFile(
                'post-media',
                currentUser.id,
                headerInput.files[0],
                'header'
            );
        }

        // Update profile
        const updates = {
            display_name: displayName,
            username: username,
            bio: bio,
            updated_at: new Date().toISOString()
        };

        if (avatarUrl) updates.avatar_url = avatarUrl;
        if (backgroundUrl) updates.background_url = backgroundUrl;

        const { error } = await supabase
            .from('profiles')
            .update(updates)
            .eq('id', currentUser.id);

        if (error) throw error;

        // Close modal and refresh profile
        document.getElementById('editProfileModal').classList.add('hidden');
        window.location.reload();

    } catch (error) {
        console.error('Error saving profile:', error);
        alert('Failed to save profile. Please try again.');
    } finally {
        saveBtn.textContent = originalText;
        saveBtn.disabled = false;
    }
}

async function uploadFile(bucket, userId, file, type) {
    const fileExt = file.name.split('.').pop();
    const fileName = `${type}_${Date.now()}.${fileExt}`;
    const filePath = `${userId}/${fileName}`;

    const { data, error } = await supabase.storage
        .from(bucket)
        .upload(filePath, file);

    if (error) throw error;

    const { data: urlData } = supabase.storage
        .from(bucket)
        .getPublicUrl(filePath);

    return urlData.publicUrl;
}

function formatTimeAgo(date) {
    const seconds = Math.floor((new Date() - date) / 1000);
    
    if (seconds < 60) return 'Just now';
    
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m`;
    
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h`;
    
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d`;
    
    return date.toLocaleDateString();
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
