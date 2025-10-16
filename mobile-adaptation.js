// mobile-adaptation.js
// Дополнительные функции для мобильных устройств

function initMobileAdaptation() {
    if (window.innerWidth <= 768) {
        // Оптимизации для мобильных устройств
        console.log('Мобильная версия активирована');
        
        // Упрощенная логика для мобильных
        setupMobileTouchEvents();
        optimizeForMobile();
    }
}

function setupMobileTouchEvents() {
    // Улучшенная обработка касаний для мобильных
    document.querySelectorAll('.input-field').forEach(field => {
        field.addEventListener('touchstart', function(e) {
            this.style.background = 'rgba(255, 255, 255, 0.98)';
        });
    });
}

function optimizeForMobile() {
    // Дополнительные оптимизации для мобильных
    const calendarElement = document.getElementById('calendar-display');
    if (calendarElement) {
        calendarElement.style.maxHeight = '300px';
        calendarElement.style.overflow = 'auto';
    }
}

// Инициализация при загрузке
document.addEventListener('DOMContentLoaded', initMobileAdaptation);
