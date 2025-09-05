// ========================================
// GOOGLE OAUTH 2.0 AUTHENTICATION
// ========================================

// Variabili globali per l'autenticazione
let gapi_loaded = false;
let google_loaded = false;
let tokenClient = null;
let accessToken = null;

// Inizializzazione Google APIs
function initializeGoogleAPIs() {
    if (!isConfigurationValid()) {
        console.warn('⚠️ Configurazione Google non valida, usando autenticazione locale');
        showFallbackLogin();
        return;
    }

    // Carica Google Identity Services
    if (typeof google !== 'undefined') {
        google_loaded = true;
        initializeGSI();
    } else {
        // Fallback se Google non è caricato
        setTimeout(() => {
            if (typeof google !== 'undefined') {
                google_loaded = true;
                initializeGSI();
            } else {
                console.warn('Google Identity Services non disponibile');
                showFallbackLogin();
            }
        }, 2000);
    }
}

// Inizializza Google Sign-In
function initializeGSI() {
    try {
        // Inizializza il token client per OAuth 2.0
        tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: GOOGLE_CONFIG.CLIENT_ID,
            scope: GOOGLE_CONFIG.SCOPES,
            callback: handleAuthResponse
        });

        // Controlla se l'utente è già autenticato
        checkExistingAuth();
        
        console.log('✅ Google OAuth inizializzato correttamente');
        
    } catch (error) {
        console.error('❌ Errore inizializzazione Google OAuth:', error);
        showFallbackLogin();
    }
}

// Gestisce la risposta dell'autenticazione
function handleAuthResponse(tokenResponse) {
    if (tokenResponse.error) {
        console.error('❌ Errore autenticazione:', tokenResponse.error);
        showAlert('Errore durante l\'autenticazione con Google', 'error');
        showFallbackLogin();
        return;
    }

    accessToken = tokenResponse.access_token;
    
    // Salva il token in localStorage per persistenza
    localStorage.setItem('google_access_token', accessToken);
    localStorage.setItem('google_token_expiry', Date.now() + (tokenResponse.expires_in * 1000));
    
    // Ottieni le informazioni dell'utente
    fetchUserInfo();
}

// Controlla se esiste già un'autenticazione valida
function checkExistingAuth() {
    const savedToken = localStorage.getItem('google_access_token');
    const tokenExpiry = localStorage.getItem('google_token_expiry');
    
    if (savedToken && tokenExpiry && Date.now() < parseInt(tokenExpiry)) {
        accessToken = savedToken;
        console.log('🔑 Token Google valido trovato');
        
        // Verifica che il token sia ancora valido
        fetchUserInfo();
    }
}

// Avvia il processo di sign-in
function signInWithGoogle() {
    if (!isConfigurationValid()) {
        showAlert('Configurazione Google non valida', 'error');
        showFallbackLogin();
        return;
    }

    if (!tokenClient) {
        showAlert('Servizio di autenticazione Google non disponibile', 'error');
        showFallbackLogin();
        return;
    }

    setLoginLoading(true);
    
    try {
        // Richiedi l'autorizzazione
        tokenClient.requestAccessToken({ prompt: 'select_account' });
    } catch (error) {
        console.error('❌ Errore durante sign-in:', error);
        setLoginLoading(false);
        showAlert('Errore durante l\'accesso con Google', 'error');
        showFallbackLogin();
    }
}

