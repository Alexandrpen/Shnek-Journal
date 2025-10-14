// database.js
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

    // Загрузка данных с повторными попытками
    async loadData() {
        if (!this.hasToken()) {
            throw new Error('GitHub token не установлен');
        }

        let retries = 3;
        
        while (retries > 0) {
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
                    
                    if (response.status === 409 && retries > 1) {
                        retries--;
                        console.log(`Конфликт версий при загрузке. Повторная попытка... (осталось: ${retries})`);
                        await this.delay(1000);
                        continue;
                    }
                    
                    throw new Error(`Ошибка загрузки: ${response.status} - ${errorData.message || response.statusText}`);
                }

                const data = await response.json();
                const content = this.decodeBase64(data.content);
                const journalData = JSON.parse(content);
                
                console.log('Данные загружены из GitHub');
                return journalData;
            } catch (error) {
                if (error.message.includes('409') && retries > 1) {
                    retries--;
                    console.log(`Конфликт версий при загрузке. Повторная попытка... (осталось: ${retries})`);
                    await this.delay(1000);
                    continue;
                }
                
                console.error('Ошибка загрузки данных:', error);
                
                if (error.message.includes('401') || error.message.includes('403')) {
                    this.clearToken();
                    throw new Error('Неверный токен. Токен очищен. Введите новый токен.');
                }
                
                throw error;
            }
        }
    }

    // Сохранение данных с обработкой конфликтов
    async saveData(journalData) {
        if (!this.hasToken()) {
            throw new Error('GitHub token не установлен');
        }

        let retries = 3;
        
        while (retries > 0) {
            try {
                // Получаем актуальный SHA текущего файла
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
                    
                    if (currentFileResponse.ok) {
                        const data = await currentFileResponse.json();
                        sha = data.sha;
                        console.log('Получен актуальный SHA файла:', sha.substring(0, 8) + '...');
                    }
                } catch (e) {
                    // Файл не существует, это нормально для первого сохранения
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
                            sha: sha // Используем актуальный SHA или null для нового файла
                        })
                    }
                );

                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({}));
                    
                    // Обработка конфликта версий (409)
                    if (response.status === 409 && retries > 1) {
                        retries--;
                        console.log(`Конфликт версий при сохранении. Обновляю SHA и повторяю... (осталось: ${retries})`);
                        await this.delay(1000);
                        continue;
                    }
                    
                    if (response.status === 401 || response.status === 403) {
                        this.clearToken();
                        throw new Error('Неверный токен. Токен очищен.');
                    }
                    
                    throw new Error(`Ошибка сохранения: ${response.status} - ${errorData.message || response.statusText}`);
                }

                console.log('Данные успешно сохранены в GitHub');
                return true;
            } catch (error) {
                if (error.message.includes('409') && retries > 1) {
                    retries--;
                    console.log(`Конфликт версий при сохранении. Повторная попытка... (осталось: ${retries})`);
                    await this.delay(1000);
                    continue;
                }
                
                console.error('Ошибка сохранения данных:', error);
                throw error;
            }
        }
        
        throw new Error('Не удалось сохранить данные после нескольких попыток');
    }

    // Вспомогательная функция для задержки
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
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
