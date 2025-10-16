// database.js
// Модуль для работы с облачным хранилищем данных на GitHub

// Константы репозитория GitHub
const GITHUB_OWNER = 'Alexandrpen'; // Владелец репозитория
const GITHUB_REPO = 'Shnek-Journal'; // Название репозитория

// Класс для работы с GitHub API как с базой данных
class GitHubDatabase {
    constructor() {
        // Инициализация свойств класса
        this.owner = GITHUB_OWNER;
        this.repo = GITHUB_REPO;
        this.branch = 'main'; // Ветка репозитория по умолчанию
        this.token = null; // Токен авторизации (устанавливается позже)
        this.dataFile = 'journal-data.json'; // Файл для хранения данных
    }

    // ===== МЕТОДЫ РАБОТЫ С ТОКЕНОМ =====

    // Установка токена авторизации
    setToken(token) {
        this.token = token;
        localStorage.setItem('github_token', token); // Сохранение в localStorage
        console.log('GitHub token установлен');
    }

    // Получение токена из памяти или localStorage
    getToken() {
        if (!this.token) {
            this.token = localStorage.getItem('github_token'); // Загрузка из localStorage
        }
        return this.token;
    }

    // Проверка наличия токена
    hasToken() {
        return !!this.getToken(); // Преобразование в boolean
    }

    // Очистка токена (при ошибках авторизации)
    clearToken() {
        this.token = null;
        localStorage.removeItem('github_token'); // Удаление из localStorage
        console.log('GitHub token очищен');
    }

    // Запрос токена у пользователя через диалоговое окно
    async requestToken() {
        return new Promise((resolve) => {
            // Показ диалога с инструкциями
            const token = prompt(
                '🔐 ДЛЯ ОБЛАЧНОЙ СИНХРОНИЗАЦИИ 🔐\n\n' +
                'Требуется GitHub Personal Access Token\n\n' +
                'Инструкция по созданию токена:\n' +
                '1. Зайдите на GitHub.com → Settings → Developer settings\n' +
                '2. Выберите "Personal access tokens" → "Tokens (classic)"\n' +
                '3. Нажмите "Generate new token"\n' +
                '4. Название: "Shnek Journal"\n' +
                '5. Срок: "No expiration" (рекомендуется)\n' +
                '6. Права: ✅ Отметьте "repo" (полный контроль)\n' +
                '7. Скопируйте токен и вставьте ниже:\n\n' +
                'Токен начинается с ghp_...'
            );
            
            // Обработка введенного токена
            if (token && token.trim()) {
                this.setToken(token.trim()); // Сохранение токена
                resolve(true); // Успешное завершение
            } else {
                resolve(false); // Пользователь отменил ввод
            }
        });
    }

    // ===== МЕТОДЫ РАБОТЫ С API GITHUB =====

    // Проверка подключения к репозиторию
    async testConnection() {
        if (!this.hasToken()) {
            throw new Error('GitHub token не установлен');
        }

        try {
            // Запрос информации о репозитории
            const response = await fetch(
                `https://api.github.com/repos/${this.owner}/${this.repo}`,
                {
                    headers: {
                        'Authorization': `token ${this.getToken()}`, // Авторизация
                        'Accept': 'application/vnd.github.v3+json' // Формат ответа
                    }
                }
            );

            // Проверка статуса ответа
            if (!response.ok) {
                throw new Error(`Ошибка подключения: ${response.status}`);
            }

            console.log('Подключение к GitHub успешно');
            return true;
        } catch (error) {
            console.error('Ошибка подключения к GitHub:', error);
            throw error; // Проброс ошибки для обработки выше
        }
    }

