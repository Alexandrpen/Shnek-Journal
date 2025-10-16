// script.js
// Основной модуль приложения - управление интерфейсом и бизнес-логикой

// ===== КОНСТАНТЫ И ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ =====

// Объект с учетными данными пользователей
const USERS = {
    admin: {
        login: 'compound_VL',
        password: 'compound_VL',
        role: 'admin',
        name: 'Администратор'
    },
    guest: {
        login: 'guest',
        password: 'guest',
        role: 'guest',
        name: 'Гость'
    }
};

// Глобальные переменные состояния приложения
let journalData = {}; // Хранилище всех данных журнала
let currentDate = new Date(); // Текущая выбранная дата
let calendar; // Объект календаря Flatpickr
let currentLine = 'line1'; // Текущая выбранная производственная линия
let currentUser = null; // Текущий авторизованный пользователь

// ===== ФУНКЦИИ АВТОРИЗАЦИИ И УПРАВЛЕНИЯ ПОЛЬЗОВАТЕЛЯМИ =====

// Функция проверки авторизации пользователя
function checkAuth() {
    // Получение значений из полей ввода
    const login = document.getElementById('login').value.trim();
    const password = document.getElementById('password').value;
    const errorElement = document.getElementById('auth-error');
    
    // Поиск пользователя в базе учетных записей
    let user = null;
    for (const key in USERS) {
        if (USERS[key].login === login && USERS[key].password === password) {
            user = USERS[key]; // Найден подходящий пользователь
            break;
        }
    }
    
    // Обработка результата авторизации
    if (user) {
        currentUser = user;
        
        // Сохраняем данные пользователя в localStorage
        saveUserSession(user);
        
        document.getElementById('auth-overlay').style.display = 'none'; // Скрытие формы авторизации
        document.querySelector('.container').style.display = 'block'; // Показ основного интерфейса
        updateUIForUserRole(); // Обновление интерфейса согласно роли
        initApp(); // Инициализация приложения
        errorElement.style.display = 'none'; // Скрытие сообщения об ошибке
        
        showStatus(`✅ Авторизация успешна. Добро пожаловать, ${user.name}!`, 'success');
    } else {
        errorElement.style.display = 'block'; // Показ сообщения об ошибке
        document.getElementById('password').value = ''; // Очистка поля пароля
        showStatus('❌ Ошибка авторизации', 'error');
    }
}

// Функция сохранения сессии пользователя
function saveUserSession(user) {
    const sessionData = {
        user: user,
        timestamp: new Date().getTime(),
        expiresIn: 24 * 60 * 60 * 1000 // 24 часа
    };
    localStorage.setItem('shnekJournalSession', JSON.stringify(sessionData));
    console.log('Сессия пользователя сохранена');
}

// Функция проверки и восстановления сессии
function checkAndRestoreSession() {
    try {
        const sessionData = localStorage.getItem('shnekJournalSession');
        
        if (!sessionData) {
            return false;
        }
        
        const session = JSON.parse(sessionData);
        const now = new Date().getTime();
        
        // Проверяем не истекла ли сессия
        if (now - session.timestamp > session.expiresIn) {
            localStorage.removeItem('shnekJournalSession');
            console.log('Сессия истекла');
            return false;
        }
        
        // Восстанавливаем пользователя
        currentUser = session.user;
        
        // Скрываем форму авторизации и показываем основной интерфейс
        document.getElementById('auth-overlay').style.display = 'none';
        document.querySelector('.container').style.display = 'block';
        updateUIForUserRole();
        initApp();
        
        showStatus(`🔓 Сессия восстановлена. Добро пожаловать, ${session.user.name}!`, 'success');
        return true;
        
    } catch (error) {
        console.error('Ошибка восстановления сессии:', error);
        localStorage.removeItem('shnekJournalSession');
        return false;
    }
}

