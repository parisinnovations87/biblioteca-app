// ========================================
// GESTIONE PAROLE CHIAVE UTENTE
// ========================================

let userKeywords = [];
let selectedKeywords = [];

// Carica le parole chiave dell'utente da Google Sheets
async function loadUserKeywords() {
    if (!currentUser) return;
    
    if (currentUser.authMethod === 'google' && accessToken) {
        await loadKeywordsFromGoogleSheets();
    } else {
        loadKeywordsFromLocalStorage();
    }
    
    updateKeywordDropdown();
    displayKeywords();
}

// Carica da Google Sheets
async function loadKeywordsFromGoogleSheets() {
    if (!accessToken) {
        console.log('❌ Token non disponibile, carico da localStorage');
        loadKeywordsFromLocalStorage();
        return;
    }

    try {
        console.log('📥 Caricamento parole chiave da Google Sheets...');
        
        const response = await fetch(`${GOOGLE_APIS.KEYWORDS_READ}?valueRenderOption=UNFORMATTED_VALUE`, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            const errorData = await response.json();
            
            if (response.status === 401) {
                await refreshTokenIfNeeded();
                return;
            }
            
            if (response.status === 404 || response.status === 400) {
                console.log('⚠️ Foglio "Parole_Chiave" non trovato, lo inizializzo...');
                await initializeKeywordsSheet();
                userKeywords = [];
                saveKeywordsToLocalStorage();
                return;
            }
            
            throw new Error(`HTTP ${response.status}: ${errorData.error?.message || response.statusText}`);
        }

        const data = await response.json();
        
        if (data.values && data.values.length > 1) {
            const headers = data.values[0];
            const rows = data.values.slice(1);
            
            userKeywords = rows
                .filter(row => row[0] === currentUser.id)
                .map(row => ({
                    userId: row[0],
                    name: row[1],
                    dateCreated: row[2]
                }));
            
            console.log(`✅ Caricate ${userKeywords.length} parole chiave da Google Sheets`);
        } else {
            userKeywords = [];
            
            if (!data.values || data.values.length === 0) {
                await initializeKeywordsSheet();
            }
        }

        saveKeywordsToLocalStorage();

    } catch (error) {
        console.error('❌ Errore caricamento parole chiave:', error);
        showAlert('Errore caricamento parole chiave: ' + error.message, 'error');
        loadKeywordsFromLocalStorage();
    }
}

// Inizializza il foglio Parole Chiave
async function initializeKeywordsSheet() {
    if (!accessToken) return;

    try {
        const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEETS_CONFIG.SHEET_ID}/values/${SHEETS_CONFIG.KEYWORDS_SHEET_NAME}?valueInputOption=RAW`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                values: [SHEETS_CONFIG.KEYWORDS_HEADERS]
            })
        });

        if (response.ok) {
            console.log('✅ Foglio Parole Chiave inizializzato');
        }
    } catch (error) {
        console.error('❌ Errore inizializzazione foglio Parole Chiave:', error);
    }
}

// Carica da localStorage
function loadKeywordsFromLocalStorage() {
    if (currentUser) {
        const saved = localStorage.getItem('userKeywords_' + currentUser.id);
        userKeywords = saved ? JSON.parse(saved) : [];
        console.log(`📱 Caricate ${userKeywords.length} parole chiave da localStorage`);
    }
}

// Salva su localStorage
function saveKeywordsToLocalStorage() {
    if (currentUser) {
        localStorage.setItem('userKeywords_' + currentUser.id, JSON.stringify(userKeywords));
    }
}

// Aggiungi nuova parola chiave
async function addKeyword() {
    const keywordName = document.getElementById('keywordName').value.trim();
    
    if (!keywordName) {
        showAlert('Inserisci la parola chiave', 'error');
        return;
    }
    
    if (userKeywords.some(kw => kw.name.toLowerCase() === keywordName.toLowerCase())) {
        showAlert('Questa parola chiave esiste già', 'error');
        return;
    }
    
    const keyword = {
        userId: currentUser.id,
        name: keywordName,
        dateCreated: new Date().toLocaleDateString('it-IT')
    };
    
    userKeywords.push(keyword);
    saveKeywordsToLocalStorage();
    updateKeywordDropdown();
    displayKeywords();
    
    document.getElementById('keywordName').value = '';
    showAlert('Parola chiave aggiunta localmente!', 'success');
    
    if (currentUser.authMethod === 'google' && accessToken) {
        const saved = await saveKeywordToGoogleSheets(keyword);
        
        if (saved) {
            showAlert('Parola chiave sincronizzata con Google Sheets!', 'success');
        } else {
            showAlert('Parola chiave salvata solo localmente.', 'info');
        }
    }
}

// Salva parola chiave su Google Sheets
async function saveKeywordToGoogleSheets(keyword) {
    if (!accessToken) return false;

    try {
        const keywordRow = [
            keyword.userId,
            keyword.name,
            keyword.dateCreated
        ];
        
        const response = await fetch(`${GOOGLE_APIS.KEYWORDS_WRITE}?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                values: [keywordRow]
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            
            if (response.status === 401) {
                await refreshTokenIfNeeded();
                return false;
            }
            
            if (response.status === 404) {
                showAlert('Foglio "Parole_Chiave" non trovato. Crealo su Google Sheets', 'error');
                return false;
            }
            
            throw new Error(`HTTP ${response.status}: ${errorData.error?.message || response.statusText}`);
        }

        console.log('✅ Parola chiave salvata su Google Sheets:', keyword.name);
        return true;

    } catch (error) {
        console.error('❌ Errore salvataggio parola chiave:', error);
        return false;
    }
}

