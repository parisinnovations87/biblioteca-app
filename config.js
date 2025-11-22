// ========================================
// CONFIGURAZIONE GOOGLE OAUTH E SHEETS API
// ========================================

// Configurazione Google OAuth 2.0
const GOOGLE_CONFIG = {
    CLIENT_ID: '518761705793-inmf74jri72btcu3cj1f7uq8it19n3ij.apps.googleusercontent.com',
    
    SCOPES: [
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/userinfo.email',
        'https://www.googleapis.com/auth/userinfo.profile'
    ].join(' '),
    
    REDIRECT_URI: window.location.origin
};

// Configurazione Google Sheets
const SHEETS_CONFIG = {
    SHEET_ID: '1sXpyc1dQer1B3srXuI0e9ZC26-N3l4Q-E63QBHp6mcs',
    
    SHEET_NAME: 'Libri',
    
    HEADERS: [
        'ID', 'Titolo', 'Autore', 'ISBN', 'Casa_Editrice', 
        'Anno', 'Categoria', 'Parole_Chiave', 'Scaffale', 'Posizione', 'Condizioni', 
        'Note', 'Data_Aggiunta', 'User_ID', 'User_Name'
    ]
};

// URLs API Google
const GOOGLE_APIS = {
    SHEETS_READ: `https://sheets.googleapis.com/v4/spreadsheets/${SHEETS_CONFIG.SHEET_ID}/values/${SHEETS_CONFIG.SHEET_NAME}`,
    SHEETS_WRITE: `https://sheets.googleapis.com/v4/spreadsheets/${SHEETS_CONFIG.SHEET_ID}/values/${SHEETS_CONFIG.SHEET_NAME}:append`,
    SHEETS_UPDATE: `https://sheets.googleapis.com/v4/spreadsheets/${SHEETS_CONFIG.SHEET_ID}/values/${SHEETS_CONFIG.SHEET_NAME}`,
    USERINFO: 'https://www.googleapis.com/oauth2/v2/userinfo'
};

// Verifica se la configurazione è valida - CORRETTA
function isConfigurationValid() {
    const isGoogleConfigValid = GOOGLE_CONFIG.CLIENT_ID && 
                               GOOGLE_CONFIG.CLIENT_ID !== 'YOUR_GOOGLE_CLIENT_ID_HERE.apps.googleusercontent.com';
    
    const isSheetsConfigValid = SHEETS_CONFIG.SHEET_ID && 
                               SHEETS_CONFIG.SHEET_ID !== 'YOUR_GOOGLE_SHEET_ID_HERE';
    
    console.log('🔧 Controllo Configurazione:');
    console.log('- Google Client ID configurato:', isGoogleConfigValid);
    console.log('- Google Sheet ID configurato:', isSheetsConfigValid);
    
    return isGoogleConfigValid && isSheetsConfigValid;
}

// Modalità di sviluppo
const DEV_MODE = window.location.hostname === 'localhost' || 
                 window.location.hostname === '127.0.0.1' ||
                 window.location.hostname.includes('netlify');

// Debug configurazione
if (DEV_MODE) {
    console.log('🔧 Configurazione Google:', {
        clientIdConfigured: !!GOOGLE_CONFIG.CLIENT_ID && GOOGLE_CONFIG.CLIENT_ID !== 'YOUR_GOOGLE_CLIENT_ID_HERE.apps.googleusercontent.com',
        sheetIdConfigured: !!SHEETS_CONFIG.SHEET_ID && SHEETS_CONFIG.SHEET_ID !== 'YOUR_GOOGLE_SHEET_ID_HERE',
        redirectUri: GOOGLE_CONFIG.REDIRECT_URI,
        isValid: isConfigurationValid()
    });
}