// Обновление интерфейса в зависимости от роли пользователя
function updateUIForUserRole() {
    const userRoleElement = document.getElementById('user-role');
    const saveBtn = document.getElementById('save-btn');
    
    // Обновление отображения роли пользователя
    if (userRoleElement) {
        userRoleElement.textContent = `${currentUser.name} (${currentUser.role === 'admin' ? 'Администратор' : 'Только просмотр'})`;
    }
    
    // Настройка интерфейса для гостя (только просмотр)
    if (currentUser.role === 'guest') {
        saveBtn.disabled = true;
        saveBtn.style.opacity = '0.6';
        saveBtn.style.cursor = 'not-allowed';
        
        // Блокировка полей ввода для гостя
        document.querySelectorAll('.input-field').forEach(field => {
            field.readOnly = true;
            field.style.background = '#ecf0f1';
            field.style.cursor = 'not-allowed';
        });
        
        showStatus('🔒 Режим просмотра. Редактирование недоступно.', 'info');
    } else {
        // Настройка интерфейса для администратора (полный доступ)
        saveBtn.disabled = false;
        saveBtn.style.opacity = '1';
        saveBtn.style.cursor = 'pointer';
        
        // Разблокировка полей ввода для администратора
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
        cleanupPreviousState(); // Очистка предыдущего состояния
        
        // Настройка адаптивного масштабирования
        setupResponsiveScaling();
        
        // Запрос токена GitHub для администратора (если не установлен)
        if (currentUser.role === 'admin' && !gitHubDB.hasToken()) {
            const tokenSet = await gitHubDB.requestToken();
            if (!tokenSet) {
                showStatus('❌ Для работы приложения требуется GitHub токен', 'error');
                return;
            }
        }
        
        // Последовательная инициализация компонентов приложения
        await loadDataFromCloud(); // Загрузка данных из облака
        setupInputValidation(); // Настройка валидации полей ввода
        initCalendar(); // Инициализация календаря
        updateDateDisplay(); // Обновление отображения даты
        setupLineButtons(); // Настройка кнопок выбора линии
        
        showStatus('✅ Журнал успешно загружен', 'success');
    } catch (error) {
        console.error('Ошибка инициализации:', error);
        showStatus('❌ Ошибка инициализации: ' + error.message, 'error');
    }
}

// Функция для динамического масштабирования
function setupResponsiveScaling() {
    function updateScale() {
        const container = document.querySelector('.image-container');
        const inputs = document.querySelectorAll('.input-field');
        const containerWidth = container.offsetWidth;
        
        // Базовые размеры для reference (для экрана 1920px)
        const baseWidth = 1920;
        const scaleFactor = containerWidth / baseWidth;
        
        // Применяем масштабирование только если контейнер меньше базового размера
        if (scaleFactor < 1) {
            inputs.forEach(input => {
                const currentTransform = input.style.transform || 'scale(1)';
                // Учитываем увеличенные размеры полей
                input.style.transform = `scale(${scaleFactor})`;
            });
        } else {
            inputs.forEach(input => {
                input.style.transform = 'scale(1)';
            });
        }
    }
    
    // Вызываем при загрузке и при изменении размера окна
    updateScale();
    window.addEventListener('resize', updateScale);
}
    
  
// Очистка предыдущего состояния приложения
function cleanupPreviousState() {
    // Сброс полей ввода
    document.querySelectorAll('.input-field').forEach(field => {
        field.value = '';
        field.style.borderColor = '#dc3545';
        field.readOnly = false;
    });
    
    // Сброс выбранной линии к первой
    const activeLineBtn = document.querySelector('.line-btn.active');
    if (activeLineBtn) {
        activeLineBtn.classList.remove('active');
    }
    document.querySelector('.line-btn[data-line="line1"]').classList.add('active');
    currentLine = 'line1';
    
    // Сброс даты к текущей
    currentDate = new Date();
    
    // Уничтожение и сброс календаря
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
            // Снятие активности со всех кнопок
            lineButtons.forEach(b => b.classList.remove('active'));
            // Установка активности на текущую кнопку
            this.classList.add('active');
            currentLine = this.getAttribute('data-line'); // Обновление текущей линии
            
            // Автоматическая синхронизация при переключении линии
            await autoSyncOnLineChange();
            
            showStatus(`🔄 Переключено на ${this.textContent}`, 'info');
        });
    });
}

