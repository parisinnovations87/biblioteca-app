// ========================================
// GESTIONE CATEGORIE UTENTE
// ========================================

let userCategories = [];

// Carica le categorie dell'utente da Google Sheets
async function loadUserCategories() {
    if (!currentUser) return;
    
    if (currentUser.authMethod === 'google' && accessToken) {
        await loadCategoriesFromGoogleSheets();
    } else {
        loadCategoriesFromLocalStorage();
    }
    
    updateCategoryDropdown();
    displayCategories();
}

// Carica da Google Sheets
async function loadCategoriesFromGoogleSheets() {
    if (!accessToken) {
        console.log('❌ Token non disponibile, carico da localStorage');
        loadCategoriesFromLocalStorage();
        return;
    }

    try {
        console.log('📥 Caricamento categorie da Google Sheets...');
        
        const response = await fetch(`${GOOGLE_APIS.CATEGORIES_READ}?valueRenderOption=UNFORMATTED_VALUE`, {
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
                console.log('⚠️ Foglio "Categorie" non trovato, lo inizializzo...');
                await initializeCategoriesSheet();
                userCategories = [];
                saveCategoriesToLocalStorage();
                return;
            }
            
            throw new Error(`HTTP ${response.status}: ${errorData.error?.message || response.statusText}`);
        }

        const data = await response.json();
        
        if (data.values && data.values.length > 1) {
            const headers = data.values[0];
            const rows = data.values.slice(1);
            
            userCategories = rows
                .filter(row => row[0] === currentUser.id)
                .map(row => ({
                    userId: row[0],
                    name: row[1],
                    dateCreated: row[2]
                }));
            
            console.log(`✅ Caricate ${userCategories.length} categorie da Google Sheets`);
        } else {
            userCategories = [];
            
            if (!data.values || data.values.length === 0) {
                await initializeCategoriesSheet();
            }
        }

        saveCategoriesToLocalStorage();

    } catch (error) {
        console.error('❌ Errore caricamento categorie:', error);
        showAlert('Errore caricamento categorie: ' + error.message, 'error');
        loadCategoriesFromLocalStorage();
    }
}

// Inizializza il foglio Categorie
async function initializeCategoriesSheet() {
    if (!accessToken) return;

    try {
        const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEETS_CONFIG.SHEET_ID}/values/${SHEETS_CONFIG.CATEGORIES_SHEET_NAME}?valueInputOption=RAW`, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                values: [SHEETS_CONFIG.CATEGORIES_HEADERS]
            })
        });

        if (response.ok) {
            console.log('✅ Foglio Categorie inizializzato');
        }
    } catch (error) {
        console.error('❌ Errore inizializzazione foglio Categorie:', error);
    }
}

// Carica da localStorage
function loadCategoriesFromLocalStorage() {
    if (currentUser) {
        const saved = localStorage.getItem('userCategories_' + currentUser.id);
        userCategories = saved ? JSON.parse(saved) : [];
        console.log(`📱 Caricate ${userCategories.length} categorie da localStorage`);
    }
}

// Salva su localStorage
function saveCategoriesToLocalStorage() {
    if (currentUser) {
        localStorage.setItem('userCategories_' + currentUser.id, JSON.stringify(userCategories));
    }
}

// Aggiungi nuova categoria
async function addCategory() {
    const categoryName = document.getElementById('categoryName').value.trim();
    
    if (!categoryName) {
        showAlert('Inserisci il nome della categoria', 'error');
        return;
    }
    
    if (userCategories.some(cat => cat.name.toLowerCase() === categoryName.toLowerCase())) {
        showAlert('Questa categoria esiste già', 'error');
        return;
    }
    
    const category = {
        userId: currentUser.id,
        name: categoryName,
        dateCreated: new Date().toLocaleDateString('it-IT')
    };
    
    userCategories.push(category);
    saveCategoriesToLocalStorage();
    updateCategoryDropdown();
    displayCategories();
    
    document.getElementById('categoryName').value = '';
    showAlert('Categoria aggiunta localmente!', 'success');
    
    if (currentUser.authMethod === 'google' && accessToken) {
        const saved = await saveCategoryToGoogleSheets(category);
        
        if (saved) {
            showAlert('Categoria sincronizzata con Google Sheets!', 'success');
        } else {
            showAlert('Categoria salvata solo localmente.', 'info');
        }
    }
}

// Salva categoria su Google Sheets
async function saveCategoryToGoogleSheets(category) {
    if (!accessToken) return false;

    try {
        const categoryRow = [
            category.userId,
            category.name,
            category.dateCreated
        ];
        
        const response = await fetch(`${GOOGLE_APIS.CATEGORIES_WRITE}?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                values: [categoryRow]
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            
            if (response.status === 401) {
                await refreshTokenIfNeeded();
                return false;
            }
            
            if (response.status === 404) {
                showAlert('Foglio "Categorie" non trovato. Crealo su Google Sheets', 'error');
                return false;
            }
            
            throw new Error(`HTTP ${response.status}: ${errorData.error?.message || response.statusText}`);
        }

        console.log('✅ Categoria salvata su Google Sheets:', category.name);
        return true;

    } catch (error) {
        console.error('❌ Errore salvataggio categoria:', error);
        return false;
    }
}