// Elimina parola chiave
async function deleteKeyword(keywordName) {
    const booksWithKeyword = books.filter(book => 
        book.keywords && book.keywords.split(', ').includes(keywordName)
    );
    
    if (booksWithKeyword.length > 0) {
        if (!confirm(`Ci sono ${booksWithKeyword.length} libri con questa parola chiave. Eliminandola, dovrai riassegnare le parole chiave ai libri. Continuare?`)) {
            return;
        }
    } else {
        if (!confirm(`Sei sicuro di voler eliminare la parola chiave "${keywordName}"?`)) {
            return;
        }
    }
    
    userKeywords = userKeywords.filter(kw => kw.name !== keywordName);
    
    if (currentUser.authMethod === 'google' && accessToken) {
        await deleteKeywordFromGoogleSheets(keywordName);
    }
    
    saveKeywordsToLocalStorage();
    updateKeywordDropdown();
    displayKeywords();
    
    showAlert('Parola chiave eliminata', 'success');
}

// Elimina parola chiave da Google Sheets
async function deleteKeywordFromGoogleSheets(keywordName) {
    if (!accessToken) return false;

    try {
        const rowIndex = await findKeywordRowInSheet(keywordName);
        
        if (rowIndex === -1) {
            return true;
        }

        const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEETS_CONFIG.SHEET_ID}:batchUpdate`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                requests: [{
                    deleteDimension: {
                        range: {
                            sheetId: await getKeywordsSheetId(),
                            dimension: 'ROWS',
                            startIndex: rowIndex - 1,
                            endIndex: rowIndex
                        }
                    }
                }]
            })
        });

        if (!response.ok) {
            if (response.status === 401) {
                await refreshTokenIfNeeded();
                return false;
            }
            throw new Error(`HTTP ${response.status}`);
        }

        console.log('✅ Parola chiave eliminata da Google Sheets');
        return true;

    } catch (error) {
        console.error('❌ Errore eliminazione parola chiave:', error);
        return false;
    }
}

// Trova riga parola chiave nel foglio
async function findKeywordRowInSheet(keywordName) {
    try {
        const response = await fetch(`${GOOGLE_APIS.KEYWORDS_READ}?valueRenderOption=UNFORMATTED_VALUE`, {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const data = await response.json();
        
        if (!data.values || data.values.length <= 1) return -1;

        for (let i = 1; i < data.values.length; i++) {
            if (data.values[i][0] === currentUser.id && data.values[i][1] === keywordName) {
                return i + 1;
            }
        }

        return -1;

    } catch (error) {
        console.error('❌ Errore ricerca parola chiave:', error);
        return -1;
    }
}

// Ottieni ID del foglio Parole Chiave
async function getKeywordsSheetId() {
    try {
        const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEETS_CONFIG.SHEET_ID}`, {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const data = await response.json();
        
        const keywordsSheet = data.sheets.find(sheet => 
            sheet.properties.title === SHEETS_CONFIG.KEYWORDS_SHEET_NAME
        );

        if (!keywordsSheet) return 0;

        return keywordsSheet.properties.sheetId;

    } catch (error) {
        console.error('❌ Errore recupero Sheet ID:', error);
        return 0;
    }
}

// Visualizza parole chiave
function displayKeywords() {
    const keywordsList = document.getElementById('keywordsList');
    
    if (!keywordsList) return;
    
    if (userKeywords.length === 0) {
        keywordsList.innerHTML = `
            <div class="empty-state">
                <div class="icon">🔖</div>
                <h3>Nessuna parola chiave configurata</h3>
                <p>Aggiungi le tue parole chiave personalizzate!</p>
            </div>
        `;
        return;
    }
    
    keywordsList.innerHTML = userKeywords.map(keyword => {
        const booksCount = books.filter(b => 
            b.keywords && b.keywords.split(', ').includes(keyword.name)
        ).length;
        return `
            <div class="library-card">
                <div class="library-info">
                    <h3>🔖 ${keyword.name}</h3>
                    <p>Aggiunta il: ${keyword.dateCreated}</p>
                    <p>Libri: ${booksCount}</p>
                </div>
                <button class="delete-btn" onclick="deleteKeyword('${keyword.name.replace(/'/g, "\\'")}')">Elimina</button>
            </div>
        `;
    }).join('');
}