// Функция автоматической синхронизации при смене линии
async function autoSyncOnLineChange() {
    try {
        showStatus('🔄 Автоматическая синхронизация...', 'info');
        
        // Загружаем свежие данные из облака
        await loadDataFromCloud();
        
        // Обновляем данные для текущей даты
        loadDataForCurrentDate();
        
        // Обновляем подсветку календаря
        highlightDates();
        
        showStatus(`✅ Данные для ${getCurrentLineName()} синхронизированы`, 'success');
    } catch (error) {
        console.error('Ошибка автоматической синхронизации:', error);
        showStatus('⚠️ Автосинхронизация не удалась, используем локальные данные', 'warning');
        
        // Все равно загружаем локальные данные
        loadDataForCurrentDate();
    }
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
    
    // Уничтожение предыдущего экземпляра календаря
    if (calendar) {
        calendar.destroy();
    }
    
    // Создание нового экземпляра календаря
    calendar = flatpickr(calendarElement, {
        locale: "ru", // Русская локализация
        inline: true, // Встроенный режим (без поля ввода)
        showFooter: false, // Скрытие футера
        appendTo: calendarDisplay, // Контейнер для отображения
        defaultDate: currentDate, // Установка текущей даты по умолчанию
        
        // Обработчик изменения даты
        onChange: function(selectedDates) {
            if (selectedDates[0]) {
                currentDate = selectedDates[0];
                updateDateDisplay(); // Обновление отображения даты
                loadDataForCurrentDate(); // Загрузка данных для выбранной даты
                showStatus(`📅 Загружены данные за ${formatDate(currentDate)} для ${getCurrentLineName()}`, 'info');
            }
        },
        
        // Обработчики для обновления подсветки при смене месяца/года
        onMonthChange: function() {
            setTimeout(highlightDates, 100);
        },
        onYearChange: function() {
            setTimeout(highlightDates, 100);
        },
        
        // Инициализация после загрузки календаря
        onReady: function() {
            setTimeout(highlightDates, 300);
            hideSixthWeek(); // Скрытие 6-й недели
        },
        
        // Обработчик создания дня в календаре
        onDayCreate: function(dObj, dStr, fp, dayElem) {
            setTimeout(() => {
                const date = new Date(dayElem.dateObj);
                if (hasDataForDate(date)) {
                    dayElem.classList.add('has-data'); // Подсветка дней с данными
                }
            }, 10);
        }
    });
}

// Проверка наличия данных для указанной даты
function hasDataForDate(date) {
    const dateStr = formatDate(date);
    
    // Проверка существования данных для даты и линии
    if (!journalData[currentLine] || !journalData[currentLine][dateStr] || 
        Object.keys(journalData[currentLine][dateStr]).length === 0) {
        return false;
    }
    
    // Проверка что есть хотя бы одно ненулевое значение
    const values = Object.values(journalData[currentLine][dateStr]);
    return values.some(value => {
        const numValue = parseFloat(value);
        return numValue > 0;
    });
}

