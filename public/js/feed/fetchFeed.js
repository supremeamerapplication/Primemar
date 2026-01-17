import { supabase, getCurrentUser } from '../config/supabase.js'
import { likePost, commentOnPost, sharePost, deletePost } from './postInteractions.js'

let currentFeed = 'for-you'
let postsPage = 1
const POSTS_PER_PAGE = 10

export async function loadFeed(feedType = 'for-you') {
    const postsContainer = document.getElementById('postsContainer')
    if (!postsContainer) return

    postsContainer.innerHTML = `
        <div class="loading">
            <div class="spinner"></div>
        </div>
    `

    try {
        let query = supabase
            .from('posts')
            .select(`
                *,
                user:users(id, username, display_name, avatar_url, is_verified),
                likes(count),
                comments(count)
            `)
            .order('created_at', { ascending: false })
            .limit(POSTS_PER_PAGE)
            .range((postsPage - 1) * POSTS_PER_PAGE, postsPage * POSTS_PER_PAGE - 1)

        if (feedType === 'following') {
            const user = await getCurrentUser()
            if (user) {
                const { data: following } = await supabase
                    .from('follows')
                    .select('following_id')
                    .eq('follower_id', user.id)

                if (following && following.length > 0) {
                    const followingIds = following.map(f => f.following_id)
                    query = query.in('user_id', followingIds)
                } else {
                    postsContainer.innerHTML = `
                        <div class="empty-state">
                            <i class="fas fa-user-plus"></i>
                            <h3>Not following anyone yet</h3>
                            <p>Follow some users to see their posts here!</p>
                        </div>
                    `
                    return
                }
            }
        } else if (feedType === 'boosted') {
            query = query.gt('boost_level', 0).order('boost_level', { ascending: false })
        }

        const { data: posts, error } = await query

        if (error) throw error

        if (!posts || posts.length === 0) {
            if (postsPage === 1) {
                postsContainer.innerHTML = `
                    <div class="empty-state">
                        <i class="fas fa-feather-alt"></i>
                        <h3>No posts yet</h3>
                        <p>Be the first to post something!</p>
                    </div>
                `
            }
            return
        }

        renderPosts(posts)
        setupInfiniteScroll()

    } catch (error) {
        console.error('Error loading feed:', error)
        postsContainer.innerHTML = `
            <div class="error-state">
                <i class="fas fa-exclamation-triangle"></i>
                <h3>Error loading feed</h3>
                <p>Please try again later</p>
            </div>
        `
    }
}

function renderPosts(posts) {
    const postsContainer = document.getElementById('postsContainer')
    if (!postsContainer) return

    if (postsPage === 1) {
        postsContainer.innerHTML = ''
    }

    posts.forEach(post => {
        const postElement = createPostElement(post)
        postsContainer.appendChild(postElement)
    })
}