// Aggiorna dropdown parole chiave con ricerca
function updateKeywordDropdown() {
    const keywordsSelect = document.getElementById('keywords');
    
    if (!keywordsSelect) return;
    
    // Salva le parole chiave selezionate
    const currentSelected = getSelectedKeywordsArray();
    
    // Ricrea le opzioni
    keywordsSelect.innerHTML = '<option value="">Nessuna parola chiave selezionata</option>';
    
    userKeywords.forEach(keyword => {
        const option = document.createElement('option');
        option.value = keyword.name;
        option.textContent = keyword.name;
        keywordsSelect.appendChild(option);
    });
    
    const addNewOption = document.createElement('option');
    addNewOption.value = '__ADD_NEW__';
    addNewOption.textContent = '➕ Aggiungi nuova parola chiave...';
    keywordsSelect.appendChild(addNewOption);
    
    // Ripristina selezioni
    if (currentSelected.length > 0) {
        setSelectedKeywordsArray(currentSelected);
    }
}

// Gestisce selezione parola chiave dal dropdown
function handleKeywordSelection() {
    const keywordsSelect = document.getElementById('keywords');
    const selectedValue = keywordsSelect.value;
    
    if (selectedValue === '__ADD_NEW__') {
        const keywordName = prompt('Inserisci la nuova parola chiave:');
        
        if (keywordName && keywordName.trim()) {
            const trimmedName = keywordName.trim();
            
            if (userKeywords.some(kw => kw.name.toLowerCase() === trimmedName.toLowerCase())) {
                showAlert('Questa parola chiave esiste già', 'error');
                keywordsSelect.value = '';
                return;
            }
            
            const keyword = {
                userId: currentUser.id,
                name: trimmedName,
                dateCreated: new Date().toLocaleDateString('it-IT')
            };
            
            userKeywords.push(keyword);
            saveKeywordsToLocalStorage();
            
            if (currentUser.authMethod === 'google' && accessToken) {
                saveKeywordToGoogleSheets(keyword).then(saved => {
                    if (saved) {
                        showAlert('Parola chiave aggiunta e sincronizzata!', 'success');
                    } else {
                        showAlert('Parola chiave aggiunta localmente', 'info');
                    }
                });
            }
            
            updateKeywordDropdown();
            
            // Aggiungi la nuova parola chiave alla selezione
            addKeywordToSelection(trimmedName);
            
            showAlert('Parola chiave aggiunta!', 'success');
        }
        
        keywordsSelect.value = '';
        return;
    }
    
    if (selectedValue && selectedValue !== '') {
        addKeywordToSelection(selectedValue);
        keywordsSelect.value = '';
    }
}

// Aggiungi parola chiave alla selezione
function addKeywordToSelection(keywordName) {
    const selectedKeywordsDiv = document.getElementById('selectedKeywords');
    
    // Verifica se è già selezionata
    const existingTag = selectedKeywordsDiv.querySelector(`[data-keyword="${keywordName}"]`);
    if (existingTag) {
        showAlert('Questa parola chiave è già selezionata', 'info');
        return;
    }
    
    // Crea il tag
    const tag = document.createElement('span');
    tag.className = 'keyword-tag';
    tag.setAttribute('data-keyword', keywordName);
    tag.innerHTML = `
        ${keywordName}
        <button type="button" onclick="removeKeywordFromSelection('${keywordName.replace(/'/g, "\\'")}')">×</button>
    `;
    
    selectedKeywordsDiv.appendChild(tag);
}

// Rimuovi parola chiave dalla selezione
function removeKeywordFromSelection(keywordName) {
    const selectedKeywordsDiv = document.getElementById('selectedKeywords');
    const tag = selectedKeywordsDiv.querySelector(`[data-keyword="${keywordName}"]`);
    if (tag) {
        tag.remove();
    }
}

// Ottieni array delle parole chiave selezionate
function getSelectedKeywordsArray() {
    const selectedKeywordsDiv = document.getElementById('selectedKeywords');
    const tags = selectedKeywordsDiv.querySelectorAll('.keyword-tag');
    return Array.from(tags).map(tag => tag.getAttribute('data-keyword'));
}

// Imposta array delle parole chiave selezionate
function setSelectedKeywordsArray(keywords) {
    const selectedKeywordsDiv = document.getElementById('selectedKeywords');
    selectedKeywordsDiv.innerHTML = '';
    
    keywords.forEach(keyword => {
        if (userKeywords.some(kw => kw.name === keyword)) {
            addKeywordToSelection(keyword);
        }
    });
}

// Ottieni stringa delle parole chiave selezionate (per salvataggio)
function getSelectedKeywords() {
    return getSelectedKeywordsArray().join(', ');
}

// Imposta parole chiave selezionate da stringa (per modifica)
function setSelectedKeywords(keywordsString) {
    const keywords = keywordsString ? keywordsString.split(', ').map(k => k.trim()).filter(k => k) : [];
    setSelectedKeywordsArray(keywords);
}