// Скрытие 6-й недели в календаре (для единообразия отображения)
function hideSixthWeek() {
    setTimeout(() => {
        const dayContainers = document.querySelectorAll('.dayContainer');
        dayContainers.forEach((container, index) => {
            if (index >= 5) container.style.display = 'none'; // Скрытие контейнеров с индексом >= 5
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
        // Проверка токена для администратора
        if (currentUser.role === 'admin' && !gitHubDB.hasToken()) {
            throw new Error('GitHub token не установлен');
        }
        
        // Тестирование подключения для администратора
        if (currentUser.role === 'admin') {
            await gitHubDB.testConnection();
        }
        
        // Загрузка данных из GitHub
        journalData = await gitHubDB.loadData();
        
        // Инициализация структуры данных если нужно
        if (!journalData.line1) journalData.line1 = {};
        if (!journalData.line2) journalData.line2 = {};
        if (!journalData.line3) journalData.line3 = {};
        
        console.log('Данные загружены из облака');
        return true;
    } catch (error) {
        console.error('Ошибка загрузки данных из облака:', error);
        
        // Обработка различных типов ошибок
        if (error.message.includes('401') || error.message.includes('403')) {
            gitHubDB.clearToken(); // Очистка невалидного токена
            showStatus('❌ Неверный токен. Токен очищен. Перезагрузите страницу.', 'error');
        } else if (error.message.includes('GitHub token не установлен')) {
            // Для гостя отсутствие токена - не ошибка
            console.log('Гость использует локальные данные');
        } else {
            showStatus('❌ Ошибка загрузки из облака: ' + error.message, 'error');
        }
        
        // Создание пустой структуры данных при ошибке
        journalData = { line1: {}, line2: {}, line3: {} };
        return false;
    }
}

// Загрузка данных для текущей выбранной даты в поля ввода
function loadDataForCurrentDate() {
    const dateStr = formatDate(currentDate);
    
    // Заполнение полей ввода значениями из загруженных данных
    document.querySelectorAll('.input-field').forEach(field => {
        const fieldId = field.getAttribute('data-id');
        // Проверка существования данных для поля
        if (journalData[currentLine] && 
            journalData[currentLine][dateStr] && 
            journalData[currentLine][dateStr][fieldId]) {
            field.value = journalData[currentLine][dateStr][fieldId]; // Установка значения
        } else {
            field.value = ''; // Очистка поля если данных нет
        }
    });
}

// Сохранение данных в облачное хранилище
async function saveDataToCloud() {
    // Проверка прав доступа для гостя
    if (currentUser.role === 'guest') {
        showStatus('❌ Редактирование запрещено в режиме гостя', 'error');
        return;
    }
    
    const dateStr = formatDate(currentDate);
    
    // Инициализация структур данных если необходимо
    if (!journalData[currentLine]) journalData[currentLine] = {};
    if (!journalData[currentLine][dateStr]) journalData[currentLine][dateStr] = {};
    
    let hasData = false; // Флаг наличия данных
    let hasError = false; // Флаг ошибок валидации
    let hasNonZeroValue = false; // Флаг ненулевых значений
    
    // Сбор данных из полей ввода
    document.querySelectorAll('.input-field').forEach(field => {
        const fieldId = field.getAttribute('data-id');
        const value = field.value.trim();
        
        if (value) {
            // Валидация формата ввода (00.0)
            if (/^\d{1,2}\.\d$/.test(value)) {
                const parts = value.split('.');
                const integerPart = parts[0].padStart(2, '0'); // Дополнение нулями
                const decimalPart = parts[1];
                const formattedValue = `${integerPart}.${decimalPart}`; // Форматированное значение
                
                // Сохранение в структуре данных
                journalData[currentLine][dateStr][fieldId] = formattedValue;
                field.value = formattedValue; // Обновление поля
                hasData = true;
                
                const numValue = parseFloat(formattedValue);
                if (numValue > 0) hasNonZeroValue = true; // Проверка на ненулевое значение
            } else {
                // Ошибка валидации - неправильный формат
                showStatus(`❌ Ошибка в поле ${fieldId}: используйте формат 00.0`, 'error');
                field.style.borderColor = 'orange'; // Подсветка ошибки
                hasError = true;
                return;
            }
        } else {
            // Удаление поля если значение пустое
            delete journalData[currentLine][dateStr][fieldId];
        }
        field.style.borderColor = '#dc3545'; // Возврат стандартного цвета
    });
    
    if (hasError) return; // Прерывание если есть ошибки
    
    // Удаление пустых записей (дата без данных)
    if (!hasData || Object.keys(journalData[currentLine][dateStr]).length === 0 || !hasNonZeroValue) {
        delete journalData[currentLine][dateStr];
        showStatus(`🗑️ Данные удалены за ${dateStr} для ${getCurrentLineName()}`, 'info');
    } else {
        showStatus(`💾 Данные сохранены за ${dateStr} для ${getCurrentLineName()}`, 'success');
    }
    
    // Сохранение в облако
    try {
        await gitHubDB.saveData(journalData);
        highlightDates(); // Обновление подсветки календаря
        showStatus('✅ Данные успешно сохранены в облако', 'success');
    } catch (e) {
        // Обработка конфликта версий
        if (e.message.includes('409')) {
            showStatus('⚠️ Конфликт версий. Пытаемся решить...', 'warning');
            
            try {
                await resolveDataConflict(); // Попытка разрешить конфликт
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
        // Загрузка свежих данных из облака
        const cloudData = await gitHubDB.loadData();
        
        // Объединение локальных и облачных данных
        const mergedData = mergeData(journalData, cloudData);
        
        // Сохранение объединенных данных
        journalData = mergedData;
        await gitHubDB.saveData(journalData);
        
        // Перезагрузка данных для текущей даты
        loadDataForCurrentDate();
        showStatus('✅ Конфликт данных успешно разрешен!', 'success');
    } catch (error) {
        throw new Error('Не удалось разрешить конфликт: ' + error.message);
    }
}

// Алгоритм объединения данных при конфликте
function mergeData(localData, cloudData) {
    const merged = { line1: {}, line2: {}, line3: {} };
    
    // Объединение данных для каждой линии
    ['line1', 'line2', 'line3'].forEach(line => {
        merged[line] = { ...cloudData[line] }; // Начинаем с облачных данных
        
        if (localData[line]) {
            Object.keys(localData[line]).forEach(date => {
                // Если дата есть в обоих наборах, выбираем более актуальную версию
                if (merged[line][date]) {
                    // Эвристика: считаем что локальные данные актуальнее если они не пустые
                    const localHasData = Object.values(localData[line][date]).some(v => parseFloat(v) > 0);
                    const cloudHasData = Object.values(merged[line][date]).some(v => parseFloat(v) > 0);
                    
                    if (localHasData && !cloudHasData) {
                        merged[line][date] = localData[line][date]; // Используем локальные данные
                    }
                    // Иначе оставляем облачную версию
                } else {
                    merged[line][date] = localData[line][date]; // Добавляем отсутствующие локальные данные
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
            day.classList.remove('has-data'); // Сброс предыдущей подсветки
            try {
                if (day.dateObj) {
                    const date = new Date(day.dateObj);
                    if (hasDataForDate(date)) day.classList.add('has-data'); // Подсветка если есть данные
                }
            } catch (e) {
                console.log('Ошибка при выделении даты:', e);
            }
        });
        hideSixthWeek(); // Повторное скрытие 6-й недели
    }, 100);
}

// Форматирование даты в строку YYYY-MM-DD
function formatDate(date) {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0'); // Месяц с ведущим нулем
    const day = date.getDate().toString().padStart(2, '0'); // День с ведущим нулем
    return `${year}-${month}-${day}`;
}

// Настройка валидации и обработки ввода в полях
function setupInputValidation() {
    document.querySelectorAll('.input-field').forEach(field => {
        // Обработчик ввода (реaltime валидация)
        field.addEventListener('input', function(e) {
            // Блокировка ввода для гостя
            if (currentUser.role === 'guest') {
                e.preventDefault();
                return;
            }
            
            let value = e.target.value;
            value = value.replace(/[^\d.]/g, ''); // Удаление всех символов кроме цифр и точки
            
            // Ограничение количества точек (максимум одна)
            const dotCount = (value.match(/\./g) || []).length;
            if (dotCount > 1) {
                const parts = value.split('.');
                value = parts[0] + '.' + parts.slice(1).join(''); // Объединение лишних частей
            }
            
            // Разделение на целую и дробную части
            const parts = value.split('.');
            if (parts[0] && parts[0].length > 2) parts[0] = parts[0].substring(0, 2); // Ограничение целой части
            if (parts[1] && parts[1].length > 1) parts[1] = parts[1].substring(0, 1); // Ограничение дробной части
            
            // Сборка обратно в строку
            value = parts[0] + (parts[1] !== undefined ? '.' + parts[1] : '');
            e.target.value = value;
            
            // Визуальная индикация валидности
            if (value && !/^\d{1,2}\.\d$/.test(value)) {
                e.target.style.borderColor = 'orange'; // Оранжевый для невалидного значения
            } else {
                e.target.style.borderColor = '#dc3545'; // Красный для валидного/пустого
            }
        });
        
        // Автосохранение при потере фокуса (для администратора)
        field.addEventListener('blur', function() {
            if (currentUser.role === 'admin' && this.value && /^\d{1,2}\.\d$/.test(this.value)) {
                saveDataToCloud(); // Автоматическое сохранение
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
        await loadDataFromCloud(); // Загрузка данных
        loadDataForCurrentDate(); // Обновление полей ввода
        highlightDates(); // Обновление подсветки календаря
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
    
    // Установка стилей в зависимости от типа сообщения
    switch (type) {
        case 'success': // Успешные операции
            statusElement.style.background = '#d4edda';
            statusElement.style.color = '#155724';
            statusElement.style.border = '2px solid #c3e6cb';
            break;
        case 'error': // Ошибки
            statusElement.style.background = '#f8d7da';
            statusElement.style.color = '#721c24';
            statusElement.style.border = '2px solid #f5c6cb';
            break;
        case 'warning': // Предупреждения
            statusElement.style.background = '#fff3cd';
            statusElement.style.color = '#856404';
            statusElement.style.border = '2px solid #ffeaa7';
            break;
        default: // Информационные сообщения
            statusElement.style.background = '#d1ecf1';
            statusElement.style.color = '#0c5460';
            statusElement.style.border = '2px solid #b8daff';
    }
}

// ===== УПРАВЛЕНИЕ СЕССИЕЙ ПОЛЬЗОВАТЕЛЯ =====

// Выход из системы
function logout() {
    currentUser = null; // Сброс текущего пользователя
    
    // Очищаем сессию
    localStorage.removeItem('shnekJournalSession');
    
    document.querySelector('.container').style.display = 'none'; // Скрытие основного интерфейса
    document.getElementById('auth-overlay').style.display = 'flex'; // Показ формы авторизации
    document.getElementById('login').value = ''; // Очистка поля логина
    document.getElementById('password').value = ''; // Очистка поля пароля
    document.getElementById('auth-error').style.display = 'none'; // Скрытие сообщения об ошибке
    
    // Очистка календаря
    if (calendar) {
        calendar.destroy();
        calendar = null;
    }
    
    showStatus('⏳ Ожидание авторизации...', 'info');
}

// ===== ИНИЦИАЛИЗАЦИЯ ПРИ ЗАГРУЗКЕ СТРАНИЦЫ =====

// Установка обработчиков событий при загрузке DOM
document.addEventListener('DOMContentLoaded', function() {
    // Сначала пытаемся восстановить сессию
    const sessionRestored = checkAndRestoreSession();
    
    if (!sessionRestored) {
        // Если сессия не восстановлена, показываем форму авторизации
        document.getElementById('login-btn').addEventListener('click', checkAuth);
        document.getElementById('password').addEventListener('keypress', function(e) {
            if (e.key === 'Enter') checkAuth();
        });
        document.getElementById('login').addEventListener('keypress', function(e) {
            if (e.key === 'Enter') checkAuth();
        });
        
        showStatus('⏳ Ожидание авторизации...', 'info');
    }
    
    // Общие обработчики (работают всегда)
    document.getElementById('save-btn').addEventListener('click', saveDataToCloud);
    document.getElementById('sync-btn').addEventListener('click', syncFromCloud);
    document.getElementById('logout-btn').addEventListener('click', logout);
    document.getElementById('background-img').addEventListener('error', handleImageError);
});