function createPostElement(post) {
    const postElement = document.createElement('div')
    postElement.className = 'post-card'
    postElement.dataset.postId = post.id

    const user = post.user
    const likeCount = post.likes[0]?.count || 0
    const commentCount = post.comments[0]?.count || 0
    
    const mediaHtml = post.media_url ? `
        <div class="post-media">
            ${post.media_type?.startsWith('image') 
                ? `<img src="${post.media_url}" alt="Post media" loading="lazy">`
                : post.media_type?.startsWith('video')
                ? `<video controls src="${post.media_url}"></video>`
                : ''
            }
        </div>
    ` : ''

    const boostBadge = post.boost_level > 0 ? `
        <span class="boost-indicator">
            <i class="fas fa-rocket"></i>
            Boosted x${post.boost_level}
        </span>
    ` : ''

    postElement.innerHTML = `
        <div class="post-header">
            <img src="${user.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.display_name || user.username)}&background=1DA1F2&color=fff`}" 
                 alt="${user.display_name}" 
                 class="avatar-md">
            <div class="post-user-info">
                <div>
                    <span class="post-username ${user.is_verified ? 'verified' : ''}">
                        ${user.display_name || user.username}
                    </span>
                    <span class="post-handle">@${user.username}</span>
                    ${boostBadge}
                </div>
                <span class="post-time">${formatTime(post.created_at)}</span>
            </div>
            <button class="btn-icon post-menu">
                <i class="fas fa-ellipsis-h"></i>
            </button>
        </div>
        
        <div class="post-content">${escapeHtml(post.content || '')}</div>
        
        ${mediaHtml}
        
        <div class="post-actions">
            <button class="action-btn like-btn" data-post-id="${post.id}">
                <i class="fas fa-heart"></i>
                <span class="like-count">${likeCount}</span>
            </button>
            
            <button class="action-btn comment-btn" data-post-id="${post.id}">
                <i class="fas fa-comment"></i>
                <span class="comment-count">${commentCount}</span>
            </button>
            
            <button class="action-btn share-btn" data-post-id="${post.id}">
                <i class="fas fa-share"></i>
                <span>Share</span>
            </button>
            
            <button class="action-btn boost-btn" data-post-id="${post.id}">
                <i class="fas fa-rocket"></i>
                <span>Boost</span>
            </button>
        </div>
        
        <div class="comments-section" id="comments-${post.id}" style="display: none;"></div>
    `

    // Add event listeners
    setupPostInteractions(postElement, post)

    return postElement
}

function setupPostInteractions(postElement, post) {
    // Like button
    const likeBtn = postElement.querySelector('.like-btn')
    if (likeBtn) {
        likeBtn.addEventListener('click', () => likePost(post.id))
    }

    // Comment button
    const commentBtn = postElement.querySelector('.comment-btn')
    if (commentBtn) {
        commentBtn.addEventListener('click', () => toggleComments(post.id))
    }

    // Share button
    const shareBtn = postElement.querySelector('.share-btn')
    if (shareBtn) {
        shareBtn.addEventListener('click', () => sharePost(post.id))
    }

    // Boost button (only for verified creators)
    const boostBtn = postElement.querySelector('.boost-btn')
    if (boostBtn) {
        boostBtn.addEventListener('click', () => boostPost(post.id))
    }

    // Post menu
    const menuBtn = postElement.querySelector('.post-menu')
    if (menuBtn) {
        menuBtn.addEventListener('click', (e) => showPostMenu(e, post))
    }
}

async function toggleComments(postId) {
    const commentsSection = document.getElementById(`comments-${postId}`)
    if (!commentsSection) return

    if (commentsSection.style.display === 'none') {
        commentsSection.style.display = 'block'
        await loadComments(postId, commentsSection)
    } else {
        commentsSection.style.display = 'none'
    }
}

async function loadComments(postId, container) {
    container.innerHTML = '<div class="loading"><div class="spinner"></div></div>'

    try {
        const { data: comments, error } = await supabase
            .from('comments')
            .select(`
                *,
                user:users(id, username, display_name, avatar_url)
            `)
            .eq('post_id', postId)
            .is('parent_id', null)
            .order('created_at', { ascending: false })

        if (error) throw error

        if (!comments || comments.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <p>No comments yet. Be the first to comment!</p>
                </div>
            `
            return
        }

        container.innerHTML = `
            <div class="create-comment">
                <textarea placeholder="Write a comment..." rows="2"></textarea>
                <button class="btn btn-sm btn-primary submit-comment">Post</button>
            </div>
            <div class="comments-list"></div>
        `

        const commentsList = container.querySelector('.comments-list')
        comments.forEach(comment => {
            const commentElement = createCommentElement(comment)
            commentsList.appendChild(commentElement)
        })

        // Handle new comment submission
        const submitBtn = container.querySelector('.submit-comment')
        const textarea = container.querySelector('textarea')
        
        submitBtn.addEventListener('click', async () => {
            const content = textarea.value.trim()
            if (!content) return

            const user = await getCurrentUser()
            if (!user) return

            const { error } = await supabase
                .from('comments')
                .insert([{
                    post_id: postId,
                    user_id: user.id,
                    content: content
                }])

            if (!error) {
                textarea.value = ''
                loadComments(postId, container) // Reload comments
            }
        })

    } catch (error) {
        console.error('Error loading comments:', error)
        container.innerHTML = '<p class="error">Error loading comments</p>'
    }
}