// Ottieni informazioni utente da Google
async function fetchUserInfo() {
    if (!accessToken) {
        console.error('❌ Token di accesso non disponibile');
        return;
    }

    try {
        setLoginLoading(true);
        
        const response = await fetch(GOOGLE_APIS.USERINFO, {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const userInfo = await response.json();
        
        // Crea oggetto utente
        currentUser = {
            id: userInfo.id,
            name: userInfo.name || userInfo.given_name || 'Utente Google',
            email: userInfo.email,
            avatar: userInfo.picture,
            loginDate: new Date().toISOString(),
            authMethod: 'google',
            accessToken: accessToken
        };

        // Salva utente corrente
        localStorage.setItem('currentUser', JSON.stringify(currentUser));
        
        console.log('✅ Utente autenticato:', currentUser.name);
        
        // Mostra l'app
        setLoginLoading(false);
        showApp();
        
        // Carica i libri dal Google Sheet
        await loadBooksFromGoogleSheets();
        
        showAlert(`Benvenuto ${currentUser.name}!`, 'success');

    } catch (error) {
        console.error('❌ Errore nel recupero informazioni utente:', error);
        setLoginLoading(false);
        
        // Se il token non è valido, rimuovilo
        localStorage.removeItem('google_access_token');
        localStorage.removeItem('google_token_expiry');
        accessToken = null;
        
        showAlert('Errore nell\'autenticazione. Riprova.', 'error');
        showFallbackLogin();
    }
}

// Logout da Google
async function signOutGoogle() {
    try {
        if (accessToken) {
            // Revoca il token
            await fetch(`https://oauth2.googleapis.com/revoke?token=${accessToken}`, {
                method: 'POST'
            });
        }
        
        // Pulisci i dati locali
        localStorage.removeItem('google_access_token');
        localStorage.removeItem('google_token_expiry');
        accessToken = null;
        
        console.log('✅ Logout da Google completato');
        
    } catch (error) {
        console.error('❌ Errore durante logout Google:', error);
    }
}

// Controlla se il token è ancora valido
function isTokenValid() {
    const tokenExpiry = localStorage.getItem('google_token_expiry');
    return tokenExpiry && Date.now() < parseInt(tokenExpiry);
}

// Refresh del token se necessario
async function refreshTokenIfNeeded() {
    if (!accessToken || !isTokenValid()) {
        console.log('🔄 Token scaduto, richiedendo nuovo accesso...');
        
        // Rimuovi token scaduto
        localStorage.removeItem('google_access_token');
        localStorage.removeItem('google_token_expiry');
        accessToken = null;
        
        // Se l'utente era loggato, mostra messaggio e richiedi nuovo login
        if (currentUser && currentUser.authMethod === 'google') {
            showAlert('Sessione scaduta. Accedi nuovamente.', 'info');
            signOut();
            return false;
        }
    }
    return true;
}

// Mostra il login alternativo
function showFallbackLogin() {
    const fallbackLogin = document.getElementById('fallbackLogin');
    const showFallbackBtn = document.getElementById('showFallbackBtn');
    
    if (fallbackLogin) {
        fallbackLogin.classList.remove('hidden');
    }
    if (showFallbackBtn) {
        showFallbackBtn.style.display = 'none';
    }
}

// Nasconde il login alternativo
function hideFallbackLogin() {
    const fallbackLogin = document.getElementById('fallbackLogin');
    const showFallbackBtn = document.getElementById('showFallbackBtn');
    
    if (fallbackLogin) {
        fallbackLogin.classList.add('hidden');
    }
    if (showFallbackBtn) {
        showFallbackBtn.style.display = 'block';
    }
}

// Gestisce lo stato di loading del login
function setLoginLoading(loading) {
    const loginBtn = document.getElementById('googleSignInBtn');
    const loginLoading = document.getElementById('loginLoading');
    
    if (loading) {
        if (loginBtn) loginBtn.style.display = 'none';
        if (loginLoading) loginLoading.classList.remove('hidden');
    } else {
        if (loginBtn) loginBtn.style.display = 'flex';
        if (loginLoading) loginLoading.classList.add('hidden');
    }
}

// Mostra lo stato dell'autenticazione
function updateAuthStatus(message, type = 'info') {
    const authStatus = document.getElementById('authStatus');
    if (authStatus) {
        authStatus.textContent = message;
        authStatus.className = `auth-status auth-${type}`;
    }
}

// Inizializzazione quando il DOM è pronto
document.addEventListener('DOMContentLoaded', function() {
    // Attendi un momento per permettere il caricamento di Google APIs
    setTimeout(() => {
        initializeGoogleAPIs();
    }, 100);
});