    // Загрузка данных из репозитория с повторными попытками
    async loadData() {
        if (!this.hasToken()) {
            throw new Error('GitHub token не установлен');
        }

        let retries = 3; // Количество попыток при конфликтах
        
        while (retries > 0) {
            try {
                // Запрос содержимого файла данных
                const response = await fetch(
                    `https://api.github.com/repos/${this.owner}/${this.repo}/contents/${this.dataFile}`,
                    {
                        headers: {
                            'Authorization': `token ${this.getToken()}`,
                            'Accept': 'application/vnd.github.v3+json'
                        }
                    }
                );

                // Обработка случая когда файл не существует
                if (response.status === 404) {
                    console.log('Файл данных не найден, создаем новый');
                    return { line1: {}, line2: {}, line3: {} }; // Пустая структура
                }

                // Обработка ошибок HTTP
                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({}));
                    
                    // Повторная попытка при конфликте версий (409)
                    if (response.status === 409 && retries > 1) {
                        retries--;
                        console.log(`Конфликт версий при загрузке. Повторная попытка... (осталось: ${retries})`);
                        await this.delay(1000); // Задержка перед повторной попыткой
                        continue;
                    }
                    
                    throw new Error(`Ошибка загрузки: ${response.status} - ${errorData.message || response.statusText}`);
                }

                // Обработка успешного ответа
                const data = await response.json();
                const content = this.decodeBase64(data.content); // Декодирование base64
                const journalData = JSON.parse(content); // Парсинг JSON
                
                console.log('Данные загружены из GitHub');
                return journalData;
            } catch (error) {
                // Обработка ошибок с повторными попытками
                if (error.message.includes('409') && retries > 1) {
                    retries--;
                    console.log(`Конфликт версий при загрузке. Повторная попытка... (осталось: ${retries})`);
                    await this.delay(1000);
                    continue;
                }
                
                console.error('Ошибка загрузки данных:', error);
                
                // Очистка токена при ошибках авторизации
                if (error.message.includes('401') || error.message.includes('403')) {
                    this.clearToken();
                    throw new Error('Неверный токен. Токен очищен. Введите новый токен.');
                }
                
                throw error; // Проброс других ошибок
            }
        }
    }

    // Сохранение данных в репозиторий с обработкой конфликтов
    async saveData(journalData) {
        if (!this.hasToken()) {
            throw new Error('GitHub token не установлен');
        }

        let retries = 3; // Количество попыток при конфликтах
        
        while (retries > 0) {
            try {
                // Получаем актуальный SHA текущего файла для предотвращения конфликтов
                let sha = null;
                try {
                    const currentFileResponse = await fetch(
                        `https://api.github.com/repos/${this.owner}/${this.repo}/contents/${this.dataFile}`,
                        {
                            headers: {
                                'Authorization': `token ${this.getToken()}`,
                                'Accept': 'application/vnd.github.v3+json'
                            }
                        }
                    );
                    
                    // Если файл существует, получаем его SHA
                    if (currentFileResponse.ok) {
                        const data = await currentFileResponse.json();
                        sha = data.sha; // SHA для контроля версий
                        console.log('Получен актуальный SHA файла:', sha.substring(0, 8) + '...');
                    }
                } catch (e) {
                    // Файл не существует - это нормально для первого сохранения
                    console.log('Файл данных не существует, создаем новый');
                }

                // Подготовка данных для отправки
                const content = this.encodeBase64(JSON.stringify(journalData, null, 2)); // Кодирование в base64
                
                // Отправка данных на GitHub
                const response = await fetch(
                    `https://api.github.com/repos/${this.owner}/${this.repo}/contents/${this.dataFile}`,
                    {
                        method: 'PUT', // Создание или обновление файла
                        headers: {
                            'Authorization': `token ${this.getToken()}`,
                            'Accept': 'application/vnd.github.v3+json',
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            message: `📊 Обновление данных: ${new Date().toLocaleString('ru-RU')}`, // Коммит-сообщение
                            content: content, // Закодированное содержимое
                            branch: this.branch, // Ветка
                            sha: sha // SHA для контроля версий (null для нового файла)
                        })
                    }
                );

                // Обработка ответа от GitHub
                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({}));
                    
                    // Обработка конфликта версий (409) с повторной попыткой
                    if (response.status === 409 && retries > 1) {
                        retries--;
                        console.log(`Конфликт версий при сохранении. Обновляю SHA и повторяю... (осталось: ${retries})`);
                        await this.delay(1000);
                        continue;
                    }
                    
                    // Очистка токена при ошибках авторизации
                    if (response.status === 401 || response.status === 403) {
                        this.clearToken();
                        throw new Error('Неверный токен. Токен очищен.');
                    }
                    
                    throw new Error(`Ошибка сохранения: ${response.status} - ${errorData.message || response.statusText}`);
                }

                console.log('Данные успешно сохранены в GitHub');
                return true;
            } catch (error) {
                // Обработка ошибок с повторными попытками
                if (error.message.includes('409') && retries > 1) {
                    retries--;
                    console.log(`Конфликт версий при сохранении. Повторная попытка... (осталось: ${retries})`);
                    await this.delay(1000);
                    continue;
                }
                
                console.error('Ошибка сохранения данных:', error);
                throw error; // Проброс ошибки после всех попыток
            }
        }
        
        // Если все попытки исчерпаны
        throw new Error('Не удалось сохранить данные после нескольких попыток');
    }

    // ===== ВСПОМОГАТЕЛЬНЫЕ МЕТОДЫ =====

    // Функция задержки для повторных попыток
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    // Кодирование строки в base64 (совместимость с GitHub API)
    encodeBase64(str) {
        return btoa(unescape(encodeURIComponent(str)));
    }

    // Декодирование из base64
    decodeBase64(str) {
        return decodeURIComponent(escape(atob(str)));
    }
}

// Создаем глобальный экземпляр для использования в других модулях
const gitHubDB = new GitHubDatabase();