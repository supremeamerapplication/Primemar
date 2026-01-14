// public/js/feed/likePost.js
import { supabase } from '../config/supabase.js';
import { getCurrentUser } from '../guards/authGuard.js';

export async function toggleLike(postId, likeBtn) {
    const user = await getCurrentUser();
    if (!user) {
        alert('Please login to like posts');
        return;
    }

    const likeIcon = likeBtn.querySelector('i');
    const likeCountSpan = likeBtn.querySelector('.like-count');
    let currentCount = parseInt(likeCountSpan.textContent) || 0;

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
            likeCountSpan.textContent = Math.max(0, currentCount - 1);
            
            // Send notification
            await sendUnlikeNotification(postId, user.id);
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
            
            // Send notification
            await sendLikeNotification(postId, user.id);
        }
    }
}

async function sendLikeNotification(postId, fromUserId) {
    try {
        // Get post owner
        const { data: post } = await supabase
            .from('posts')
            .select('user_id')
            .eq('id', postId)
            .single();

        if (post && post.user_id !== fromUserId) {
            await supabase
                .from('notifications')
                .insert([
                    {
                        user_id: post.user_id,
                        type: 'like',
                        from_user_id: fromUserId,
                        post_id: postId,
                        is_read: false
                    }
                ]);
        }
    } catch (error) {
        console.error('Error sending like notification:', error);
    }
}

async function sendUnlikeNotification(postId, fromUserId) {
    try {
        // Remove like notification
        const { data: post } = await supabase
            .from('posts')
            .select('user_id')
            .eq('id', postId)
            .single();

        if (post && post.user_id !== fromUserId) {
            await supabase
                .from('notifications')
                .delete()
                .eq('user_id', post.user_id)
                .eq('type', 'like')
                .eq('from_user_id', fromUserId)
                .eq('post_id', postId);
        }
    } catch (error) {
        console.error('Error removing like notification:', error);
    }
    }
