// script.js
// Константы для авторизации
const CORRECT_LOGIN = 'compound_VL';
const CORRECT_PASSWORD = 'compound_VL';

// Глобальные переменные
let journalData = {};
let currentDate = new Date();
let calendar;
let currentLine = 'line1';
let useLocalStorage = true;

// Функция проверки авторизации
function checkAuth() {
    const login = document.getElementById('login').value;
    const password = document.getElementById('password').value;
    const errorElement = document.getElementById('auth-error');
    
    if (login === CORRECT_LOGIN && password === CORRECT_PASSWORD) {
        document.getElementById('auth-overlay').style.display = 'none';
        document.querySelector('.container').style.display = 'block';
        initApp();
    } else {
        errorElement.style.display = 'block';
        document.getElementById('password').value = '';
    }
}

// Инициализация приложения
async function initApp() {
    await loadStorageData();
    setupInputValidation();
    initCalendar();
    updateDateDisplay();
    setupLineButtons();
    updateStorageStatus();
    
    setTimeout(() => {
        loadData(currentDate);
        showStatus('Журнал загружен. Введите данные и нажмите "Сохранить данные".', 'success');
    }, 200);
}

// Настройка кнопок линий
function setupLineButtons() {
    const lineButtons = document.querySelectorAll('.line-btn');
    lineButtons.forEach(btn => {
        btn.addEventListener('click', function() {
            saveData();
            lineButtons.forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            currentLine = this.getAttribute('data-line');
            loadData(currentDate);
            showStatus(`Загружена ${this.textContent}`, 'info');
        });
    });
}

