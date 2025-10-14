// database.js
// Настройки GitHub для пользователя Alexandrpen
const GITHUB_OWNER = 'Alexandrpen';
const GITHUB_REPO = 'Shnek-Journal';

class GitHubDatabase {
    constructor() {
        this.owner = GITHUB_OWNER;
        this.repo = GITHUB_REPO;
        this.branch = 'main';
        this.token = null;
        this.dataFile = 'journal-data.json';
    }

    // Установка токена
    setToken(token) {
        this.token = token;
        localStorage.setItem('github_token', token);
        console.log('GitHub token установлен');
    }

    // Получение токена
    getToken() {
        if (!this.token) {
            this.token = localStorage.getItem('github_token');
        }
        return this.token;
    }

    // Проверка наличия токена
    hasToken() {
        return !!this.getToken();
    }

    // Очистка токена
    clearToken() {
        this.token = null;
        localStorage.removeItem('github_token');
        console.log('GitHub token очищен');
    }

    // Запрос токена у пользователя
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

    // Проверка подключения
    async testConnection() {
        if (!this.hasToken()) {
            throw new Error('GitHub token не установлен');
        }

        try {
            const response = await fetch(
                `https://api.github.com/repos/${this.owner}/${this.repo}`,
                {
                    headers: {
                        'Authorization': `token ${this.getToken()}`,
                        'Accept': 'application/vnd.github.v3+json'
                    }
                }
            );

            if (!response.ok) {
                throw new Error(`Ошибка подключения: ${response.status}`);
            }

            console.log('Подключение к GitHub успешно');
            return true;
        } catch (error) {
            console.error('Ошибка подключения к GitHub:', error);
            throw error;
        }
    }

    // Загрузка данных
    async loadData() {
        if (!this.hasToken()) {
            throw new Error('GitHub token не установлен');
        }

        try {
            const response = await fetch(
                `https://api.github.com/repos/${this.owner}/${this.repo}/contents/${this.dataFile}`,
                {
                    headers: {
                        'Authorization': `token ${this.getToken()}`,
                        'Accept': 'application/vnd.github.v3+json'
                    }
                }
            );

            if (response.status === 404) {
                console.log('Файл данных не найден, создаем новый');
                return { line1: {}, line2: {}, line3: {} };
            }

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(`Ошибка загрузки: ${response.status} - ${errorData.message || response.statusText}`);
            }

            const data = await response.json();
            const content = this.decodeBase64(data.content);
            const journalData = JSON.parse(content);
            
            console.log('Данные загружены из GitHub');
            return journalData;
        } catch (error) {
            console.error('Ошибка загрузки данных:', error);
            
            if (error.message.includes('401') || error.message.includes('403')) {
                this.clearToken();
                throw new Error('Неверный токен. Токен очищен. Введите новый токен.');
            }
            
            throw error;
        }
    }

    // Сохранение данных
    async saveData(journalData) {
        if (!this.hasToken()) {
            throw new Error('GitHub token не установлен');
        }

        try {
            let sha = null;
            try {
                const currentFile = await fetch(
                    `https://api.github.com/repos/${this.owner}/${this.repo}/contents/${this.dataFile}`,
                    {
                        headers: {
                            'Authorization': `token ${this.getToken()}`,
                            'Accept': 'application/vnd.github.v3+json'
                        }
                    }
                );
                
                if (currentFile.ok) {
                    const data = await currentFile.json();
                    sha = data.sha;
                }
            } catch (e) {
                console.log('Файл данных не существует, создаем новый');
            }

            const content = this.encodeBase64(JSON.stringify(journalData, null, 2));
            
            const response = await fetch(
                `https://api.github.com/repos/${this.owner}/${this.repo}/contents/${this.dataFile}`,
                {
                    method: 'PUT',
                    headers: {
                        'Authorization': `token ${this.getToken()}`,
                        'Accept': 'application/vnd.github.v3+json',
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
                
                if (response.status === 401 || response.status === 403) {
                    this.clearToken();
                    throw new Error('Неверный токен. Токен очищен.');
                }
                
                throw new Error(`Ошибка сохранения: ${response.status} - ${errorData.message || response.statusText}`);
            }

            console.log('Данные сохранены в GitHub');
            return true;
        } catch (error) {
            console.error('Ошибка сохранения данных:', error);
            throw error;
        }
    }

    // Кодирование в base64
    encodeBase64(str) {
        return btoa(unescape(encodeURIComponent(str)));
    }

    // Декодирование из base64
    decodeBase64(str) {
        return decodeURIComponent(escape(atob(str)));
    }
}

// Создаем глобальный экземпляр
const gitHubDB = new GitHubDatabase();