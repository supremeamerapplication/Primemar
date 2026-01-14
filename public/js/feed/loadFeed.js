// public/js/feed/loadFeed.js
import { supabase } from '../config/supabase.js';
import { getCurrentUser } from '../guards/authGuard.js';

document.addEventListener('DOMContentLoaded', async () => {
    const feed = document.getElementById('feed');
    const refreshBtn = document.getElementById('refreshFeed');
    const currentUser = await getCurrentUser();

    // Load initial feed
    loadFeed();

    // Refresh feed on button click
    refreshBtn.addEventListener('click', loadFeed);

    // Listen for custom refresh event
    window.addEventListener('refreshFeed', loadFeed);

    // Set up realtime subscription for new posts
    const postSubscription = supabase
        .channel('public:posts')
        .on('postgres_changes', 
            { event: 'INSERT', schema: 'public', table: 'posts' },
            async (payload) => {
                // Check if this is a new post from someone the user follows
                const { data: isFollowing } = await supabase
                    .from('follows')
                    .select('id')
                    .eq('follower_id', currentUser.id)
                    .eq('following_id', payload.new.user_id)
                    .single();

                // If it's from the user themselves or someone they follow, add to feed
                if (payload.new.user_id === currentUser.id || isFollowing) {
                    const postElement = await createPostElement(payload.new);
                    feed.prepend(postElement);
                }
            }
        )
        .subscribe();

    // Set up realtime subscription for likes
    const likeSubscription = supabase
        .channel('public:likes')
        .on('postgres_changes',
            { event: '*', schema: 'public', table: 'likes' },
            async (payload) => {
                updateLikeCount(payload.new.post_id);
            }
        )
        .subscribe();

    async function loadFeed() {
        try {
            feed.innerHTML = `
                <div class="loading-spinner">
                    <i class="fas fa-spinner fa-spin"></i>
                    <span>Loading posts...</span>
                </div>
            `;

            refreshBtn.classList.add('loading');

            // Get posts from users the current user follows, plus their own posts
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
                .order('created_at', { ascending: false })
                .limit(50);

            if (error) throw error;

            // Clear loading state
            feed.innerHTML = '';

            if (posts.length === 0) {
                feed.innerHTML = `
                    <div class="empty-state">
                        <i class="fas fa-feather-alt"></i>
                        <h3>No posts yet</h3>
                        <p>Follow some users or create your first post!</p>
                    </div>
                `;
                return;
            }

            // Create post elements
            for (const post of posts) {
                const postElement = await createPostElement(post);
                feed.appendChild(postElement);
            }

        } catch (error) {
            console.error('Error loading feed:', error);
            feed.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-exclamation-circle"></i>
                    <h3>Error loading posts</h3>
                    <p>Please try again later</p>
                </div>
            `;
        } finally {
            refreshBtn.classList.remove('loading');
        }
    }

    async function createPostElement(post) {
        const user = await getCurrentUser();
        const postElement = document.createElement('div');
        postElement.className = 'post';
        postElement.dataset.postId = post.id;

        // Check if current user has liked this post
        const { data: like } = await supabase
            .from('likes')
            .select('id')
            .eq('post_id', post.id)
            .eq('user_id', user.id)
            .single();

        const isLiked = !!like;
        const likeCount = post.like_count || 0;

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
                
                <button class="action-btn like-btn ${isLiked ? 'liked' : ''}" 
                        title="${isLiked ? 'Unlike' : 'Like'}">
                    <i class="${isLiked ? 'fas' : 'far'} fa-heart"></i>
                    <span class="like-count">${likeCount}</span>
                </button>
                
                <button class="action-btn share-btn" title="Share">
                    <i class="far fa-share-square"></i>
                </button>
            </div>
        `;

        // Add event listeners
        const likeBtn = postElement.querySelector('.like-btn');
        const repostBtn = postElement.querySelector('.repost-btn');
        const replyBtn = postElement.querySelector('.reply-btn');
        const shareBtn = postElement.querySelector('.share-btn');

        likeBtn.addEventListener('click', () => toggleLike(post.id, likeBtn));
        repostBtn.addEventListener('click', () => repost(post.id));
        replyBtn.addEventListener('click', () => replyToPost(post.id));
        shareBtn.addEventListener('click', () => sharePost(post.id));

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

    async function toggleLike(postId, likeBtn) {
        const user = await getCurrentUser();
        if (!user) return;

        const likeIcon = likeBtn.querySelector('i');
        const likeCountSpan = likeBtn.querySelector('.like-count');
        let currentCount = parseInt(likeCountSpan.textContent);

        if (likeBtn.classList.contains('liked')) {
            // Unlike
            const { error } = await supabase
                .from('likes')
                .delete()
                .eq('post_id', postId)
                .eq('user_id', user.id);

            if (!error) {
                likeBtn.classList.remove('liked');
                likeIcon.classList.remove('fas');
                likeIcon.classList.add('far');
                likeCountSpan.textContent = currentCount - 1;
            }
        } else {
            // Like
            const { error } = await supabase
                .from('likes')
                .insert([
                    { post_id: postId, user_id: user.id }
                ]);

            if (!error) {
                likeBtn.classList.add('liked');
                likeIcon.classList.remove('far');
                likeIcon.classList.add('fas');
                likeCountSpan.textContent = currentCount + 1;
            }
        }
    }

    async function repost(postId) {
        // Implementation for repost functionality
        alert('Repost functionality coming soon!');
    }

    async function replyToPost(postId) {
        // Implementation for reply functionality
        alert('Reply functionality coming soon!');
    }

    async function sharePost(postId) {
        const postUrl = `${window.location.origin}/post.html?id=${postId}`;
        await navigator.clipboard.writeText(postUrl);
        alert('Post link copied to clipboard!');
    }

    async function updateLikeCount(postId) {
        const { data: likes } = await supabase
            .from('likes')
            .select('id', { count: 'exact' })
            .eq('post_id', postId);

        const postElement = document.querySelector(`.post[data-post-id="${postId}"]`);
        if (postElement) {
            const likeCountSpan = postElement.querySelector('.like-count');
            if (likeCountSpan) {
                likeCountSpan.textContent = likes.length;
            }
        }

        // Update post count in database
        await supabase
            .from('posts')
            .update({ like_count: likes.length })
            .eq('id', postId);
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
});
