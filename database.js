// database.js
// Модуль для работы с облачным хранилищем данных на GitHub

// Константы репозитория GitHub
const GITHUB_OWNER = 'Alexandrpen';
const GITHUB_REPO = 'Shnek-Journal';
const GITHUB_DATA_FILE = 'journal-data.json';

class GitHubDatabase {
    constructor() {
        this.owner = GITHUB_OWNER;
        this.repo = GITHUB_REPO;
        this.branch = 'main';
        this.token = null;
        this.dataFile = GITHUB_DATA_FILE;
        this.cache = null;
        this.lastSync = null;
        this.CACHE_DURATION = 5 * 60 * 1000;
        
        // Инициализация токена при создании экземпляра
        this.token = localStorage.getItem('github_token');
    }

    // ===== МЕТОДЫ РАБОТЫ С ТОКЕНОМ =====

    setToken(token) {
        this.token = token;
        localStorage.setItem('github_token', token);
        console.log('GitHub token установлен');
    }

    getToken() {
        return this.token;
    }

    hasToken() {
        return !!this.token;
    }

    clearToken() {
        this.token = null;
        localStorage.removeItem('github_token');
        console.log('GitHub token очищен');
    }

    async requestToken() {
        return new Promise((resolve) => {
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
            
            if (token && token.trim()) {
                this.setToken(token.trim());
                resolve(true);
            } else {
                resolve(false);
            }
        });
    }

    // ===== ОСНОВНЫЕ МЕТОДЫ РАБОТЫ С GITHUB API =====

    async testConnection() {
        try {
            const headers = this.getHeaders();
            const response = await fetch(
                `https://api.github.com/repos/${this.owner}/${this.repo}`,
                { headers }
            );

            if (!response.ok) {
                // Для публичных репозиториев разрешаем доступ без токена
                if (response.status === 404) {
                    throw new Error('Репозиторий не найден');
                }
                if (response.status === 403 && !this.hasToken()) {
                    // Это нормально для гостя с публичным репозиторием
                    return true;
                }
                throw new Error(`Ошибка подключения: ${response.status}`);
            }

            console.log('Подключение к GitHub успешно');
            return true;
        } catch (error) {
            console.error('Ошибка подключения к GitHub:', error);
            
            // Для гостя без токена это не критическая ошибка
            if (!this.hasToken() && error.message.includes('403')) {
                console.log('Гостевой доступ к публичному репозиторию');
                return true;
            }
            
            throw error;
        }
    }

    async loadData() {
        // Проверяем кэш
        if (this.cache && this.lastSync && (Date.now() - this.lastSync) < this.CACHE_DURATION) {
            console.log('Используем кэшированные данные');
            return this.cache;
        }

        try {
            const headers = this.getHeaders();
            const response = await fetch(
                `https://api.github.com/repos/${this.owner}/${this.repo}/contents/${this.dataFile}`,
                { headers }
            );

            if (response.status === 404) {
                console.log('Файл данных не найден, создаем новый');
                const emptyData = { line1: {}, line2: {}, line3: {} };
                this.cache = emptyData;
                this.lastSync = Date.now();
                return emptyData;
            }

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                
                // Для гостя без токена и приватного репозитория - это нормально
                if (response.status === 403 && !this.hasToken()) {
                    console.log('Гостевой доступ: репозиторий приватный');
                    const emptyData = { line1: {}, line2: {}, line3: {} };
                    this.cache = emptyData;
                    this.lastSync = Date.now();
                    return emptyData;
                }
                
                if (response.status === 401 || response.status === 403) {
                    this.clearToken();
                    throw new Error('Неверный токен. Токен очищен.');
                }
                
                throw new Error(`Ошибка загрузки: ${response.status}`);
            }

            const data = await response.json();
            const content = this.decodeBase64(data.content);
            const journalData = JSON.parse(content);
            
            this.cache = journalData;
            this.lastSync = Date.now();
            
            console.log('Данные загружены из GitHub');
            return journalData;
        } catch (error) {
            console.error('Ошибка загрузки данных:', error);
            
            // Для гостя без токена возвращаем пустые данные
            if (!this.hasToken()) {
                console.log('Гость использует локальные данные');
                const emptyData = { line1: {}, line2: {}, line3: {} };
                this.cache = emptyData;
                this.lastSync = Date.now();
                return emptyData;
            }
            
            throw error;
        }
    }

    async saveData(journalData) {
        if (!this.hasToken()) {
            throw new Error('Сохранение запрещено. Требуется авторизация с токеном GitHub.');
        }

        try {
            let sha = null;
            
            // Получаем SHA текущего файла
            try {
                const headers = this.getHeaders();
                const currentFileResponse = await fetch(
                    `https://api.github.com/repos/${this.owner}/${this.repo}/contents/${this.dataFile}`,
                    { headers }
                );
                
                if (currentFileResponse.ok) {
                    const data = await currentFileResponse.json();
                    sha = data.sha;
                }
            } catch (e) {
                console.log('Файл данных не существует, создаем новый');
            }

            const content = this.encodeBase64(JSON.stringify(journalData, null, 2));
            const headers = this.getHeaders();
            
            const response = await fetch(
                `https://api.github.com/repos/${this.owner}/${this.repo}/contents/${this.dataFile}`,
                {
                    method: 'PUT',
                    headers: {
                        ...headers,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        message: `📊 Обновление данных: ${new Date().toLocaleString('ru-RU')}`,
                        content: content,
                        branch: this.branch,
                        sha: sha
                    })
                }
            );

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                
                if (response.status === 409) {
                    throw new Error('Конфликт версий. Попробуйте синхронизировать данные.');
                }
                
                if (response.status === 401 || response.status === 403) {
                    this.clearToken();
                    throw new Error('Неверный токен. Токен очищен.');
                }
                
                throw new Error(`Ошибка сохранения: ${response.status}`);
            }

            this.cache = journalData;
            this.lastSync = Date.now();
            
            console.log('Данные успешно сохранены в GitHub');
            return true;
        } catch (error) {
            console.error('Ошибка сохранения данных:', error);
            throw error;
        }
    }

    // ===== ВСПОМОГАТЕЛЬНЫЕ МЕТОДЫ =====

    getHeaders() {
        const headers = {
            'Accept': 'application/vnd.github.v3+json'
        };

        if (this.hasToken()) {
            headers['Authorization'] = `token ${this.getToken()}`;
        }

        return headers;
    }

    encodeBase64(str) {
        return btoa(unescape(encodeURIComponent(str)));
    }

    decodeBase64(str) {
        return decodeURIComponent(escape(atob(str)));
    }

    clearCache() {
        this.cache = null;
        this.lastSync = null;
    }
}

// Создаем глобальный экземпляр для использования в других модулях
const gitHubDB = new GitHubDatabase();
