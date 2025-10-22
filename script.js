// script.js
// Основной модуль приложения - управление интерфейсом и бизнес-логикой

// ===== КОНСТАНТЫ И ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ =====

// Функция для получения хэша пароля (простая реализация для демонстрации)
function getPasswordHash(password) {
    let hash = 0;
    for (let i = 0; i < password.length; i++) {
        const char = password.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString();
}

// Хэши паролей вместо открытых паролей
const USER_CREDENTIALS = {
    // compound_VL -> хэш: -1500981126
    'compound_VL': {
        hash: '-1500981126',
        role: 'admin',
        name: 'Администратор'
    },
    // guest -> хэш: -1202290188
    'guest': {
        hash: '-1202290188', 
        role: 'guest',
        name: 'Гость'
    }
};

// Глобальные переменные состояния приложения
let journalData = {};
let currentDate = new Date();
let calendar;
let currentLine = 'line1';
let currentUser = null;
let autoSyncEnabled = true;

// ===== ФУНКЦИИ АВТОРИЗАЦИИ И УПРАВЛЕНИЯ ПОЛЬЗОВАТЕЛЯМИ =====

// Функция проверки авторизации пользователя
function checkAuth() {
    const login = document.getElementById('login').value.trim();
    const password = document.getElementById('password').value;
    const errorElement = document.getElementById('auth-error');
    
    // Проверка существования пользователя
    if (!USER_CREDENTIALS[login]) {
        showAuthError();
        return;
    }
    
    // Сравнение хэшей вместо открытых паролей
    const passwordHash = getPasswordHash(password);
    const userData = USER_CREDENTIALS[login];
    
    if (userData.hash === passwordHash) {
        currentUser = {
            login: login,
            role: userData.role,
            name: userData.name
        };
        
        document.getElementById('auth-overlay').style.display = 'none';
        document.querySelector('.container').style.display = 'block';
        updateUIForUserRole();
        initApp();
        errorElement.style.display = 'none';
        
        // Очистка полей после успешной авторизации
        document.getElementById('login').value = '';
        document.getElementById('password').value = '';
    } else {
        showAuthError();
    }
}

// Функция показа ошибки авторизации
function showAuthError() {
    const errorElement = document.getElementById('auth-error');
    errorElement.style.display = 'block';
    document.getElementById('password').value = '';
    showStatus('Ошибка авторизации', 'error');
}

// Обновление интерфейса в зависимости от роли пользователя
function updateUIForUserRole() {
    const userRoleElement = document.getElementById('user-role');
    const saveBtn = document.getElementById('save-btn');
    
    if (userRoleElement) {
        userRoleElement.textContent = `${currentUser.name} (${currentUser.role === 'admin' ? 'Администратор' : 'Только просмотр'})`;
    }
    
    if (currentUser.role === 'guest') {
        saveBtn.disabled = true;
        saveBtn.style.opacity = '0.6';
        saveBtn.style.cursor = 'not-allowed';
        
        document.querySelectorAll('.input-field').forEach(field => {
            field.readOnly = true;
            field.style.background = '#ecf0f1';
            field.style.cursor = 'not-allowed';
        });
        
        showStatus('🔒 Режим просмотра. Редактирование недоступно.', 'info');
    } else {
        saveBtn.disabled = false;
        saveBtn.style.opacity = '1';
        saveBtn.style.cursor = 'pointer';
        
        document.querySelectorAll('.input-field').forEach(field => {
            field.readOnly = false;
            field.style.background = 'rgba(255, 255, 255, 0.95)';
            field.style.cursor = 'text';
        });
        
        showStatus('👨‍💼 Режим администратора. Редактирование доступно.', 'success');
    }
}

// ===== ОСНОВНАЯ ИНИЦИАЛИЗАЦИЯ ПРИЛОЖЕНИЯ =====

// Основная функция инициализации приложения
async function initApp() {
    try {
        cleanupPreviousState();
        
        if (currentUser.role === 'admin' && !gitHubDB.hasToken()) {
            const tokenSet = await gitHubDB.requestToken();
            if (!tokenSet) {
                showStatus('❌ Для работы приложения требуется GitHub токен', 'error');
                return;
            }
        }
        
        await loadDataFromCloud();
        setupInputValidation();
        initCalendar();
        updateDateDisplay();
        setupLineButtons();
        
        showStatus('✅ Журнал успешно загружен', 'success');
    } catch (error) {
        console.error('Ошибка инициализации:', error);
        showStatus('❌ Ошибка инициализации: ' + error.message, 'error');
    }
}

// Очистка предыдущего состояния приложения
function cleanupPreviousState() {
    document.querySelectorAll('.input-field').forEach(field => {
        field.value = '';
        field.style.borderColor = '#dc3545';
        field.readOnly = false;
    });
    
    const activeLineBtn = document.querySelector('.line-btn.active');
    if (activeLineBtn) {
        activeLineBtn.classList.remove('active');
    }
    document.querySelector('.line-btn[data-line="line1"]').classList.add('active');
    currentLine = 'line1';
    
    currentDate = new Date();
    
    if (calendar) {
        calendar.destroy();
        calendar = null;
    }
}

// ===== УПРАВЛЕНИЕ ПРОИЗВОДСТВЕННЫМИ ЛИНИЯМИ =====

// Настройка обработчиков для кнопок выбора линии
function setupLineButtons() {
    const lineButtons = document.querySelectorAll('.line-btn');
    lineButtons.forEach(btn => {
        btn.addEventListener('click', async function() {
            lineButtons.forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            currentLine = this.getAttribute('data-line');
            
            if (autoSyncEnabled && currentUser.role === 'admin') {
                try {
                    showStatus('🔄 Автосинхронизация при переключении линии...', 'info');
                    await syncFromCloud();
                } catch (error) {
                    console.log('Автосинхронизация не удалась, используем локальные данные');
                }
            }
            
            loadDataForCurrentDate();
            showStatus(`🔄 Переключено на ${this.textContent}`, 'info');
        });
    });
}

// Получение отображаемого имени текущей линии
function getCurrentLineName() {
    const activeBtn = document.querySelector('.line-btn.active');
    return activeBtn ? activeBtn.textContent : 'Линия 1';
}

// ===== РАБОТА С КАЛЕНДАРЕМ =====

// Инициализация календаря Flatpickr
function initCalendar() {
    const calendarElement = document.getElementById('calendar');
    const calendarDisplay = document.getElementById('calendar-display');
    
    if (calendar) {
        calendar.destroy();
    }
    
    calendar = flatpickr(calendarElement, {
        locale: "ru",
        inline: true,
        showFooter: false,
        appendTo: calendarDisplay,
        defaultDate: currentDate,
        
        onChange: function(selectedDates) {
            if (selectedDates[0]) {
                currentDate = selectedDates[0];
                updateDateDisplay();
                loadDataForCurrentDate();
                showStatus(`📅 Загружены данные за ${formatDate(currentDate)} для ${getCurrentLineName()}`, 'info');
            }
        },
        
        onMonthChange: function() {
            setTimeout(highlightDates, 100);
        },
        onYearChange: function() {
            setTimeout(highlightDates, 100);
        },
        
        onReady: function() {
            setTimeout(highlightDates, 300);
            hideSixthWeek();
        },
        
        onDayCreate: function(dObj, dStr, fp, dayElem) {
            setTimeout(() => {
                const date = new Date(dayElem.dateObj);
                if (hasDataForDate(date)) {
                    dayElem.classList.add('has-data');
                }
            }, 10);
        }
    });
}

// Проверка наличия данных для указанной даты
function hasDataForDate(date) {
    const dateStr = formatDate(date);
    
    if (!journalData[currentLine] || !journalData[currentLine][dateStr] || 
        Object.keys(journalData[currentLine][dateStr]).length === 0) {
        return false;
    }
    
    const values = Object.values(journalData[currentLine][dateStr]);
    return values.some(value => {
        const numValue = parseFloat(value);
        return numValue > 0;
    });
}

// Скрытие 6-й недели в календаре
function hideSixthWeek() {
    setTimeout(() => {
        const dayContainers = document.querySelectorAll('.dayContainer');
        dayContainers.forEach((container, index) => {
            if (index >= 5) container.style.display = 'none';
        });
    }, 100);
}

// Обновление отображения текущей даты в интерфейсе
function updateDateDisplay() {
    const options = { day: 'numeric', month: 'long', year: 'numeric' };
    const dateString = currentDate.toLocaleDateString('ru-RU', options);
    document.getElementById('current-date-display').textContent = dateString;
}

// ===== РАБОТА С ДАННЫМИ И ОБЛАЧНЫМ ХРАНИЛИЩЕМ =====

// Загрузка данных из облачного хранилища
async function loadDataFromCloud() {
    try {
        if (currentUser.role === 'admin' && !gitHubDB.hasToken()) {
            throw new Error('GitHub token не установлен');
        }
        
        if (currentUser.role === 'admin') {
            await gitHubDB.testConnection();
        }
        
        journalData = await gitHubDB.loadData();
        
        if (!journalData.line1) journalData.line1 = {};
        if (!journalData.line2) journalData.line2 = {};
        if (!journalData.line3) journalData.line3 = {};
        
        console.log('Данные загружены из облака');
        return true;
    } catch (error) {
        console.error('Ошибка загрузки данных из облака:', error);
        
        if (error.message.includes('401') || error.message.includes('403')) {
            gitHubDB.clearToken();
            showStatus('❌ Неверный токен. Токен очищен. Перезагрузите страницу.', 'error');
        } else if (error.message.includes('GitHub token не установлен')) {
            console.log('Гость использует локальные данные');
        } else {
            showStatus('❌ Ошибка загрузки из облака: ' + error.message, 'error');
        }
        
        journalData = { line1: {}, line2: {}, line3: {} };
        return false;
    }
}

// Загрузка данных для текущей выбранной даты в поля ввода
function loadDataForCurrentDate() {
    const dateStr = formatDate(currentDate);
    
    document.querySelectorAll('.input-field').forEach(field => {
        const fieldId = field.getAttribute('data-id');
        if (journalData[currentLine] && 
            journalData[currentLine][dateStr] && 
            journalData[currentLine][dateStr][fieldId]) {
            field.value = journalData[currentLine][dateStr][fieldId];
        } else {
            field.value = '';
        }
    });
}

// Сохранение данных в облачное хранилище
async function saveDataToCloud() {
    if (currentUser.role === 'guest') {
        showStatus('❌ Редактирование запрещено в режиме гостя', 'error');
        return;
    }
    
    const dateStr = formatDate(currentDate);
    
    if (!journalData[currentLine]) journalData[currentLine] = {};
    if (!journalData[currentLine][dateStr]) journalData[currentLine][dateStr] = {};
    
    let hasData = false;
    let hasError = false;
    let hasNonZeroValue = false;
    
    document.querySelectorAll('.input-field').forEach(field => {
        const fieldId = field.getAttribute('data-id');
        const value = field.value.trim();
        
        if (value) {
            if (/^\d{1,2}\.\d$/.test(value)) {
                const parts = value.split('.');
                const integerPart = parts[0].padStart(2, '0');
                const decimalPart = parts[1];
                const formattedValue = `${integerPart}.${decimalPart}`;
                
                journalData[currentLine][dateStr][fieldId] = formattedValue;
                field.value = formattedValue;
                hasData = true;
                
                const numValue = parseFloat(formattedValue);
                if (numValue > 0) hasNonZeroValue = true;
            } else {
                showStatus(`❌ Ошибка в поле ${fieldId}: используйте формат 00.0`, 'error');
                field.style.borderColor = 'orange';
                hasError = true;
                return;
            }
        } else {
            delete journalData[currentLine][dateStr][fieldId];
        }
        field.style.borderColor = '#dc3545';
    });
    
    if (hasError) return;
    
    if (!hasData || Object.keys(journalData[currentLine][dateStr]).length === 0 || !hasNonZeroValue) {
        delete journalData[currentLine][dateStr];
        showStatus(`🗑️ Данные удалены за ${dateStr} для ${getCurrentLineName()}`, 'info');
    } else {
        showStatus(`💾 Данные сохранены за ${dateStr} для ${getCurrentLineName()}`, 'success');
    }
    
    try {
        await gitHubDB.saveData(journalData);
        highlightDates();
        showStatus('✅ Данные успешно сохранены в облако', 'success');
    } catch (e) {
        if (e.message.includes('409')) {
            showStatus('⚠️ Конфликт версий. Пытаемся решить...', 'warning');
            
            try {
                await resolveDataConflict();
            } catch (resolveError) {
                showStatus('❌ Не удалось решить конфликт: ' + resolveError.message, 'error');
            }
        } else {
            showStatus('❌ Ошибка сохранения в облако: ' + e.message, 'error');
        }
        console.error('Ошибка сохранения:', e);
    }
}

// Разрешение конфликта данных при одновременном редактировании
async function resolveDataConflict() {
    showStatus('🔄 Пытаемся решить конфликт данных...', 'info');
    
    try {
        const cloudData = await gitHubDB.loadData();
        const mergedData = mergeData(journalData, cloudData);
        journalData = mergedData;
        await gitHubDB.saveData(journalData);
        loadDataForCurrentDate();
        showStatus('✅ Конфликт данных успешно разрешен!', 'success');
    } catch (error) {
        throw new Error('Не удалось разрешить конфликт: ' + error.message);
    }
}

// Алгоритм объединения данных при конфликте
function mergeData(localData, cloudData) {
    const merged = { line1: {}, line2: {}, line3: {} };
    
    ['line1', 'line2', 'line3'].forEach(line => {
        merged[line] = { ...cloudData[line] };
        
        if (localData[line]) {
            Object.keys(localData[line]).forEach(date => {
                if (merged[line][date]) {
                    const localHasData = Object.values(localData[line][date]).some(v => parseFloat(v) > 0);
                    const cloudHasData = Object.values(merged[line][date]).some(v => parseFloat(v) > 0);
                    
                    if (localHasData && !cloudHasData) {
                        merged[line][date] = localData[line][date];
                    }
                } else {
                    merged[line][date] = localData[line][date];
                }
            });
        }
    });
    
    return merged;
}

// ===== ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ =====

// Подсветка дат с данными в календаре
function highlightDates() {
    setTimeout(() => {
        const days = document.querySelectorAll('.flatpickr-day');
        days.forEach(day => {
            day.classList.remove('has-data');
            try {
                if (day.dateObj) {
                    const date = new Date(day.dateObj);
                    if (hasDataForDate(date)) day.classList.add('has-data');
                }
            } catch (e) {
                console.log('Ошибка при выделении даты:', e);
            }
        });
        hideSixthWeek();
    }, 100);
}

// Форматирование даты в строку YYYY-MM-DD
function formatDate(date) {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// Настройка валидации и обработки ввода в полях
function setupInputValidation() {
    document.querySelectorAll('.input-field').forEach(field => {
        field.addEventListener('input', function(e) {
            if (currentUser.role === 'guest') {
                e.preventDefault();
                return;
            }
            
            let value = e.target.value;
            value = value.replace(/[^\d.]/g, '');
            
            const dotCount = (value.match(/\./g) || []).length;
            if (dotCount > 1) {
                const parts = value.split('.');
                value = parts[0] + '.' + parts.slice(1).join('');
            }
            
            const parts = value.split('.');
            if (parts[0] && parts[0].length > 2) parts[0] = parts[0].substring(0, 2);
            if (parts[1] && parts[1].length > 1) parts[1] = parts[1].substring(0, 1);
            
            value = parts[0] + (parts[1] !== undefined ? '.' + parts[1] : '');
            e.target.value = value;
            
            if (value && !/^\d{1,2}\.\d$/.test(value)) {
                e.target.style.borderColor = 'orange';
            } else {
                e.target.style.borderColor = '#dc3545';
            }
        });
        
        field.addEventListener('blur', function() {
            if (currentUser.role === 'admin' && this.value && /^\d{1,2}\.\d$/.test(this.value)) {
                saveDataToCloud();
            }
        });
    });
}

// Обработка ошибки загрузки фонового изображения
function handleImageError() {
    console.log('Фоновое изображение не найдено');
    showStatus('⚠️ Фоновое изображение не загружено', 'warning');
}

// Синхронизация данных из облака
async function syncFromCloud() {
    try {
        await loadDataFromCloud();
        loadDataForCurrentDate();
        highlightDates();
        showStatus('✅ Данные синхронизированы из облака', 'success');
    } catch (error) {
        showStatus('❌ Ошибка синхронизации: ' + error.message, 'error');
    }
}

// ===== УПРАВЛЕНИЕ СИСТЕМНЫМИ СООБЩЕНИЯМИ =====

// Функция отображения системных сообщений
function showStatus(message, type = 'info') {
    const statusElement = document.getElementById('status');
    statusElement.textContent = message;
    
    switch (type) {
        case 'success':
            statusElement.style.background = '#d4edda';
            statusElement.style.color = '#155724';
            statusElement.style.border = '2px solid #c3e6cb';
            break;
        case 'error':
            statusElement.style.background = '#f8d7da';
            statusElement.style.color = '#721c24';
            statusElement.style.border = '2px solid #f5c6cb';
            break;
        case 'warning':
            statusElement.style.background = '#fff3cd';
            statusElement.style.color = '#856404';
            statusElement.style.border = '2px solid #ffeaa7';
            break;
        default:
            statusElement.style.background = '#d1ecf1';
            statusElement.style.color = '#0c5460';
            statusElement.style.border = '2px solid #b8daff';
    }
}

// ===== УПРАВЛЕНИЕ СЕССИЕЙ ПОЛЬЗОВАТЕЛЯ =====

// Выход из системы
function logout() {
    currentUser = null;
    document.querySelector('.container').style.display = 'none';
    document.getElementById('auth-overlay').style.display = 'flex';
    document.getElementById('login').value = '';
    document.getElementById('password').value = '';
    document.getElementById('auth-error').style.display = 'none';
    
    if (calendar) {
        calendar.destroy();
        calendar = null;
    }
    
    showStatus('⏳ Ожидание авторизации...', 'info');
}

// ===== ИНИЦИАЛИЗАЦИЯ ПРИ ЗАГРУЗКЕ СТРАНИЦЫ =====

// Установка обработчиков событий при загрузке DOM
document.addEventListener('DOMContentLoaded', function() {
    document.getElementById('login-btn').addEventListener('click', checkAuth);
    document.getElementById('save-btn').addEventListener('click', saveDataToCloud);
    document.getElementById('sync-btn').addEventListener('click', syncFromCloud);
    document.getElementById('logout-btn').addEventListener('click', logout);
    document.getElementById('background-img').addEventListener('error', handleImageError);
    
    document.getElementById('password').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') checkAuth();
    });
    
    document.getElementById('login').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') checkAuth();
    });
    
    showStatus('⏳ Ожидание авторизации...', 'info');
});
