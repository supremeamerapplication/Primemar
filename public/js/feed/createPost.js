// public/js/feed/createPost.js
import { supabase } from '../config/supabase.js';
import { getCurrentUser } from '../guards/authGuard.js';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/ogg'];

document.addEventListener('DOMContentLoaded', () => {
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

    let currentMedia = null;
    let mediaType = null;

    // Character counter
    postContent.addEventListener('input', () => {
        const length = postContent.value.length;
        charCount.textContent = 280 - length;

        // Update character count color
        charCount.classList.remove('warning', 'error');
        if (length > 250) {
            charCount.classList.add('warning');
        }
        if (length > 280) {
            charCount.classList.add('error');
        }

        // Enable/disable submit button
        submitPost.disabled = length === 0 || length > 280;
    });

    // Media upload handlers
    addImageBtn.addEventListener('click', () => {
        mediaUpload.accept = ALLOWED_IMAGE_TYPES.join(',');
        mediaUpload.click();
    });

    addVideoBtn.addEventListener('click', () => {
        mediaUpload.accept = ALLOWED_VIDEO_TYPES.join(',');
        mediaUpload.click();
    });

    mediaUpload.addEventListener('change', handleMediaUpload);
    removeMedia.addEventListener('click', clearMedia);

    // Modal handlers
    newPostBtn.addEventListener('click', () => {
        newPostModal.classList.remove('hidden');
        postContent.focus();
    });

    closeModal.addEventListener('click', () => {
        newPostModal.classList.add('hidden');
        resetForm();
    });

    // Close modal on outside click
    newPostModal.addEventListener('click', (e) => {
        if (e.target === newPostModal) {
            newPostModal.classList.add('hidden');
            resetForm();
        }
    });

    // Submit post
    submitPost.addEventListener('click', createPost);

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
            alert('Please upload an image or video file');
            return;
        }

        currentMedia = file;

        // Show preview
        if (mediaType === 'image') {
            const reader = new FileReader();
            reader.onload = (e) => {
                previewImage.src = e.target.result;
                previewImage.classList.remove('hidden');
                previewVideo.classList.add('hidden');
                mediaPreview.classList.remove('hidden');
            };
            reader.readAsDataURL(file);
        } else if (mediaType === 'video') {
            const url = URL.createObjectURL(file);
            previewVideo.src = url;
            previewVideo.classList.remove('hidden');
            previewImage.classList.add('hidden');
            mediaPreview.classList.remove('hidden');
        }

        // Reset file input
        mediaUpload.value = '';
    }

    function clearMedia() {
        currentMedia = null;
        mediaType = null;
        mediaPreview.classList.add('hidden');
        previewImage.classList.add('hidden');
        previewVideo.classList.add('hidden');
        previewImage.src = '';
        previewVideo.src = '';
    }

    function resetForm() {
        postContent.value = '';
        charCount.textContent = '280';
        submitPost.disabled = true;
        clearMedia();
    }

    async function createPost() {
        const content = postContent.value.trim();
        if (!content && !currentMedia) {
            alert('Please add some content or media to your post');
            return;
        }

        if (content.length > 280) {
            alert('Post content cannot exceed 280 characters');
            return;
        }

        submitPost.disabled = true;
        submitPost.textContent = 'Posting...';
        submitPost.classList.add('loading');

        try {
            const user = await getCurrentUser();
            if (!user) {
                throw new Error('User not authenticated');
            }

            let mediaUrl = null;
            let finalMediaType = null;

            // Upload media if exists
            if (currentMedia) {
                const fileExt = currentMedia.name.split('.').pop();
                const fileName = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}.${fileExt}`;
                const filePath = `${user.id}/${fileName}`;

                const { data: uploadData, error: uploadError } = await supabase.storage
                    .from('post-media')
                    .upload(filePath, currentMedia);

                if (uploadError) {
                    throw uploadError;
                }

                // Get public URL
                const { data: urlData } = supabase.storage
                    .from('post-media')
                    .getPublicUrl(filePath);

                mediaUrl = urlData.publicUrl;
                finalMediaType = mediaType;
            }

            // Insert post into database
            const { data: post, error: postError } = await supabase
                .from('media')
                .insert([
                    {
                        user_id: user.id,
                        content: content || null,
                        media_url: mediaUrl,
                        media_type: finalMediaType
                    }
                ])
                .select()
                .single();

            if (postError) {
                throw postError;
            }

            // Show success
            alert('Post created successfully!');
            
            // Reset form and close modal
            resetForm();
            newPostModal.classList.add('hidden');

            // Refresh feed
            window.dispatchEvent(new CustomEvent('refreshFeed'));

        } catch (error) {
            console.error('Error creating post:', error);
            alert('Failed to create post. Please try again.');
        } finally {
            submitPost.disabled = false;
            submitPost.textContent = 'Post';
            submitPost.classList.remove('loading');
        }
    }
});
