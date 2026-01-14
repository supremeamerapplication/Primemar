// public/js/profile/follow.js
import { supabase } from '../config/supabase.js';
import { getCurrentUser } from '../guards/authGuard.js';

export async function followUser(userId) {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
        alert('Please login to follow users');
        return;
    }

    if (currentUser.id === userId) {
        alert('You cannot follow yourself');
        return;
    }

    try {
        const { error } = await supabase
            .from('follows')
            .insert([
                {
                    follower_id: currentUser.id,
                    following_id: userId
                }
            ]);

        if (error) throw error;

        // Send notification
        await sendFollowNotification(userId, currentUser.id);

        return true;
    } catch (error) {
        console.error('Error following user:', error);
        if (error.code === '23505') { // Unique violation
            alert('You are already following this user');
        } else {
            alert('Failed to follow user. Please try again.');
        }
        return false;
    }
}

export async function unfollowUser(userId) {
    const currentUser = await getCurrentUser();
    if (!currentUser) return false;

    try {
        const { error } = await supabase
            .from('follows')
            .delete()
            .eq('follower_id', currentUser.id)
            .eq('following_id', userId);

        if (error) throw error;

        return true;
    } catch (error) {
        console.error('Error unfollowing user:', error);
        alert('Failed to unfollow user. Please try again.');
        return false;
    }
}

async function sendFollowNotification(userId, fromUserId) {
    try {
        await supabase
            .from('notifications')
            .insert([
                {
                    user_id: userId,
                    type: 'follow',
                    from_user_id: fromUserId,
                    is_read: false
                }
            ]);
    } catch (error) {
        console.error('Error sending follow notification:', error);
    }
                    }
