// public/js/guards/authGuard.js
import { supabase } from '../config/supabase.js';

export async function requireAuth(redirectTo = '/login.html') {
    const { data } = await supabase.auth.getSession();
    
    if (!data.session) {
        window.location.href = redirectTo;
        return null;
    }
    
    return data.session;
}

export async function redirectIfAuthenticated(redirectTo = '/feed.html') {
    const { data } = await supabase.auth.getSession();
    
    if (data.session) {
        window.location.href = redirectTo;
        return true;
    }
    
    return false;
}

export async function getCurrentUser() {
    const { data } = await supabase.auth.getSession();
    return data.session?.user || null;
}

export async function logout() {
    await supabase.auth.signOut();
    window.location.href = '/index.html';
}
