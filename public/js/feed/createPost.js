// Updated for single bucket
async function uploadFile(userId, file, fileType, relatedId = null) {
    const fileExt = file.name.split('.').pop();
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).substr(2, 9);
    
    // Create folder structure
    let folder = '';
    switch(fileType) {
        case 'avatar':
            folder = 'avatars';
            break;
        case 'background':
            folder = 'backgrounds';
            break;
        case 'post':
            folder = 'posts';
            break;
        case 'message':
            folder = 'messages';
            // Add conversation folder for messages
            if (relatedId) {
                folder += '/' + relatedId;
            }
            break;
        default:
            folder = 'other';
    }
    
    const fileName = `${folder}/${userId}/${timestamp}_${randomId}.${fileExt}`;
    
    // Upload to single bucket
    const { data: uploadData, error: uploadError } = await supabase.storage
        .from('media')  // Single bucket name
        .upload(fileName, file);
    
    if (uploadError) {
        throw uploadError;
    }
    
    // Create file metadata
    const { error: metadataError } = await supabase
        .from('file_metadata')
        .insert([
            {
                user_id: userId,
                file_path: fileName,
                file_type: fileType,
                original_filename: file.name,
                mime_type: file.type,
                file_size: file.size,
                post_id: fileType === 'post' ? relatedId : null,
                message_id: fileType === 'message' ? relatedId : null
            }
        ]);
    
    if (metadataError) {
        // Try to delete the uploaded file
        await supabase.storage.from('media').remove([fileName]);
        throw metadataError;
    }
    
    // Get public URL
    const { data: urlData } = supabase.storage
        .from('media')
        .getPublicUrl(fileName);
    
    return {
        url: urlData.publicUrl,
        path: fileName,
        type: getMediaType(file.type)
    };
}

function getMediaType(mimeType) {
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType.startsWith('video/')) return 'video';
    return 'file';
}