// Инициализация календаря
function initCalendar() {
    calendar = flatpickr("#calendar", {
        locale: "ru",
        inline: true,
        showFooter: false,
        appendTo: document.getElementById('calendar-display'),
        defaultDate: currentDate,
        onChange: function(selectedDates) {
            if (selectedDates[0]) {
                currentDate = selectedDates[0];
                updateDateDisplay();
                loadData(currentDate);
                showStatus(`Загружены данные за ${formatDate(currentDate)} для ${getCurrentLineName()}`, 'info');
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

// Получение имени текущей линии
function getCurrentLineName() {
    const activeBtn = document.querySelector('.line-btn.active');
    return activeBtn ? activeBtn.textContent : 'Линия 1';
}

// Проверка наличия данных для даты
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

// Обновление отображения даты
function updateDateDisplay() {
    const options = { day: 'numeric', month: 'long', year: 'numeric' };
    document.getElementById('current-date-display').textContent = 
        currentDate.toLocaleDateString('ru-RU', options);
}

// Загрузка данных из хранилища
async function loadStorageData() {
    try {
        if (useLocalStorage) {
            const saved = localStorage.getItem('journalShnekaData');
            if (saved) {
                journalData = JSON.parse(saved);
                if (!journalData.line1) journalData.line1 = {};
                if (!journalData.line2) journalData.line2 = {};
                if (!journalData.line3) journalData.line3 = {};
            } else {
                journalData = { line1: {}, line2: {}, line3: {} };
            }
            console.log('Данные загружены из localStorage');
        } else {
            if (!gitHubDB.hasToken()) {
                const tokenSet = await gitHubDB.requestToken();
                if (!tokenSet) {
                    throw new Error('GitHub token не предоставлен');
                }
            }
            
            await gitHubDB.testConnection();
            journalData = await gitHubDB.loadData();
            
            if (!journalData.line1) journalData.line1 = {};
            if (!journalData.line2) journalData.line2 = {};
            if (!journalData.line3) journalData.line3 = {};
        }
    } catch (error) {
        console.error('Ошибка загрузки данных:', error);
        
        if (!useLocalStorage) {
            useLocalStorage = true;
            updateStorageStatus();
            showStatus('Ошибка облачного хранилища. Переключено на локальный режим.', 'error');
            
            const saved = localStorage.getItem('journalShnekaData');
            journalData = saved ? JSON.parse(saved) : { line1: {}, line2: {}, line3: {} };
        } else {
            journalData = { line1: {}, line2: {}, line3: {} };
        }
        
        if (!journalData.line1) journalData.line1 = {};
        if (!journalData.line2) journalData.line2 = {};
        if (!journalData.line3) journalData.line3 = {};
    }
}

// Загрузка данных для даты
function loadData(date) {
    const dateStr = formatDate(date);
    
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

// Сохранение данных
async function saveData() {
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
                showStatus(`Ошибка в поле ${fieldId}: используйте формат 00.0`, 'error');
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
        showStatus(`Данные удалены за ${dateStr} для ${getCurrentLineName()}`, 'info');
    } else {
        showStatus(`Данные сохранены за ${dateStr} для ${getCurrentLineName()}`, 'success');
    }
    
    try {
        if (useLocalStorage) {
            localStorage.setItem('journalShnekaData', JSON.stringify(journalData));
        } else {
            await gitHubDB.saveData(journalData);
        }
        highlightDates();
    } catch (e) {
        showStatus('Ошибка сохранения данных: ' + e.message, 'error');
        console.error('Ошибка сохранения:', e);
    }
}

// Подсветка дат с данными
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

// Форматирование даты
function formatDate(date) {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// Настройка валидации ввода
function setupInputValidation() {
    document.querySelectorAll('.input-field').forEach(field => {
        field.addEventListener('input', function(e) {
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
            if (this.value && /^\d{1,2}\.\d$/.test(this.value)) {
                saveData();
            }
        });
    });
}

// Обработка ошибки изображения
function handleImageError() {
    console.log('Фоновое изображение не найдено');
    showStatus('Фоновое изображение не загружено', 'warning');
}

// Экспорт данных
function exportData() {
    const dataStr = JSON.stringify(journalData, null, 2);
    const dataBlob = new Blob([dataStr], {type: 'application/json'});
    
    const link = document.createElement('a');
    link.href = URL.createObjectURL(dataBlob);
    link.download = `journal_shneka_${formatDate(new Date())}.json`;
    link.click();
    
    showStatus('Данные экспортированы в JSON', 'success');
}

// Переключение режима хранения
async function toggleStorageMode() {
    if (useLocalStorage) {
        try {
            if (!gitHubDB.hasToken()) {
                const tokenSet = await gitHubDB.requestToken();
                if (!tokenSet) {
                    showStatus('GitHub token не предоставлен. Остаемся в локальном режиме.', 'error');
                    return;
                }
            }
            
            await gitHubDB.testConnection();
            useLocalStorage = false;
            showStatus('Переключено на облачный режим. Загружаем данные...', 'info');
            
            await loadStorageData();
            loadData(currentDate);
            
        } catch (error) {
            showStatus('Ошибка переключения на облачный режим: ' + error.message, 'error');
            console.error('Ошибка переключения:', error);
            return;
        }
    } else {
        useLocalStorage = true;
        showStatus('Переключено на локальный режим', 'info');
        await loadStorageData();
        loadData(currentDate);
    }
    
    updateStorageStatus();
}

// Обновление статуса хранилища
function updateStorageStatus() {
    const statusElement = document.getElementById('storage-status');
    const buttonElement = document.getElementById('storage-btn');
    
    if (useLocalStorage) {
        statusElement.textContent = '📱 Локальный режим';
        statusElement.style.background = '#e3f2fd';
        statusElement.style.color = '#1976d2';
        buttonElement.textContent = '🌐 Облачный режим';
        buttonElement.style.background = '#fd7e14';
    } else {
        statusElement.textContent = '☁️ Облачный режим';
        statusElement.style.background = '#e8f5e8';
        statusElement.style.color = '#2e7d32';
        buttonElement.textContent = '📱 Локальный режим';
        buttonElement.style.background = '#6c757d';
    }
}

// Синхронизация из облака
async function syncFromCloud() {
    if (useLocalStorage) {
        showStatus('Сначала переключитесь в облачный режим', 'warning');
        return;
    }
    
    try {
        const cloudData = await gitHubDB.loadData();
        journalData = cloudData;
        localStorage.setItem('journalShnekaData', JSON.stringify(journalData));
        loadData(currentDate);
        showStatus('Данные синхронизированы из облака', 'success');
    } catch (error) {
        showStatus('Ошибка синхронизации: ' + error.message, 'error');
    }
}

// Показать статус
function showStatus(message, type = 'info') {
    const statusElement = document.getElementById('status');
    statusElement.textContent = message;
    
    switch (type) {
        case 'success':
            statusElement.style.background = '#d4edda';
            statusElement.style.color = '#155724';
            break;
        case 'error':
            statusElement.style.background = '#f8d7da';
            statusElement.style.color = '#721c24';
            break;
        case 'warning':
            statusElement.style.background = '#fff3cd';
            statusElement.style.color = '#856404';
            break;
        default:
            statusElement.style.background = '#d1ecf1';
            statusElement.style.color = '#0c5460';
    }
}

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', function() {
    document.getElementById('login-btn').addEventListener('click', checkAuth);
    document.getElementById('save-btn').addEventListener('click', saveData);
    document.getElementById('export-btn').addEventListener('click', exportData);
    document.getElementById('sync-btn').addEventListener('click', syncFromCloud);
    document.getElementById('storage-btn').addEventListener('click', toggleStorageMode);
    document.getElementById('background-img').addEventListener('error', handleImageError);
    
    document.getElementById('password').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') checkAuth();
    });
    
    document.getElementById('login').addEventListener('keypress', function(e) {
        if (e.key === 'Enter') checkAuth();
    });
    
    showStatus('Загружаем приложение...', 'info');
});