// Elimina categoria
async function deleteCategory(categoryName) {
    const booksInCategory = books.filter(book => book.genre === categoryName);
    
    if (booksInCategory.length > 0) {
        if (!confirm(`Ci sono ${booksInCategory.length} libri in questa categoria. Eliminandola, dovrai riassegnare i libri. Continuare?`)) {
            return;
        }
    } else {
        if (!confirm(`Sei sicuro di voler eliminare la categoria "${categoryName}"?`)) {
            return;
        }
    }
    
    userCategories = userCategories.filter(cat => cat.name !== categoryName);
    
    if (currentUser.authMethod === 'google' && accessToken) {
        await deleteCategoryFromGoogleSheets(categoryName);
    }
    
    saveCategoriesToLocalStorage();
    updateCategoryDropdown();
    displayCategories();
    
    showAlert('Categoria eliminata', 'success');
}

// Elimina categoria da Google Sheets
async function deleteCategoryFromGoogleSheets(categoryName) {
    if (!accessToken) return false;

    try {
        const rowIndex = await findCategoryRowInSheet(categoryName);
        
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
                            sheetId: await getCategoriesSheetId(),
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

        console.log('✅ Categoria eliminata da Google Sheets');
        return true;

    } catch (error) {
        console.error('❌ Errore eliminazione categoria:', error);
        return false;
    }
}

// Trova riga categoria nel foglio
async function findCategoryRowInSheet(categoryName) {
    try {
        const response = await fetch(`${GOOGLE_APIS.CATEGORIES_READ}?valueRenderOption=UNFORMATTED_VALUE`, {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const data = await response.json();
        
        if (!data.values || data.values.length <= 1) return -1;

        for (let i = 1; i < data.values.length; i++) {
            if (data.values[i][0] === currentUser.id && data.values[i][1] === categoryName) {
                return i + 1;
            }
        }

        return -1;

    } catch (error) {
        console.error('❌ Errore ricerca categoria:', error);
        return -1;
    }
}

// Ottieni ID del foglio Categorie
async function getCategoriesSheetId() {
    try {
        const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEETS_CONFIG.SHEET_ID}`, {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const data = await response.json();
        
        const categoriesSheet = data.sheets.find(sheet => 
            sheet.properties.title === SHEETS_CONFIG.CATEGORIES_SHEET_NAME
        );

        if (!categoriesSheet) return 0;

        return categoriesSheet.properties.sheetId;

    } catch (error) {
        console.error('❌ Errore recupero Sheet ID:', error);
        return 0;
    }
}

// Visualizza categorie
function displayCategories() {
    const categoriesList = document.getElementById('categoriesList');
    
    if (!categoriesList) return;
    
    if (userCategories.length === 0) {
        categoriesList.innerHTML = `
            <div class="empty-state">
                <div class="icon">📚</div>
                <h3>Nessuna categoria configurata</h3>
                <p>Aggiungi le tue categorie personalizzate!</p>
            </div>
        `;
        return;
    }
    
    categoriesList.innerHTML = userCategories.map(category => {
        const booksCount = books.filter(b => b.genre === category.name).length;
        return `
            <div class="library-card">
                <div class="library-info">
                    <h3>📚 ${category.name}</h3>
                    <p>Aggiunta il: ${category.dateCreated}</p>
                    <p>Libri: ${booksCount}</p>
                </div>
                <button class="delete-btn" onclick="deleteCategory('${category.name.replace(/'/g, "\\'")}')">Elimina</button>
            </div>
        `;
    }).join('');
}

// Aggiorna dropdown categoria
function updateCategoryDropdown() {
    const genreSelect = document.getElementById('genre');
    
    if (!genreSelect) return;
    
    const currentValue = genreSelect.value;
    
    genreSelect.innerHTML = '<option value="">Seleziona categoria</option>';
    
    userCategories.forEach(category => {
        const option = document.createElement('option');
        option.value = category.name;
        option.textContent = category.name;
        genreSelect.appendChild(option);
    });
    
    const addNewOption = document.createElement('option');
    addNewOption.value = '__ADD_NEW__';
    addNewOption.textContent = '➕ Aggiungi nuova categoria...';
    genreSelect.appendChild(addNewOption);
    
    if (currentValue && userCategories.some(cat => cat.name === currentValue)) {
        genreSelect.value = currentValue;
    }
}

// Gestisce selezione categoria
function handleCategorySelection() {
    const genreSelect = document.getElementById('genre');
    
    if (genreSelect.value === '__ADD_NEW__') {
        const categoryName = prompt('Inserisci il nome della nuova categoria:');
        
        if (categoryName && categoryName.trim()) {
            const trimmedName = categoryName.trim();
            
            if (userCategories.some(cat => cat.name.toLowerCase() === trimmedName.toLowerCase())) {
                showAlert('Questa categoria esiste già', 'error');
                genreSelect.value = trimmedName;
                return;
            }
            
            const category = {
                userId: currentUser.id,
                name: trimmedName,
                dateCreated: new Date().toLocaleDateString('it-IT')
            };
            
            userCategories.push(category);
            saveCategoriesToLocalStorage();
            
            if (currentUser.authMethod === 'google' && accessToken) {
                saveCategoryToGoogleSheets(category).then(saved => {
                    if (saved) {
                        showAlert('Categoria aggiunta e sincronizzata!', 'success');
                    } else {
                        showAlert('Categoria aggiunta localmente', 'info');
                    }
                });
            }
            
            updateCategoryDropdown();
            genreSelect.value = trimmedName;
            
            showAlert('Categoria aggiunta!', 'success');
        } else {
            genreSelect.value = '';
        }
    }
}
