import { supabase, getCurrentUser } from '../config/supabase.js'
import { uploadMedia } from '../utils/uploadMedia.js'

document.addEventListener('DOMContentLoaded', async () => {
    const postContent = document.getElementById('postContent')
    const charCount = document.getElementById('charCount')
    const submitPost = document.getElementById('submitPost')
    const mediaUpload = document.getElementById('mediaUpload')
    const addImage = document.getElementById('addImage')
    const addVideo = document.getElementById('addVideo')
    const createPostAvatar = document.getElementById('createPostAvatar')
    const user = await getCurrentUser()

    if (!user) return

    // Load user avatar
    if (createPostAvatar && user.avatar_url) {
        createPostAvatar.src = user.avatar_url
    } else if (createPostAvatar) {
        createPostAvatar.src = 'https://ui-avatars.com/api/?name=' + encodeURIComponent(user.display_name || user.username) + '&background=1DA1F2&color=fff'
    }

    // Character counter
    if (postContent && charCount) {
        postContent.addEventListener('input', () => {
            const remaining = 280 - postContent.value.length
            charCount.textContent = remaining
            charCount.style.color = remaining < 0 ? 'var(--error-color)' : remaining < 20 ? 'var(--warning-color)' : 'var(--text-secondary)'
        })
    }

    // Media upload
    if (addImage) {
        addImage.addEventListener('click', () => {
            mediaUpload.accept = 'image/*'
            mediaUpload.click()
        })
    }

    if (addVideo) {
        addVideo.addEventListener('click', () => {
            mediaUpload.accept = 'video/*'
            mediaUpload.click()
        })
    }

    let mediaFile = null
    mediaUpload.addEventListener('change', (e) => {
        const file = e.target.files[0]
        if (file) {
            // Validate file size (max 10MB)
            if (file.size > 10 * 1024 * 1024) {
                alert('File too large. Maximum size is 10MB.')
                return
            }
            mediaFile = file
            
            // Preview could be added here
            alert(`Media selected: ${file.name}`)
        }
    })

    // Submit post
    if (submitPost) {
        submitPost.addEventListener('click', async () => {
            const content = postContent.value.trim()
            
            if (!content && !mediaFile) {
                alert('Post cannot be empty')
                return
            }

            if (content.length > 280) {
                alert('Post content too long. Maximum 280 characters.')
                return
            }

            submitPost.disabled = true
            submitPost.textContent = 'Posting...'

            try {
                let mediaUrl = null
                let mediaType = null

                // Upload media if present
                if (mediaFile) {
                    const uploadResult = await uploadMedia(mediaFile, 'posts')
                    if (uploadResult) {
                        mediaUrl = uploadResult.url
                        mediaType = uploadResult.type
                    }
                }

                // Create post in database
                const { data, error } = await supabase
                    .from('posts')
                    .insert([{
                        user_id: user.id,
                        content,
                        media_url: mediaUrl,
                        media_type: mediaType,
                        boost_level: 0
                    }])
                    .select()
                    .single()

                if (error) throw error

                // Reset form
                postContent.value = ''
                mediaFile = null
                mediaUpload.value = ''
                charCount.textContent = '280'
                
                // Reload feed
                window.dispatchEvent(new CustomEvent('feedUpdate'))

                // Show success message
                showMessage('Post created successfully!', 'success')

            } catch (error) {
                console.error('Error creating post:', error)
                showMessage('Error creating post: ' + error.message, 'error')
            } finally {
                submitPost.disabled = false
                submitPost.textContent = 'Post'
            }
        })
    }

    // Handle FAB
    const createPostFab = document.getElementById('createPostFab')
    if (createPostFab) {
        createPostFab.addEventListener('click', () => {
            postContent.focus()
            window.scrollTo({ top: 0, behavior: 'smooth' })
        })
    }
})

function showMessage(text, type) {
    // Create or find message element
    let messageDiv = document.getElementById('message')
    if (!messageDiv) {
        messageDiv = document.createElement('div')
        messageDiv.id = 'message'
        document.body.appendChild(messageDiv)
    }
    
    messageDiv.textContent = text
    messageDiv.className = `message ${type}`
    messageDiv.style.display = 'block'
    messageDiv.style.position = 'fixed'
    messageDiv.style.top = '80px'
    messageDiv.style.right = '20px'
    messageDiv.style.zIndex = '1000'
    
    setTimeout(() => {
        messageDiv.style.display = 'none'
    }, 3000)
}