function createCommentElement(comment) {
    const div = document.createElement('div')
    div.className = 'comment'
    
    const user = comment.user
    div.innerHTML = `
        <div class="comment-header">
            <img src="${user.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(user.display_name || user.username)}&background=1DA1F2&color=fff`}" 
                 alt="${user.display_name}" 
                 class="avatar-sm">
            <div class="comment-user-info">
                <span class="comment-username">${user.display_name || user.username}</span>
                <span class="comment-time">${formatTime(comment.created_at)}</span>
            </div>
        </div>
        <div class="comment-content">${escapeHtml(comment.content)}</div>
    `
    
    return div
}

async function boostPost(postId) {
    const user = await getCurrentUser()
    if (!user || !user.is_verified) {
        alert('Only verified creators can boost posts.')
        return
    }

    // Check wallet balance
    const { data: wallet, error: walletError } = await supabase
        .from('wallets')
        .select('sa_balance')
        .eq('user_id', user.id)
        .single()

    if (walletError || wallet.sa_balance < 50) {
        alert('Insufficient SA tokens. Minimum 50 SA required for boosting.')
        return
    }

    // Show boost options modal
    const boostAmount = prompt('Enter SA amount to boost (minimum 50):', '50')
    if (!boostAmount) return

    const saAmount = parseInt(boostAmount)
    if (isNaN(saAmount) || saAmount < 50 || saAmount > wallet.sa_balance) {
        alert('Invalid amount or insufficient balance.')
        return
    }

    // Confirm boost
    if (!confirm(`Boost this post with ${saAmount} SA? This will increase its visibility.`)) {
        return
    }

    try {
        // Deduct from wallet
        const { error: walletUpdateError } = await supabase
            .from('wallets')
            .update({ sa_balance: wallet.sa_balance - saAmount })
            .eq('user_id', user.id)

        if (walletUpdateError) throw walletUpdateError

        // Calculate boost level (1 SA = 0.01 boost level)
        const boostLevel = Math.floor(saAmount / 50)

        // Update post boost level
        const { error: postUpdateError } = await supabase
            .from('posts')
            .update({ boost_level: boostLevel })
            .eq('id', postId)

        if (postUpdateError) throw postUpdateError

        // Record transaction
        await supabase
            .from('transactions')
            .insert([{
                user_id: user.id,
                type: 'boost',
                amount: -saAmount,
                currency: 'SA',
                status: 'completed',
                metadata: { post_id: postId, boost_level: boostLevel }
            }])

        alert('Post boosted successfully!')
        window.dispatchEvent(new CustomEvent('feedUpdate'))

    } catch (error) {
        console.error('Error boosting post:', error)
        alert('Error boosting post. Please try again.')
    }
}

function showPostMenu(event, post) {
    const user = getCurrentUser()
    if (!user) return

    const menu = document.createElement('div')
    menu.className = 'dropdown-menu'
    menu.style.position = 'absolute'
    menu.style.top = `${event.clientY}px`
    menu.style.left = `${event.clientX}px`

    menu.innerHTML = `
        <a href="#" class="copy-link"><i class="fas fa-link"></i> Copy Link</a>
        <a href="#" class="save-post"><i class="fas fa-bookmark"></i> Save Post</a>
        ${user.id === post.user_id ? `
            <a href="#" class="edit-post"><i class="fas fa-edit"></i> Edit</a>
            <a href="#" class="delete-post" style="color: var(--error-color);"><i class="fas fa-trash"></i> Delete</a>
        ` : `
            <a href="#" class="report-post"><i class="fas fa-flag"></i> Report</a>
            <a href="#" class="mute-user"><i class="fas fa-volume-mute"></i> Mute User</a>
            <a href="#" class="block-user" style="color: var(--error-color);"><i class="fas fa-ban"></i> Block User</a>
        `}
    `

    document.body.appendChild(menu)

    // Close menu when clicking elsewhere
    setTimeout(() => {
        const closeMenu = (e) => {
            if (!menu.contains(e.target)) {
                menu.remove()
                document.removeEventListener('click', closeMenu)
            }
        }
        document.addEventListener('click', closeMenu)
    }, 100)

    // Menu actions
    menu.querySelector('.copy-link')?.addEventListener('click', (e) => {
        e.preventDefault()
        navigator.clipboard.writeText(`${window.location.origin}/post/${post.id}`)
        alert('Link copied to clipboard!')
        menu.remove()
    })

    menu.querySelector('.delete-post')?.addEventListener('click', async (e) => {
        e.preventDefault()
        if (confirm('Are you sure you want to delete this post?')) {
            await deletePost(post.id)
            menu.remove()
        }
    })
}

function formatTime(dateString) {
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now - date
    const diffSec = Math.floor(diffMs / 1000)
    const diffMin = Math.floor(diffSec / 60)
    const diffHour = Math.floor(diffMin / 60)
    const diffDay = Math.floor(diffHour / 24)

    if (diffDay > 7) {
        return date.toLocaleDateString()
    } else if (diffDay > 0) {
        return `${diffDay}d ago`
    } else if (diffHour > 0) {
        return `${diffHour}h ago`
    } else if (diffMin > 0) {
        return `${diffMin}m ago`
    } else {
        return 'Just now'
    }
}

function escapeHtml(text) {
    const div = document.createElement('div')
    div.textContent = text
    return div.innerHTML
}

function setupInfiniteScroll() {
    window.addEventListener('scroll', () => {
        if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 500) {
            if (!isLoadingMore) {
                loadMorePosts()
            }
        }
    })
}

let isLoadingMore = false
async function loadMorePosts() {
    if (isLoadingMore) return
    isLoadingMore = true
    
    postsPage++
    await loadFeed(currentFeed)
    
    isLoadingMore = false
}

// Initialize feed when page loads
document.addEventListener('DOMContentLoaded', () => {
    // Load initial feed
    loadFeed(currentFeed)
    
    // Setup tab switching
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'))
            btn.classList.add('active')
            
            currentFeed = btn.dataset.feed
            postsPage = 1
            loadFeed(currentFeed)
        })
    })
    
    // Listen for feed updates
    window.addEventListener('feedUpdate', () => {
        postsPage = 1
        loadFeed(currentFeed)
    })
})