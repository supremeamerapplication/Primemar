// public/js/feed/createPost.js
import { supabase } from '../config/supabase.js';
import { getCurrentUser } from '../guards/authGuard.js';

// Constants
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/ogg'];
const MAX_CHARACTERS = 280;

document.addEventListener('DOMContentLoaded', () => {
    // Initialize only if we're on a page with post creation
    if (!document.getElementById('postContent')) {
        console.log('No post creation elements found on this page');
        return;
    }
    
    initializePostCreation();
});

async function initializePostCreation() {
    try {
        // Get DOM elements
        const postContent = document.getElementById('postContent');
        const charCount = document.getElementById('charCount');
        const submitPost = document.getElementById('submitPost');
        const mediaUpload = document.getElementById('mediaUpload');
        const addImageBtn = document.getElementById('addImageBtn');
        const addVideoBtn = document.getElementById('addVideoBtn');
        const removeMedia = document.getElementById('removeMedia');
        const mediaPreview = document.getElementById('mediaPreview');
        const previewImage = document.getElementById('previewImage');
        const previewVideo = document.getElementById('previewVideo');
        const newPostBtn = document.getElementById('newPostBtn');
        const newPostModal = document.getElementById('newPostModal');
        const closeModal = document.getElementById('closeModal');

        // State variables
        let currentMedia = null;
        let mediaType = null;
        let isUploading = false;

        // Check authentication
        const user = await getCurrentUser();
        if (!user) {
            console.warn('User not authenticated, post creation disabled');
            disablePostCreation();
            return;
        }

        // Character counter
        if (postContent && charCount) {
            postContent.addEventListener('input', updateCharacterCounter);
            postContent.addEventListener('keydown', handleKeydown);
        }

        // Media upload handlers
        if (addImageBtn) {
            addImageBtn.addEventListener('click', () => openMediaUpload('image'));
        }
        
        if (addVideoBtn) {
            addVideoBtn.addEventListener('click', () => openMediaUpload('video'));
        }
        
        if (mediaUpload) {
            mediaUpload.addEventListener('change', handleMediaUpload);
        }
        
        if (removeMedia) {
            removeMedia.addEventListener('click', clearMedia);
        }

        // Modal handlers
        if (newPostBtn && newPostModal) {
            newPostBtn.addEventListener('click', openNewPostModal);
        }
        
        if (closeModal && newPostModal) {
            closeModal.addEventListener('click', closeNewPostModal);
        }
        
        if (newPostModal) {
            newPostModal.addEventListener('click', handleModalOutsideClick);
        }

        // Submit post
        if (submitPost) {
            submitPost.addEventListener('click', createPost);
        }

        // Initialize character counter
        if (charCount) {
            charCount.textContent = MAX_CHARACTERS;
        }

        // Functions
        function updateCharacterCounter() {
            const length = postContent.value.length;
            const remaining = MAX_CHARACTERS - length;
            
            if (charCount) {
                charCount.textContent = remaining;
                
                // Update character count color
                charCount.classList.remove('warning', 'error');
                if (remaining <= 30 && remaining > 10) {
                    charCount.classList.add('warning');
                } else if (remaining <= 10) {
                    charCount.classList.add('error');
                }
            }

            // Enable/disable submit button
            if (submitPost) {
                const hasContent = length > 0 || currentMedia;
                submitPost.disabled = !hasContent || length > MAX_CHARACTERS || isUploading;
            }
        }

        function handleKeydown(e) {
            // Ctrl/Cmd + Enter to submit
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                if (!submitPost.disabled) {
                    createPost();
                }
            }
        }

        function openMediaUpload(type) {
            if (!mediaUpload) return;
            
            if (type === 'image') {
                mediaUpload.accept = ALLOWED_IMAGE_TYPES.join(',');
            } else if (type === 'video') {
                mediaUpload.accept = ALLOWED_VIDEO_TYPES.join(',');
            }
            
            mediaUpload.click();
        }

        async function handleMediaUpload(event) {
            const file = event.target.files[0];
            if (!file) return;

            // Validate file size
            if (file.size > MAX_FILE_SIZE) {
                alert('File size must be less than 10MB');
                return;
            }

            // Validate file type
            if (ALLOWED_IMAGE_TYPES.includes(file.type)) {
                mediaType = 'image';
            } else if (ALLOWED_VIDEO_TYPES.includes(file.type)) {
                mediaType = 'video';
            } else {
                alert('Please upload an image (JPEG, PNG, GIF, WebP) or video (MP4, WebM, OGG) file');
                return;
            }

            currentMedia = file;

            // Show preview
            if (mediaType === 'image') {
                const reader = new FileReader();
                reader.onload = (e) => {
                    if (previewImage) {
                        previewImage.src = e.target.result;
                        previewImage.classList.remove('hidden');
                        if (previewVideo) previewVideo.classList.add('hidden');
                        if (mediaPreview) mediaPreview.classList.remove('hidden');
                    }
                };
                reader.readAsDataURL(file);
            } else if (mediaType === 'video') {
                const url = URL.createObjectURL(file);
                if (previewVideo) {
                    previewVideo.src = url;
                    previewVideo.classList.remove('hidden');
                    if (previewImage) previewImage.classList.add('hidden');
                    if (mediaPreview) mediaPreview.classList.remove('hidden');
                }
            }

            // Reset file input
            mediaUpload.value = '';
            
            // Update character counter to enable submit button
            updateCharacterCounter();
        }

        function clearMedia() {
            currentMedia = null;
            mediaType = null;
            
            if (mediaPreview) mediaPreview.classList.add('hidden');
            if (previewImage) {
                previewImage.classList.add('hidden');
                previewImage.src = '';
            }
            if (previewVideo) {
                previewVideo.classList.add('hidden');
                previewVideo.src = '';
            }
            
            // Update character counter
            updateCharacterCounter();
        }

        function openNewPostModal() {
            if (newPostModal) {
                newPostModal.classList.remove('hidden');
                if (postContent) postContent.focus();
            }
        }

        function closeNewPostModal() {
            if (newPostModal) {
                newPostModal.classList.add('hidden');
                resetForm();
            }
        }

        function handleModalOutsideClick(e) {
            if (e.target === newPostModal) {
                closeNewPostModal();
            }
        }

        function resetForm() {
            if (postContent) postContent.value = '';
            if (charCount) charCount.textContent = MAX_CHARACTERS;
            if (submitPost) submitPost.disabled = true;
            clearMedia();
            
            // Reset character counter classes
            if (charCount) {
                charCount.classList.remove('warning', 'error');
            }
        }

        async function createPost() {
            // Check authentication again
            const user = await getCurrentUser();
            if (!user) {
                alert('Please login to create posts');
                window.location.href = '/login.html';
                return;
            }

            const content = postContent ? postContent.value.trim() : '';
            
            // Validate content
            if (!content && !currentMedia) {
                alert('Please add some content or media to your post');
                return;
            }

            if (content.length > MAX_CHARACTERS) {
                alert(`Post content cannot exceed ${MAX_CHARACTERS} characters`);
                return;
            }

            // Set uploading state
            isUploading = true;
            if (submitPost) {
                submitPost.disabled = true;
                submitPost.textContent = 'Posting...';
                submitPost.classList.add('loading');
            }

            try {
                let mediaUrl = null;
                let finalMediaType = null;

                // Upload media if exists
                if (currentMedia) {
                    const uploadResult = await uploadMedia(currentMedia, user.id, 'post');
                    if (uploadResult.success) {
                        mediaUrl = uploadResult.url;
                        finalMediaType = uploadResult.type;
                    } else {
                        throw new Error(`Failed to upload media: ${uploadResult.error}`);
                    }
                }

                // Insert post into database
                const { data: post, error: postError } = await supabase
                    .from('posts')
                    .insert([
                        {
                            user_id: user.id,
                            content: content || null,
                            media_url: mediaUrl,
                            media_type: finalMediaType,
                            like_count: 0,
                            reply_count: 0,
                            repost_count: 0
                        }
                    ])
                    .select()
                    .single();

                if (postError) {
                    console.error('Post creation error:', postError);
                    throw new Error(`Failed to create post: ${postError.message}`);
                }

                // Show success
                showToast('Post created successfully!', 'success');
                
                // Reset form and close modal
                resetForm();
                closeNewPostModal();

                // Refresh feed if on feed page
                if (window.refreshFeed) {
                    window.refreshFeed();
                } else if (window.dispatchEvent) {
                    // Dispatch custom event for other components to listen
                    window.dispatchEvent(new CustomEvent('postCreated'));
                }

                // Update post count in profile (optional)
                updateUserPostCount(user.id);

            } catch (error) {
                console.error('Error creating post:', error);
                showToast(`Failed to create post: ${error.message}`, 'error');
            } finally {
                // Reset uploading state
                isUploading = false;
                if (submitPost) {
                    submitPost.disabled = false;
                    submitPost.textContent = 'Post';
                    submitPost.classList.remove('loading');
                }
            }
        }

        async function uploadMedia(file, userId, fileType) {
            try {
                // Generate unique filename
                const fileExt = file.name.split('.').pop();
                const timestamp = Date.now();
                const randomId = Math.random().toString(36).substr(2, 9);
                const fileName = `${fileType}s/${userId}/${timestamp}_${randomId}.${fileExt}`;

                // Upload to storage
                const { data: uploadData, error: uploadError } = await supabase.storage
                    .from('media')
                    .upload(fileName, file);

                if (uploadError) {
                    console.error('Upload error:', uploadError);
                    return { success: false, error: uploadError.message };
                }

                // Get public URL
                const { data: urlData } = supabase.storage
                    .from('media')
                    .getPublicUrl(fileName);

                // Create file metadata record
                const { error: metadataError } = await supabase
                    .from('file_metadata')
                    .insert([
                        {
                            user_id: userId,
                            file_path: fileName,
                            file_type: fileType,
                            original_filename: file.name,
                            mime_type: file.type,
                            file_size: file.size
                        }
                    ]);

                if (metadataError) {
                    console.error('Metadata error:', metadataError);
                    // Continue anyway since upload succeeded
                }

                return {
                    success: true,
                    url: urlData.publicUrl,
                    path: fileName,
                    type: getMediaType(file.type)
                };

            } catch (error) {
                console.error('Upload media error:', error);
                return { success: false, error: error.message };
            }
        }

        function getMediaType(mimeType) {
            if (mimeType.startsWith('image/')) return 'image';
            if (mimeType.startsWith('video/')) return 'video';
            return 'file';
        }

        async function updateUserPostCount(userId) {
            // This is optional - you can update user stats if needed
            try {
                // Count user's posts
                const { count, error } = await supabase
                    .from('posts')
                    .select('*', { count: 'exact', head: true })
                    .eq('user_id', userId);

                if (error) {
                    console.warn('Could not update post count:', error);
                }
                // You could update a user stats table here if you have one
            } catch (error) {
                console.warn('Error updating post count:', error);
            }
        }

        function showToast(message, type = 'info') {
            // Create toast element
            const toast = document.createElement('div');
            toast.className = `toast toast-${type}`;
            toast.textContent = message;
            toast.style.cssText = `
                position: fixed;
                bottom: 20px;
                right: 20px;
                background: ${type === 'success' ? '#00ba7c' : type === 'error' ? '#f4212e' : '#1d9bf0'};
                color: white;
                padding: 12px 24px;
                border-radius: 8px;
                z-index: 9999;
                animation: slideIn 0.3s ease;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
            `;

            document.body.appendChild(toast);

            // Remove toast after 3 seconds
            setTimeout(() => {
                toast.style.animation = 'slideOut 0.3s ease';
                setTimeout(() => toast.remove(), 300);
            }, 3000);

            // Add CSS animation if not exists
            if (!document.querySelector('#toast-animations')) {
                const style = document.createElement('style');
                style.id = 'toast-animations';
                style.textContent = `
                    @keyframes slideIn {
                        from { transform: translateX(100%); opacity: 0; }
                        to { transform: translateX(0); opacity: 1; }
                    }
                    @keyframes slideOut {
                        from { transform: translateX(0); opacity: 1; }
                        to { transform: translateX(100%); opacity: 0; }
                    }
                `;
                document.head.appendChild(style);
            }
        }

        function disablePostCreation() {
            if (postContent) {
                postContent.disabled = true;
                postContent.placeholder = 'Please login to post';
            }
            if (submitPost) {
                submitPost.disabled = true;
                submitPost.textContent = 'Login to Post';
                submitPost.addEventListener('click', () => {
                    window.location.href = '/login.html';
                });
            }
            if (addImageBtn) addImageBtn.disabled = true;
            if (addVideoBtn) addVideoBtn.disabled = true;
        }

    } catch (error) {
        console.error('Error initializing post creation:', error);
    }
}

// Export for use in other modules if needed
export { initializePostCreation };